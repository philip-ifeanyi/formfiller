import { FieldDetector } from '../lib/field-detector'
import { InteractionManager } from '../lib/interaction-manager'
import {
	CONTENT_COMMAND_TYPES,
	type BackgroundRequestMessage,
	type BackgroundResponseMessage,
	type ContentCommandMessage,
	type ContentResponseMessage,
	type FieldDebugTrace,
	type ExtensionSettings,
	type FieldReviewItem,
	type FieldInfo,
	type FillResult,
	type FormControlElement,
	 type FormSnapshot,
	type ProfileData
} from '../types'
import { validateMessage } from '../lib/security'

const SUPPORTED_FIELD_SELECTOR = [
	'input',
	'textarea',
	'select',
	'[role="combobox"]',
	'[role="listbox"]',
	'[role="switch"]',
	'[role="radiogroup"]',
	'[role="spinbutton"]',
	'button[aria-haspopup="listbox"][aria-controls]'
].join(', ')

const PAGE_FILL_CONTINUATION_POLICY = {
	maxPasses: 4,
	waitMs: 900
} as const

function isProfileDataResponse(response: BackgroundResponseMessage | null): response is { profileData: ProfileData } {
	return Boolean(response && 'profileData' in response)
}

function isErrorResponse(response: BackgroundResponseMessage | null): response is { error: string } {
	return Boolean(response && 'error' in response)
}

function isSettingsResponse(response: BackgroundResponseMessage | null): response is { settings: ExtensionSettings } {
	return Boolean(response && 'settings' in response)
}

export class FormFillaContent {
	private fieldDetector: FieldDetector
	private interactionManager: InteractionManager
	private mutationObserver: MutationObserver | null = null
	private observedForms: Set<string> = new Set()
	private pageControlsEnabled = true
	private fillableFormCount = 0
	private floatingActionButtonHost: HTMLDivElement | null = null
	private floatingActionButton: HTMLButtonElement | null = null
	private floatingActionButtonBadge: HTMLSpanElement | null = null
	private floatingActionButtonLabel: HTMLSpanElement | null = null
	private isPageFillInProgress = false
	private debugModeEnabled = false
	private pageMutationVersion = 0
	private pageMutationWaiters = new Set<() => void>()

	constructor() {
		this.fieldDetector = new FieldDetector()
		this.interactionManager = new InteractionManager()

		this.initialize()
	}

	private initialize(): void {
		const start = () => {
			void this.setup()
		}

		// Wait for DOM to be ready
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', start, { once: true })
		} else {
			start()
		}

		// Set up message listener for background script communication
		chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
			void this.handleMessage(message, sender, sendResponse)
			return true // Keep the message channel open for async responses
		})
	}

	private async setup(): Promise<void> {
		await this.loadPageControlSettings()
		this.setupFormDetection()
	}

	private async handleMessage(message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: ContentResponseMessage) => void): Promise<void> {
		// Validate message structure and source
		const validation = validateMessage(message, CONTENT_COMMAND_TYPES)

		if (!validation.isValid) {
			console.warn('FormFilla: Invalid message received:', validation.error)
			sendResponse({ error: 'Invalid message format' })
			return
		}

		// Validate sender (should be from extension background script)
		if (!sender.id || sender.id !== chrome.runtime.id) {
			console.warn('FormFilla: Message from unauthorized extension')
			sendResponse({ error: 'Unauthorized sender' })
			return
		}

		const typedMessage = message as ContentCommandMessage

		try {
			if (typedMessage.type === 'fillForm' || typedMessage.type === 'reviewFields') {
				await this.loadPageControlSettings()
			}

			switch (typedMessage.type) {
				case 'fillField':
					this.interactionManager.handleMessage(typedMessage)
					sendResponse({ success: true })
					break

				case 'fillForm':
					const results = typedMessage.profileData
						? await this.handleFormFillRequest(typedMessage.profileData)
						: await this.fillAllFormsOnPage()
					this.logDebugTraces('fill', this.extractDebugTracesFromResults(results))
					sendResponse({ success: true, results })
					break

				case 'reviewFields':
					const items = typedMessage.profileData
						? this.reviewAllFormsOnPage(typedMessage.profileData)
						: await this.reviewAllFormsWithDefaultProfile()
					this.logDebugTraces('review', this.extractDebugTracesFromReviewItems(items))
					sendResponse({ success: true, items })
					break

				case 'getFormFields':
					const snapshots = this.getDetectedFormSnapshots()
					const fieldCount = snapshots.reduce((count, snapshot) => count + snapshot.candidates.length, 0)
					sendResponse({ formCount: snapshots.length, fieldCount })
					break

				case 'highlightField':
					// Future feature - highlight specific field
					sendResponse({ success: true })
					break

				default:
					sendResponse({ error: 'Unknown message type' })
			}
		} catch (error) {
			console.error('FormFilla: Error handling message:', error)
			sendResponse({ error: 'Internal error' })
		}
	}

	private async handleFormFillRequest(profileData: ProfileData): Promise<FillResult[]> {
		const processedSnapshots = new Set<string>()
		const resultsByCandidateId = new Map<string, FillResult>()

		for (let pass = 1; pass <= PAGE_FILL_CONTINUATION_POLICY.maxPasses; pass += 1) {
			const baselineMutationVersion = this.pageMutationVersion
			const pendingSnapshots = this.getDetectedFormSnapshots()
				.filter(snapshot => snapshot.candidates.length > 0)
				.filter(snapshot => !processedSnapshots.has(this.getSnapshotContinuationKey(snapshot)))

			if (pendingSnapshots.length === 0) {
				if (pass === 1) {
					break
				}

				const observedMutation = await this.waitForPageMutation(
					baselineMutationVersion,
					PAGE_FILL_CONTINUATION_POLICY.waitMs
				)
				if (!observedMutation) {
					break
				}

				continue
			}

			for (const snapshot of pendingSnapshots) {
				processedSnapshots.add(this.getSnapshotContinuationKey(snapshot))
				const results = await this.interactionManager.fillFormWithProfile(snapshot.form, profileData)
				results.forEach(result => {
					resultsByCandidateId.set(result.candidateId, result)
				})
			}

			const hasImmediateNextStep = this.getDetectedFormSnapshots()
				.filter(snapshot => snapshot.candidates.length > 0)
				.some(snapshot => !processedSnapshots.has(this.getSnapshotContinuationKey(snapshot)))

			if (hasImmediateNextStep) {
				continue
			}

			if (pass >= PAGE_FILL_CONTINUATION_POLICY.maxPasses) {
				break
			}

			const observedMutation = await this.waitForPageMutation(
				baselineMutationVersion,
				PAGE_FILL_CONTINUATION_POLICY.waitMs
			)
			if (!observedMutation) {
				break
			}
		}

		return Array.from(resultsByCandidateId.values())
	}

	private async fillAllFormsOnPage(): Promise<FillResult[]> {
		const profileData = await this.getDefaultProfileDataWithRetry()
		if (!profileData) {
			console.warn('FormFilla: No profile data received after retries')
			this.showUserMessage('FormFilla: Unable to get profile data. Please try again.')
			return []
		}

		return this.handleFormFillRequest(profileData)
	}

	private async reviewAllFormsWithDefaultProfile(): Promise<FieldReviewItem[]> {
		const profileData = await this.getDefaultProfileDataWithRetry()
		if (!profileData) {
			console.warn('FormFilla: No profile data received after retries')
			return []
		}

		return this.reviewAllFormsOnPage(profileData)
	}

	private reviewAllFormsOnPage(profileData: ProfileData): FieldReviewItem[] {
		return this.getDetectedForms().flatMap(form => this.interactionManager.reviewFormWithProfile(form, profileData))
	}

	private async loadPageControlSettings(): Promise<void> {
		const response = await this.sendMessageSafely({ type: 'getSettings' })
		if (!isSettingsResponse(response)) {
			return
		}

		this.pageControlsEnabled = response.settings.showButtons && response.settings.autoFillEnabled
		this.debugModeEnabled = Boolean(response.settings.debugMode)
	}

	private setupFormDetection(): void {
		// Initial scan for forms
		this.scanForms()

		// Set up mutation observer to watch for dynamically added forms and controls
		this.mutationObserver = new MutationObserver((mutations) => {
			let shouldScan = false
			const affectedForms = new Set<HTMLFormElement>()

			mutations.forEach((mutation) => {
				if (mutation.type === 'childList') {
					this.collectAffectedForms(mutation.target, affectedForms)

					mutation.addedNodes.forEach((node) => {
						if (node.nodeType === Node.ELEMENT_NODE) {
							const element = node as Element
							if (this.isRelevantFormMutation(element)) {
								shouldScan = true
							}
							this.collectAffectedForms(element, affectedForms)
						}
					})

					mutation.removedNodes.forEach((node) => {
						if (node.nodeType === Node.ELEMENT_NODE) {
							const element = node as Element
							if (this.isRelevantFormMutation(element)) {
								shouldScan = true
							}
							this.collectAffectedForms(element, affectedForms)
						}
					})
				}
			})

			affectedForms.forEach(form => {
				this.interactionManager.notifyFormMutation(form)
			})

			if (shouldScan || affectedForms.size > 0) {
				this.notifyPageMutation()
			}

			if (shouldScan) {
				this.scanForms()
			}
		})

		this.mutationObserver.observe(document.body, {
			childList: true,
			subtree: true
		})

		this.setupEventListeners()
	}

	private isRelevantFormMutation(element: Element): boolean {
		return element.tagName === 'FORM' ||
			element.matches(SUPPORTED_FIELD_SELECTOR) ||
			Boolean((element as HTMLElement).shadowRoot) ||
			Boolean(element.querySelector(`form, ${SUPPORTED_FIELD_SELECTOR}`))
	}

	private collectAffectedForms(node: Node, affectedForms: Set<HTMLFormElement>): void {
		if (!(node instanceof Element)) {
			return
		}

		const ownerForm = node instanceof HTMLFormElement ? node : node.closest('form')
		if (ownerForm instanceof HTMLFormElement) {
			affectedForms.add(ownerForm)
		}

		if (node instanceof HTMLElement) {
			this.collectFormsFromRoot(node).forEach(form => affectedForms.add(form))
		}

		if (node instanceof HTMLElement && node.shadowRoot) {
			this.collectFormsFromRoot(node.shadowRoot).forEach(form => affectedForms.add(form))
		}
	}

	private setupEventListeners(): void {
		// Field focus/blur events for individual field buttons
		document.addEventListener('focus', this.handleFieldFocus.bind(this), true)
		document.addEventListener('blur', this.handleFieldBlur.bind(this), true)

		// Context menu events
		document.addEventListener('contextmenu', this.handleContextMenu.bind(this))

		// Form submission events to clean up
		document.addEventListener('submit', this.handleFormSubmit.bind(this))
	}

	private scanForms(): void {
		const snapshots = this.fieldDetector.collectFormSnapshots(document)
		let fillableFormCount = 0

		snapshots.forEach((snapshot, index) => {
			const fields = this.fieldDetector.detectFieldsFromSnapshot(snapshot)
			if (fields.size === 0) return

			fillableFormCount += 1

			if (this.observedForms.has(snapshot.domSignature)) return

			if (this.pageControlsEnabled) {
				this.addFormFillButton(snapshot.form, fields, index, snapshot.domSignature)
			}

			this.observedForms.add(snapshot.domSignature)
		})

		this.fillableFormCount = fillableFormCount
		this.updateFloatingActionButton()
	}

	private addFormFillButton(form: HTMLFormElement, _fields: Map<HTMLElement, FieldInfo>, _index: number, formSignature: string): void {
		// Check if button already exists
		if (form.querySelector('.formfilla-form-btn')) return

		const button = document.createElement('button')
		button.textContent = '🔧 Fill Form'
		button.className = 'formfilla-form-btn'
		button.type = 'button'
		button.title = 'Fill entire form with FormFilla'

		button.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 10000;
      padding: 5px 10px;
      background: #4CAF50;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      transition: all 0.2s ease;
    `

		// Hover effects
		button.addEventListener('mouseenter', () => {
			button.style.background = '#45a049'
			button.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)'
		})

		button.addEventListener('mouseleave', () => {
			button.style.background = '#4CAF50'
			button.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)'
		})

		button.addEventListener('click', (e) => {
			e.preventDefault()
			e.stopPropagation()
			void this.fillForm(form)
		})

		// Position relative to form
		if (form.style.position === '' || form.style.position === 'static') {
			form.style.position = 'relative'
		}

		form.dataset.formfillaSnapshot = formSignature
		form.appendChild(button)
	}

	private updateFloatingActionButton(): void {
		if (!this.pageControlsEnabled || this.fillableFormCount === 0) {
			this.removeFloatingActionButton()
			return
		}

		const button = this.ensureFloatingActionButton()
		button.title = this.fillableFormCount === 1
			? 'Fill 1 detected form with FormFilla'
			: `Fill ${this.fillableFormCount} detected forms with FormFilla`

		if (this.floatingActionButtonBadge) {
			this.floatingActionButtonBadge.textContent = this.isPageFillInProgress ? '…' : String(this.fillableFormCount)
		}

		if (this.floatingActionButtonLabel) {
			this.floatingActionButtonLabel.textContent = this.isPageFillInProgress ? 'Filling…' : 'Fill Page'
		}

		button.disabled = this.isPageFillInProgress
	}

	private ensureFloatingActionButton(): HTMLButtonElement {
		if (this.floatingActionButtonHost && this.floatingActionButton) {
			return this.floatingActionButton
		}

		const host = document.createElement('div')
		host.className = 'formfilla-floating-action-host'
		host.style.cssText = `
			position: fixed;
			right: 18px;
			bottom: 18px;
			z-index: 2147483646;
		`

		const shadowRoot = host.attachShadow({ mode: 'open' })
		const styles = document.createElement('style')
		styles.textContent = `
			:host {
				all: initial;
			}

			button {
				all: unset;
				box-sizing: border-box;
				display: inline-flex;
				align-items: center;
				gap: 8px;
				height: 44px;
				padding: 0 14px;
				border-radius: 999px;
				background: rgba(22, 93, 74, 0.96);
				color: #fffdf8;
				font: 600 13px/1 'Trebuchet MS', 'Lucida Sans Unicode', sans-serif;
				box-shadow: 0 14px 30px rgba(17, 45, 36, 0.18);
				cursor: pointer;
				transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
			}

			button:hover {
				transform: translateY(-1px);
				box-shadow: 0 18px 34px rgba(17, 45, 36, 0.22);
			}

			button:focus-visible {
				outline: 2px solid #fffdf8;
				outline-offset: 2px;
			}

			button:disabled {
				cursor: progress;
				opacity: 0.82;
				transform: none;
				box-shadow: 0 10px 18px rgba(17, 45, 36, 0.18);
			}

			.formfilla-fab__badge {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				width: 22px;
				height: 22px;
				border-radius: 999px;
				background: rgba(255, 255, 255, 0.14);
				font-size: 12px;
				font-weight: 700;
			}

			.formfilla-fab__label {
				white-space: nowrap;
			}
		`

		const button = document.createElement('button')
		button.type = 'button'
		button.setAttribute('aria-label', 'Fill current page with FormFilla')

		const badge = document.createElement('span')
		badge.className = 'formfilla-fab__badge'

		const label = document.createElement('span')
		label.className = 'formfilla-fab__label'

		button.appendChild(badge)
		button.appendChild(label)
		button.addEventListener('click', (event) => {
			event.preventDefault()
			event.stopPropagation()
			void this.handleFloatingActionButtonClick()
		})

		shadowRoot.append(styles, button)
		document.body.appendChild(host)

		this.floatingActionButtonHost = host
		this.floatingActionButton = button
		this.floatingActionButtonBadge = badge
		this.floatingActionButtonLabel = label

		return button
	}

	private removeFloatingActionButton(): void {
		this.floatingActionButtonHost?.remove()
		this.floatingActionButtonHost = null
		this.floatingActionButton = null
		this.floatingActionButtonBadge = null
		this.floatingActionButtonLabel = null
	}

	private async handleFloatingActionButtonClick(): Promise<void> {
		if (this.isPageFillInProgress) {
			return
		}

		await this.loadPageControlSettings()
		this.isPageFillInProgress = true
		this.updateFloatingActionButton()

		try {
			const results = await this.fillAllFormsOnPage()
			this.logDebugTraces('floating-fill', this.extractDebugTracesFromResults(results))
			if (results.length === 0) {
				return
			}

			const filledCount = results.filter(result => result.status === 'filled').length
			const issueCount = results.length - filledCount
			const issueSummary = issueCount > 0
				? ` ${issueCount} field${issueCount === 1 ? ' needs' : 's need'} review or retry.`
				: ''

			this.showUserMessage(
				`FormFilla: Filled ${filledCount} of ${results.length} fields across ${this.fillableFormCount} form${this.fillableFormCount === 1 ? '' : 's'}.${issueSummary}`
			)
		} finally {
			this.isPageFillInProgress = false
			this.updateFloatingActionButton()
		}
	}

	private handleFieldFocus(event: FocusEvent): void {
		const target = event.target as HTMLElement

		if (this.isFormField(target)) {
			const fieldInfo = this.fieldDetector.detectField(target as FormControlElement)

			if (fieldInfo) {
				this.interactionManager.addButton(target, fieldInfo)
				this.interactionManager.enhanceContextMenu(target, fieldInfo)
			}
		}
	}

	private handleFieldBlur(event: FocusEvent): void {
		const target = event.target as HTMLElement

		if (this.isFormField(target)) {
			// Remove button after a short delay to allow for clicking
			setTimeout(() => {
				this.interactionManager.removeButton(target)
			}, 200)
		}
	}

	private handleContextMenu(event: MouseEvent): void {
		const target = event.target as HTMLElement

		if (this.isFormField(target)) {
			const fieldInfo = this.fieldDetector.detectField(target as FormControlElement)
			this.interactionManager.enhanceContextMenu(target, fieldInfo)
		}
	}

	private handleFormSubmit(event: SubmitEvent): void {
		// Clean up any buttons when form is submitted
		const form = event.target as HTMLFormElement
		const formButton = form.querySelector('.formfilla-form-btn')
		const snapshotSignature = form.dataset.formfillaSnapshot
		if (formButton) {
			formButton.remove()
		}
		if (snapshotSignature) {
			this.observedForms.delete(snapshotSignature)
		}
	}

	private isExtensionContextValid(): boolean {
		try {
			// Check if chrome.runtime is available and extension context is valid
			return !!(chrome.runtime && chrome.runtime.id)
		} catch (error) {
			console.warn('FormFilla: Extension context invalidated')
			return false
		}
	}

	private async sendMessageSafely<TResponse extends BackgroundResponseMessage>(message: BackgroundRequestMessage, timeout: number = 5000): Promise<TResponse | null> {
		return new Promise((resolve) => {
			if (!this.isExtensionContextValid()) {
				console.warn('FormFilla: Extension context invalidated, cannot send message')
				resolve(null)
				return
			}

			const timeoutId = setTimeout(() => {
				console.warn('FormFilla: Message timeout after', timeout, 'ms')
				resolve(null)
			}, timeout)

			try {
				chrome.runtime.sendMessage(message, (response) => {
					clearTimeout(timeoutId)

					if (chrome.runtime.lastError) {
						console.error('FormFilla: Runtime error:', chrome.runtime.lastError)
						// Check if it's a connection error
						if (chrome.runtime.lastError.message?.includes('Receiving end does not exist')) {
							console.warn('FormFilla: Background script not ready or extension context invalid')
						}
						resolve(null)
						return
					}

					resolve((response ?? null) as TResponse | null)
				})
			} catch (error) {
				clearTimeout(timeoutId)
				console.error('FormFilla: Error sending message:', error)
				resolve(null)
			}
		})
	}

	private async getDefaultProfileDataWithRetry(): Promise<ProfileData | null> {
		let response = null
		let retryCount = 0
		const maxRetries = 3

		while (retryCount < maxRetries && !response) {
			response = await this.sendMessageSafely({ type: 'getDefaultProfileData' })

			if (isErrorResponse(response)) {
				console.warn('FormFilla: Background error while fetching profile data:', response.error)
				response = null
			}

			if (!response && retryCount < maxRetries - 1) {
				console.log(`FormFilla: Retry ${retryCount + 1}/${maxRetries} - waiting for background script...`)
				await new Promise(resolve => setTimeout(resolve, 500))
				retryCount += 1
			} else {
				break
			}
		}

		return isProfileDataResponse(response) ? response.profileData : null
	}

	private extractDebugTracesFromResults(results: FillResult[]): FieldDebugTrace[] {
		return results
			.map(result => result.debug)
			.filter((trace): trace is FieldDebugTrace => Boolean(trace))
	}

	private extractDebugTracesFromReviewItems(items: FieldReviewItem[]): FieldDebugTrace[] {
		return items
			.map(item => item.debug)
			.filter((trace): trace is FieldDebugTrace => Boolean(trace))
	}

	private logDebugTraces(channel: 'fill' | 'review' | 'floating-fill', traces: FieldDebugTrace[]): void {
		if (!this.debugModeEnabled || traces.length === 0) {
			return
		}

		const summaryRows = traces.map(trace => ({
			label: trace.label,
			status: trace.status,
			field: trace.fieldKey,
			confidence: trace.confidence.toFixed(2),
			adapter: trace.adapterId,
			selected: trace.selectedValuePreview || 'n/a',
			applied: trace.appliedValuePreview || 'n/a',
			retry: `${trace.retryAttemptsUsed}/${trace.retryMaxAttempts} ${trace.retryStrategy}`
		}))

		console.groupCollapsed(`FormFilla debug: ${channel} (${traces.length} traces)`)
		console.table(summaryRows)
		console.log('FormFilla field traces', traces)
		console.groupEnd()
	}

	private async fillForm(form: HTMLFormElement): Promise<FillResult[]> {
		try {
			const profileData = await this.getDefaultProfileDataWithRetry()
			if (!profileData) {
				console.warn('FormFilla: No profile data received after retries')
				this.showUserMessage('FormFilla: Unable to get profile data. Please try again.')
				return []
			}

			return await this.interactionManager.fillFormWithProfile(form, profileData)
		} catch (error) {
			console.error('FormFilla: Failed to get profile data:', error)
			this.showUserMessage('FormFilla: Unable to fill form. Please try again.')
			return []
		}
	}

	private getDetectedFormSnapshots() {
		return this.fieldDetector.collectFormSnapshots(document)
	}

	private getSnapshotContinuationKey(snapshot: FormSnapshot): string {
		const candidateDescriptors = snapshot.candidates.map(candidate => {
			return [
				candidate.domSignature,
				candidate.labelText || '',
				candidate.attributes.name || '',
				candidate.placeholder || ''
			].join('::')
		})

		return [snapshot.domSignature, ...candidateDescriptors].join('||')
	}

	private getDetectedForms(): HTMLFormElement[] {
		const formsBySignature = new Map<string, HTMLFormElement>()
		this.getDetectedFormSnapshots().forEach(snapshot => {
			formsBySignature.set(snapshot.domSignature, snapshot.form)
		})

		return Array.from(formsBySignature.values())
	}

	private collectFormsFromRoot(root: HTMLElement | ShadowRoot): HTMLFormElement[] {
		const formsBySignature = new Map<string, HTMLFormElement>()
		this.fieldDetector.collectFormSnapshots(root).forEach(snapshot => {
			formsBySignature.set(snapshot.domSignature, snapshot.form)
		})

		return Array.from(formsBySignature.values())
	}

	private notifyPageMutation(): void {
		this.pageMutationVersion += 1
		const waiters = Array.from(this.pageMutationWaiters)
		this.pageMutationWaiters.clear()
		waiters.forEach(waiter => waiter())
	}

	private waitForPageMutation(baselineMutationVersion: number, timeoutMs: number): Promise<boolean> {
		if (this.pageMutationVersion > baselineMutationVersion) {
			return Promise.resolve(true)
		}

		return new Promise(resolve => {
			let settled = false
			const finalize = () => {
				if (settled) {
					return
				}

				settled = true
				clearTimeout(timeoutId)
				this.pageMutationWaiters.delete(onWake)
				resolve(this.pageMutationVersion > baselineMutationVersion)
			}

			const onWake = () => {
				finalize()
			}

			this.pageMutationWaiters.add(onWake)
			const timeoutId = window.setTimeout(() => {
				finalize()
			}, timeoutMs)
		})
	}

	private showUserMessage(message: string): void {
		// Create a temporary notification
		const notification = document.createElement('div')
		notification.style.cssText = `
			position: fixed;
			top: 20px;
			right: 20px;
			z-index: 10001;
			background: #ff9800;
			color: white;
			padding: 12px 16px;
			border-radius: 4px;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			font-size: 14px;
			box-shadow: 0 2px 10px rgba(0,0,0,0.2);
			max-width: 300px;
		`
		notification.textContent = message
		document.body.appendChild(notification)

		setTimeout(() => {
			if (notification.parentNode) {
				notification.parentNode.removeChild(notification)
			}
		}, 5000)
	}

	private isFormField(element: HTMLElement): boolean {
		return element.matches(SUPPORTED_FIELD_SELECTOR)
	}

	// Cleanup method
	public destroy(): void {
		if (this.mutationObserver) {
			this.mutationObserver.disconnect()
		}

		const waiters = Array.from(this.pageMutationWaiters)
		this.pageMutationWaiters.clear()
		waiters.forEach(waiter => waiter())

		this.interactionManager.destroy()
		this.removeFloatingActionButton()

		// Remove all form buttons
		document.querySelectorAll('.formfilla-form-btn').forEach(btn => btn.remove())

		this.observedForms.clear()
	}
}

// Initialize when content script loads
const formFilla = new FormFillaContent()

// Handle page unload
window.addEventListener('beforeunload', () => {
	formFilla.destroy()
})
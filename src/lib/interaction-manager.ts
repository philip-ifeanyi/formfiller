import {
	type BackgroundResponseMessage,
	type CanonicalFieldKey,
	type ContentCommandMessage,
	type ExtensionSettings,
	type FieldCandidate,
	type FieldControlKind,
	type FieldDebugTrace,
	type FieldInference,
	type FieldInfo,
	type FieldReviewItem,
	type FillInstruction,
	type FillResult,
	type FillRetryPolicy,
	type FormSnapshot,
	type FormControlElement,
	type GetFieldValueRequestMessage,
	type ProfileData,
	type ProfileValue,
	type UpdateContextMenuRequestMessage
} from '@/types'
import { FieldDetector } from './field-detector'
import { resolveProfileValueForFieldKey } from './profiles'
import { DEFAULT_FEATURE_FLAGS, StorageService } from './storage'
import { createDebugValuePreview, sanitizeFieldValue, summarizeDebugText } from './security'

function isFieldValueResponse(response: BackgroundResponseMessage | undefined): response is { value: string } {
	return Boolean(response && 'value' in response)
}

const ARIA_WIDGET_ROLES = new Set(['combobox', 'listbox', 'switch', 'radiogroup', 'spinbutton'])

type AdapterDefinition = {
	id: string
	eventStrategy: string[]
}

type PlannedFieldFill = {
	candidate: FieldCandidate
	inference: FieldInference
	instruction?: FillInstruction
	result?: FillResult
}

type AdapterExecution = {
	applied: boolean
	appliedValue?: string
	message?: string
}

type RetriablePlannedFieldFill = PlannedFieldFill & {
	instruction: FillInstruction
}

type RetryQueueEntry = {
	fingerprint: string
	plannedFill: RetriablePlannedFieldFill
	attemptsUsed: number
	lastResult: FillResult
}

type FormFillSession = {
	id: string
	form: HTMLFormElement
	profileData: ProfileData
	cancelled: boolean
	mutationVersion: number
	waiters: Set<() => void>
}

const DEFAULT_FILL_RETRY_POLICY: FillRetryPolicy = {
	maxAttempts: 1,
	backoffMs: 0,
	strategy: 'none'
}

const FORM_FILL_RETRY_POLICY: FillRetryPolicy = {
	maxAttempts: 3,
	backoffMs: 150,
	strategy: 'progressive'
}

const SETTLEMENT_RETRY_POLICY: FillRetryPolicy = {
	maxAttempts: 1,
	backoffMs: 120,
	strategy: 'fixed'
}

const MANUAL_FIELD_KEY = 'custom.manual' as CanonicalFieldKey
const UNRESOLVED_FIELD_KEY = 'custom.unresolved' as CanonicalFieldKey

const NATIVE_TEXT_ADAPTER: AdapterDefinition = {
	id: 'native.textual',
	eventStrategy: ['focus', 'input', 'change', 'blur']
}

const NATIVE_TEXTAREA_ADAPTER: AdapterDefinition = {
	id: 'native.textarea',
	eventStrategy: ['focus', 'input', 'change', 'blur']
}

const NATIVE_SELECT_ADAPTER: AdapterDefinition = {
	id: 'native.select',
	eventStrategy: ['focus', 'input', 'change', 'blur']
}

const NATIVE_CHECKBOX_ADAPTER: AdapterDefinition = {
	id: 'native.checkbox',
	eventStrategy: ['focus', 'input', 'change', 'blur']
}

const NATIVE_RADIO_ADAPTER: AdapterDefinition = {
	id: 'native.radio',
	eventStrategy: ['focus', 'input', 'change', 'blur']
}

const ARIA_COMBOBOX_ADAPTER: AdapterDefinition = {
	id: 'aria.combobox',
	eventStrategy: ['focus', 'input', 'change', 'blur']
}

const ARIA_LISTBOX_ADAPTER: AdapterDefinition = {
	id: 'aria.listbox',
	eventStrategy: ['focus', 'change', 'blur']
}

const ARIA_SWITCH_ADAPTER: AdapterDefinition = {
	id: 'aria.switch',
	eventStrategy: ['focus', 'input', 'change', 'blur']
}

const ARIA_RADIOGROUP_ADAPTER: AdapterDefinition = {
	id: 'aria.radiogroup',
	eventStrategy: ['focus', 'change', 'blur']
}

const ARIA_SPINBUTTON_ADAPTER: AdapterDefinition = {
	id: 'aria.spinbutton',
	eventStrategy: ['focus', 'input', 'change', 'blur']
}

const REACT_SELECT_ADAPTER: AdapterDefinition = {
	id: 'react-select.combobox',
	eventStrategy: ['focus', 'input', 'change', 'blur']
}

const HEADLESS_UI_LISTBOX_ADAPTER: AdapterDefinition = {
	id: 'headlessui.listbox',
	eventStrategy: ['focus', 'change', 'blur']
}

const MUI_AUTOCOMPLETE_ADAPTER: AdapterDefinition = {
	id: 'mui.autocomplete',
	eventStrategy: ['focus', 'input', 'change', 'blur']
}

const MASKED_INPUT_ADAPTER: AdapterDefinition = {
	id: 'masked.input',
	eventStrategy: ['focus', 'input', 'change', 'blur']
}

const SHADOW_NATIVE_ADAPTER: AdapterDefinition = {
	id: 'shadow.native',
	eventStrategy: ['focus', 'input', 'change', 'blur']
}

export class InteractionManager {
	private userPreferences: ExtensionSettings
	private activeButtons = new Map<HTMLElement, HTMLElement>()
	private fieldDetector: FieldDetector
	private storage: StorageService
	private lastClickedElement: HTMLElement | null = null
	private fillSessions = new Map<HTMLFormElement, FormFillSession>()
	private fillSessionCounter = 0

	constructor() {
		this.fieldDetector = new FieldDetector()
		this.storage = StorageService.getInstance()
		this.userPreferences = {
			autoFillEnabled: true,
			defaultProfile: '',
			fillDelay: 100,
			highlightFields: true,
			showButtons: true,
			buttonPosition: 'inside-right',
			contextMenuEnabled: true,
			autoHideButtons: true,
			buttonStyle: 'minimal',
			debugMode: false,
			featureFlags: { ...DEFAULT_FEATURE_FLAGS }
		}
		this.loadPreferences()
	}

	async loadPreferences(): Promise<void> {
		this.userPreferences = await this.storage.getSettings()
	}

	shouldShowButton(element: HTMLElement, fieldInfo: FieldInfo | null): boolean {
		if (!this.userPreferences.showButtons || !fieldInfo) return false

		// Don't show for password fields if user prefers context menu only
		if (element instanceof HTMLInputElement && element.type === 'password' && !this.userPreferences.showButtons) {
			return false
		}

		// Don't show if field is too small
		const rect = element.getBoundingClientRect()
		if (rect.width < 60 || rect.height < 20) return false

		return true
	}

	createFieldButton(element: HTMLElement, fieldInfo: FieldInfo): HTMLElement | null {
		if (!this.shouldShowButton(element, fieldInfo)) return null

		const button = document.createElement('div')
		button.className = `formfilla-btn formfilla-btn-${this.userPreferences.buttonStyle}`
		button.style.cssText = this.getButtonStyles()

		// Position button based on user preference
		this.positionButton(button, element)

		// Create dropdown for multiple options
		if (this.hasMultipleOptions(fieldInfo)) {
			this.createDropdownButton(button, element, fieldInfo)
		} else {
			this.createSimpleButton(button, element, fieldInfo)
		}

		// Handle conflicts with page elements
		this.handleElementConflicts(button, element)

		return button
	}

	private getButtonStyles(): string {
		return `
      position: absolute;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      transition: all 0.2s ease;
    `
	}

	private positionButton(button: HTMLElement, element: HTMLElement): void {
		const rect = element.getBoundingClientRect()
		const position = this.userPreferences.buttonPosition

		switch (position) {
			case 'inside-right':
				button.style.top = `${rect.top + (rect.height - 20) / 2 + window.scrollY}px`
				button.style.left = `${rect.right - 25 + window.scrollX}px`
				break

			case 'outside-right':
				button.style.top = `${rect.top + (rect.height - 20) / 2 + window.scrollY}px`
				button.style.left = `${rect.right + 5 + window.scrollX}px`
				break

			case 'above':
				button.style.top = `${rect.top - 25 + window.scrollY}px`
				button.style.left = `${rect.right - 25 + window.scrollX}px`
				break
		}
	}

	private hasMultipleOptions(_fieldInfo: FieldInfo): boolean {
		// For now, always create simple buttons
		// Can be expanded later to show dropdowns for certain field types
		return false
	}

	private createSimpleButton(button: HTMLElement, element: HTMLElement, fieldInfo: FieldInfo): void {
		const fieldDisplayName = this.fieldDetector.getFieldTypeDisplayName(fieldInfo.type, fieldInfo.subtype)

		// Create button element safely
		const mainButton = document.createElement('button')
		mainButton.className = 'formfilla-btn-main'
		mainButton.title = `Fill ${fieldDisplayName}`
		mainButton.style.cssText = this.getMainButtonStyles()

		// Create SVG icon safely
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
		svg.setAttribute('width', '14')
		svg.setAttribute('height', '14')
		svg.setAttribute('viewBox', '0 0 16 16')

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
		path.setAttribute('d', 'M8 1l3 3h-2v4h4v2l-3 3v-2H6V7H2V5l3-3v2h3V1z')
		path.setAttribute('fill', 'currentColor')

		svg.appendChild(path)
		mainButton.appendChild(svg)
		button.appendChild(mainButton)

		mainButton.addEventListener('click', (e) => {
			e.preventDefault()
			e.stopPropagation()
			this.fillFieldDefault(element, fieldInfo)
		})
	}

	private createDropdownButton(button: HTMLElement, element: HTMLElement, fieldInfo: FieldInfo): void {
		// Implementation for dropdown buttons - for future enhancement
		this.createSimpleButton(button, element, fieldInfo)
	}

	private getMainButtonStyles(): string {
		return `
      width: 20px;
      height: 20px;
      border: none;
      border-radius: 3px;
      background: #4285f4;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    `
	}

	private handleElementConflicts(button: HTMLElement, element: HTMLElement): void {
		// Check for overlapping elements
		const rect = element.getBoundingClientRect()
		const nearby = document.elementsFromPoint(
			rect.right - 15,
			rect.top + rect.height / 2
		)

		// If there's a conflict, adjust opacity
		const hasConflict = nearby.some(el =>
			el !== element &&
			el !== button &&
			this.isInteractiveElement(el)
		)

		if (hasConflict && this.userPreferences.autoHideButtons) {
			button.style.opacity = '0.3'

			element.addEventListener('focus', () => {
				button.style.opacity = '1'
			})

			element.addEventListener('blur', () => {
				button.style.opacity = '0.3'
			})
		}
	}

	private isInteractiveElement(element: Element): boolean {
		const interactiveTags = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA']
		return interactiveTags.includes(element.tagName) ||
			element.hasAttribute('onclick') ||
			window.getComputedStyle(element).cursor === 'pointer'
	}

	// Context menu integration
	enhanceContextMenu(element: HTMLElement, fieldInfo: FieldInfo | null): void {
		if (!this.userPreferences.contextMenuEnabled) return

		element.addEventListener('contextmenu', () => {
			this.lastClickedElement = element
			// Send message to background script to update context menu
			if (fieldInfo) {
				const message: UpdateContextMenuRequestMessage = {
					type: 'updateContextMenu',
					fieldType: `${fieldInfo.type}.${fieldInfo.subtype}`,
					fieldDisplayName: this.fieldDetector.getFieldTypeDisplayName(fieldInfo.type, fieldInfo.subtype)
				}
				chrome.runtime.sendMessage(message)
			}
		})
	}

	// Handle messages from background script
	handleMessage(message: ContentCommandMessage): void {
		switch (message.type) {
			case 'fillField':
				if (this.lastClickedElement && this.isFormField(this.lastClickedElement)) {
					void this.fillDirectValue(this.lastClickedElement, message.value)
				}
				break

			case 'fillForm':
				if (message.profileData) {
					void this.fillEntireForm(message.profileData)
				}
				break

			default:
				break
		}
	}

	private async fillFieldDefault(element: HTMLElement, fieldInfo: FieldInfo): Promise<void> {
		// Send message to background script to get default value
		const message: GetFieldValueRequestMessage = {
			type: 'getFieldValue',
			fieldType: fieldInfo.type,
			subtype: fieldInfo.subtype
		}

		chrome.runtime.sendMessage(message, (response: BackgroundResponseMessage | undefined) => {
			if (isFieldValueResponse(response)) {
				void this.fillDirectValue(element, response.value)
			}
		})
	}

	async fillFormWithProfile(form: HTMLFormElement, profileData: ProfileData): Promise<FillResult[]> {
		const session = this.startFillSession(form, profileData)
		const resultsByFingerprint = new Map<string, FillResult>()
		const retryQueue = new Map<string, RetryQueueEntry>()
		let discoveryPassesRemaining = FORM_FILL_RETRY_POLICY.maxAttempts - 1

		try {
			for (let cycle = 1; cycle <= FORM_FILL_RETRY_POLICY.maxAttempts && !session.cancelled; cycle += 1) {
				const snapshot = this.fieldDetector.collectFormSnapshot(form)
				const cycleHadRetryableFailures = await this.processFormSnapshot(
					session,
					snapshot,
					resultsByFingerprint,
					retryQueue
				)

				if (session.cancelled) {
					break
				}

				for (const [fingerprint, entry] of Array.from(retryQueue.entries())) {
					if (resultsByFingerprint.has(fingerprint)) {
						retryQueue.delete(fingerprint)
						continue
					}

					if (entry.attemptsUsed >= entry.plannedFill.instruction.retryPolicy.maxAttempts) {
						resultsByFingerprint.set(fingerprint, this.finalizeRetryQueueFailure(entry))
						retryQueue.delete(fingerprint)
					}
				}

				const shouldContinue =
					cycle < FORM_FILL_RETRY_POLICY.maxAttempts &&
					(retryQueue.size > 0 || discoveryPassesRemaining > 0)

				if (!shouldContinue) {
					break
				}

				if (!cycleHadRetryableFailures && retryQueue.size === 0) {
					discoveryPassesRemaining -= 1
				}

				const observedMutation = await this.waitForRetrySignal(session, FORM_FILL_RETRY_POLICY, cycle)
				if (!observedMutation && retryQueue.size === 0) {
					break
				}
			}

			for (const [fingerprint, entry] of retryQueue) {
				if (!resultsByFingerprint.has(fingerprint)) {
					resultsByFingerprint.set(fingerprint, this.finalizeRetryQueueFailure(entry))
				}
			}

			return Array.from(resultsByFingerprint.values())
		} finally {
			this.finishFillSession(session)
		}
	}

	private async fillEntireForm(profileData: ProfileData): Promise<void> {
		const forms = this.fieldDetector.collectFormSnapshots(document).map(snapshot => snapshot.form)

		for (const form of forms) {
			await this.fillFormWithProfile(form, profileData)
		}
	}

	public reviewFormWithProfile(form: HTMLFormElement, profileData: ProfileData): FieldReviewItem[] {
		const snapshot = this.fieldDetector.collectFormSnapshot(form)
		const inferences = this.fieldDetector.inferFieldCandidates(snapshot.candidates, snapshot.sections)
		const reviewItemsByFingerprint = new Map<string, FieldReviewItem>()

		for (const candidate of snapshot.candidates) {
			const plannedFill = this.planFieldFill(
				candidate,
				profileData,
				DEFAULT_FILL_RETRY_POLICY,
				inferences.get(candidate.id)
			)
			if (!plannedFill.result?.review) {
				continue
			}

			reviewItemsByFingerprint.set(
				this.getPlannedFillFingerprint(plannedFill),
				plannedFill.result.review
			)
		}

		return Array.from(reviewItemsByFingerprint.values())
	}

	private startFillSession(form: HTMLFormElement, profileData: ProfileData): FormFillSession {
		const existingSession = this.fillSessions.get(form)
		if (existingSession) {
			this.cancelFillSession(existingSession)
		}

		const session: FormFillSession = {
			id: `fill-session:${++this.fillSessionCounter}`,
			form,
			profileData,
			cancelled: false,
			mutationVersion: 0,
			waiters: new Set()
		}

		this.fillSessions.set(form, session)
		return session
	}

	private finishFillSession(session: FormFillSession): void {
		this.cancelFillSession(session)
		if (this.fillSessions.get(session.form)?.id === session.id) {
			this.fillSessions.delete(session.form)
		}
	}

	private cancelFillSession(session: FormFillSession): void {
		session.cancelled = true
		const waiters = Array.from(session.waiters)
		session.waiters.clear()
		waiters.forEach(waiter => waiter())
	}

	private async processFormSnapshot(
		session: FormFillSession,
		snapshot: FormSnapshot,
		resultsByFingerprint: Map<string, FillResult>,
		retryQueue: Map<string, RetryQueueEntry>
	): Promise<boolean> {
		let cycleHadRetryableFailures = false
		const inferences = this.fieldDetector.inferFieldCandidates(snapshot.candidates, snapshot.sections)

		for (const candidate of snapshot.candidates) {
			if (session.cancelled) {
				break
			}

			const plannedFill = this.planFieldFill(
				candidate,
				session.profileData,
				FORM_FILL_RETRY_POLICY,
				inferences.get(candidate.id)
			)
			const fingerprint = this.getPlannedFillFingerprint(plannedFill)

			if (resultsByFingerprint.has(fingerprint)) {
				continue
			}

			if (plannedFill.result) {
				resultsByFingerprint.set(fingerprint, plannedFill.result)
				retryQueue.delete(fingerprint)
				continue
			}

			if (!plannedFill.instruction) {
				continue
			}

			const retryEntry = retryQueue.get(fingerprint)
			const attemptsUsed = retryEntry?.attemptsUsed || 0

			const executionResult = await this.executeQueuedFillAttempt(
				session,
				plannedFill as RetriablePlannedFieldFill,
				attemptsUsed + 1
			)

			if (executionResult.status === 'filled') {
				resultsByFingerprint.set(fingerprint, executionResult)
				retryQueue.delete(fingerprint)

				if (this.userPreferences.fillDelay > 0) {
					await this.delay(this.userPreferences.fillDelay)
				}
				continue
			}

			if (!this.shouldRetryPlannedFill(executionResult, plannedFill as RetriablePlannedFieldFill, attemptsUsed + 1)) {
				resultsByFingerprint.set(fingerprint, executionResult)
				retryQueue.delete(fingerprint)
				continue
			}

			retryQueue.set(fingerprint, {
				fingerprint,
				plannedFill: plannedFill as RetriablePlannedFieldFill,
				attemptsUsed: attemptsUsed + 1,
				lastResult: executionResult
			})
			cycleHadRetryableFailures = true
		}

		return cycleHadRetryableFailures
	}

	private async executeQueuedFillAttempt(
		session: FormFillSession,
		plannedFill: RetriablePlannedFieldFill,
		attemptNumber: number
	): Promise<FillResult> {
		if (!plannedFill.candidate.element.isConnected) {
			return this.enrichFillResult(
				plannedFill.candidate,
				plannedFill.inference,
				session.profileData,
				this.createBlockedFillResult(
					plannedFill.instruction.candidateId,
					plannedFill.instruction.fieldKey,
					'failed',
					plannedFill.instruction.adapterId,
					`Field detached before fill attempt ${attemptNumber}`
				),
				plannedFill.instruction,
				attemptNumber
			)
		}

		const executionResult = this.enrichFillResult(
			plannedFill.candidate,
			plannedFill.inference,
			session.profileData,
			await this.executeFillInstruction(
			plannedFill.candidate.element,
			plannedFill.candidate.controlKind,
			plannedFill.instruction
			),
			plannedFill.instruction,
			attemptNumber
		)

		if (executionResult.status !== 'filled') {
			return executionResult
		}

		const observedMutation = await this.waitForRetrySignal(session, SETTLEMENT_RETRY_POLICY, 1)
		if (session.cancelled) {
			return this.enrichFillResult(
				plannedFill.candidate,
				plannedFill.inference,
				session.profileData,
				this.createBlockedFillResult(
					plannedFill.instruction.candidateId,
					plannedFill.instruction.fieldKey,
					'failed',
					plannedFill.instruction.adapterId,
					'Fill was cancelled before verification completed'
				),
				plannedFill.instruction,
				attemptNumber
			)
		}

		const refreshedFill = this.findRetryCandidate(session.form, session.profileData, plannedFill)
		if (!refreshedFill || !refreshedFill.instruction) {
			return this.enrichFillResult(
				plannedFill.candidate,
				plannedFill.inference,
				session.profileData,
				this.createBlockedFillResult(
					plannedFill.instruction.candidateId,
					plannedFill.instruction.fieldKey,
					'failed',
					plannedFill.instruction.adapterId,
					observedMutation
						? 'Field detached after a dynamic re-render before verification completed'
						: 'Post-fill verification could not confirm the field after settlement'
				),
				plannedFill.instruction,
				attemptNumber
			)
		}

		const settledValue = executionResult.appliedValue ?? refreshedFill.instruction.normalizedValue
		const persisted = this.verifyFilledValue(
			refreshedFill.candidate.element,
			refreshedFill.candidate.controlKind,
			settledValue,
			refreshedFill.instruction.adapterId
		)

		if (persisted) {
			return this.enrichFillResult(
				refreshedFill.candidate,
				refreshedFill.inference,
				session.profileData,
				{
				...executionResult,
				candidateId: refreshedFill.instruction.candidateId,
				appliedValue: settledValue,
				message: observedMutation
					? 'Filled successfully after a dynamic re-render'
					: executionResult.message
				},
				refreshedFill.instruction,
				attemptNumber
			)
		}

		return this.enrichFillResult(
			plannedFill.candidate,
			plannedFill.inference,
			session.profileData,
			this.createBlockedFillResult(
				plannedFill.instruction.candidateId,
				plannedFill.instruction.fieldKey,
				'failed',
				plannedFill.instruction.adapterId,
				observedMutation
					? 'Post-fill value was reset after a dynamic re-render'
					: 'Post-fill value did not persist after the verification window'
			),
			plannedFill.instruction,
			attemptNumber
		)
	}

	private shouldRetryPlannedFill(
		result: FillResult,
		plannedFill: RetriablePlannedFieldFill,
		attemptsUsed: number
	): boolean {
		if (attemptsUsed >= plannedFill.instruction.retryPolicy.maxAttempts) {
			return false
		}

		if (result.status === 'filled' || result.status === 'review') {
			return false
		}

		const normalizedMessage = (result.message || '').toLowerCase()
		if (
			normalizedMessage.includes('no fillable profile value') ||
			normalizedMessage.includes('no profile path is registered') ||
			normalizedMessage.includes('do not have a native adapter yet') ||
			normalizedMessage.includes('do not have a role-aware adapter yet') ||
			normalizedMessage.includes('requires manual review')
		) {
			return false
		}

		return true
	}

	private findRetryCandidate(
		form: HTMLFormElement,
		profileData: ProfileData,
		target: RetriablePlannedFieldFill
	): PlannedFieldFill | null {
		const targetFingerprint = this.getPlannedFillFingerprint(target)
		const snapshot = this.fieldDetector.collectFormSnapshot(form)
		const inferences = this.fieldDetector.inferFieldCandidates(snapshot.candidates, snapshot.sections)

		for (const candidate of snapshot.candidates) {
			const plannedFill = this.planFieldFill(
				candidate,
				profileData,
				target.instruction.retryPolicy,
				inferences.get(candidate.id)
			)
			const fingerprint = this.getPlannedFillFingerprint(plannedFill)

			if (fingerprint === targetFingerprint) {
				return plannedFill
			}

			if (
				candidate.id === target.candidate.id ||
				candidate.domSignature === target.candidate.domSignature
			) {
				return plannedFill
			}
		}

		return null
	}

	private getPlannedFillFingerprint(plannedFill: PlannedFieldFill): string {
		const fieldKey = this.getResultFieldKey(plannedFill.candidate, plannedFill.inference)
		const identityParts = [
			fieldKey,
			plannedFill.candidate.sectionId || plannedFill.candidate.formId,
			plannedFill.candidate.controlKind,
			plannedFill.candidate.attributes.name || '',
			plannedFill.candidate.attributes.id || plannedFill.candidate.element.id || '',
			plannedFill.candidate.autocomplete || '',
			plannedFill.candidate.role || ''
		]

		return identityParts
			.map(value => this.normalizeForMatch(String(value)))
			.join('::')
	}

	private finalizeRetryQueueFailure(entry: RetryQueueEntry): FillResult {
		const maxAttempts = entry.plannedFill.instruction.retryPolicy.maxAttempts
		const debugTrace = entry.lastResult.debug
		return {
			...entry.lastResult,
			message: `${entry.lastResult.message || 'Fill failed'} after ${entry.attemptsUsed}/${maxAttempts} attempts`,
			debug: debugTrace
				? {
					...debugTrace,
					outcomeMessage: `${entry.lastResult.message || 'Fill failed'} after ${entry.attemptsUsed}/${maxAttempts} attempts`,
					retryAttemptsUsed: entry.attemptsUsed,
					retryMaxAttempts: maxAttempts,
					retryStrategy: entry.plannedFill.instruction.retryPolicy.strategy
				}
				: undefined
		}
	}

	private waitForRetrySignal(
		session: FormFillSession,
		policy: FillRetryPolicy,
		attempt: number
	): Promise<boolean> {
		if (session.cancelled || !session.form.isConnected) {
			return Promise.resolve(false)
		}

		const baselineMutationVersion = session.mutationVersion
		const delayMs = this.getRetryDelay(policy, attempt)

		if (delayMs <= 0) {
			return Promise.resolve(session.mutationVersion > baselineMutationVersion)
		}

		return new Promise(resolve => {
			let settled = false
			const finalize = (observedMutation: boolean) => {
				if (settled) return
				settled = true
				clearTimeout(timeoutId)
				session.waiters.delete(onWake)
				resolve(observedMutation)
			}

			const onWake = () => {
				finalize(session.mutationVersion > baselineMutationVersion)
			}

			session.waiters.add(onWake)
			const timeoutId = window.setTimeout(() => {
				finalize(session.mutationVersion > baselineMutationVersion)
			}, delayMs)
		})
	}

	private getRetryDelay(policy: FillRetryPolicy, attempt: number): number {
		switch (policy.strategy) {
			case 'fixed':
				return policy.backoffMs

			case 'progressive':
				return policy.backoffMs * Math.max(attempt, 1)

			default:
				return 0
		}
	}

	private planFieldFill(
		candidate: FieldCandidate,
		profileData: ProfileData,
		retryPolicy: FillRetryPolicy = DEFAULT_FILL_RETRY_POLICY,
		inference: FieldInference = this.fieldDetector.inferFieldCandidate(candidate)
	): PlannedFieldFill {
		const resultFieldKey = this.getResultFieldKey(candidate, inference)

		if (inference.status === 'review') {
			return {
				candidate,
				inference,
				result: this.enrichFillResult(
					candidate,
					inference,
					profileData,
					this.createBlockedFillResult(
						candidate.id,
						resultFieldKey,
						'review',
						'native.none',
						inference.reasons.join('; ') || 'Requires manual review before filling'
					)
				)
			}
		}

		if (inference.status !== 'high-confidence' || !inference.fieldKey) {
			return {
				candidate,
				inference,
				result: this.enrichFillResult(
					candidate,
					inference,
					profileData,
					this.createBlockedFillResult(
						candidate.id,
						resultFieldKey,
						'skipped',
						'native.none',
						inference.reasons.join('; ') || 'Skipped because the field inference was not actionable'
					)
				)
			}
		}

		const resolvedValue = resolveProfileValueForFieldKey(profileData, inference.fieldKey)
		if (!resolvedValue) {
			return {
				candidate,
				inference,
				result: this.enrichFillResult(
					candidate,
					inference,
					profileData,
					this.createBlockedFillResult(
						candidate.id,
						inference.fieldKey,
						'skipped',
						'native.none',
						`Skipped because no profile path is registered for ${inference.fieldKey}`
					)
				)
			}
		}

		const adapter = this.getAdapter(candidate.element, candidate.controlKind)
		if (!adapter) {
			return {
				candidate,
				inference,
				result: this.enrichFillResult(
					candidate,
					inference,
					profileData,
					this.createBlockedFillResult(
						candidate.id,
						inference.fieldKey,
						'skipped',
						'aria.unsupported',
						`Skipped because ${candidate.controlKind} controls do not have a role-aware adapter yet`
					)
				)
			}
		}

		const normalizedValue = this.normalizePlannedValue(
			resolvedValue.rawValue ?? '',
			candidate.controlKind,
			inference.fieldKey,
			candidate.element
		)

		if (!this.hasFillableValue(normalizedValue, candidate.controlKind)) {
			return {
				candidate,
				inference,
				result: this.enrichFillResult(
					candidate,
					inference,
					profileData,
					this.createBlockedFillResult(
						candidate.id,
						inference.fieldKey,
						'skipped',
						adapter.id,
						`Skipped because no fillable profile value was found at ${resolvedValue.profilePath}`
					)
				)
			}
		}

		return {
			candidate,
			inference,
			instruction: {
				candidateId: candidate.id,
				fieldKey: inference.fieldKey,
				profilePath: resolvedValue.profilePath,
				rawValue: resolvedValue.rawValue ?? '',
				normalizedValue,
				adapterId: adapter.id,
				eventStrategy: [...adapter.eventStrategy],
				retryPolicy: { ...retryPolicy }
			}
		}
	}

	private getResultFieldKey(candidate: FieldCandidate, inference: FieldInference): CanonicalFieldKey {
		return inference.fieldKey || inference.alternatives[0]?.fieldKey || `${UNRESOLVED_FIELD_KEY}.${candidate.id}` as CanonicalFieldKey
	}

	private enrichFillResult(
		candidate: FieldCandidate,
		inference: FieldInference,
		profileData: ProfileData,
		result: FillResult,
		instruction?: FillInstruction,
		attemptNumber: number = 0
	): FillResult {
		const debugTrace = this.createDebugTrace(
			candidate,
			inference,
			profileData,
			result,
			instruction,
			attemptNumber
		)

		if (result.status === 'filled') {
			return {
				...result,
				review: this.createReviewItem(candidate, inference, profileData, result.status, result.message || 'Filled successfully', debugTrace),
				debug: debugTrace
			}
		}

		return {
			...result,
			review: this.createReviewItem(candidate, inference, profileData, result.status, result.message || result.status, debugTrace),
			debug: debugTrace
		}
	}

	private createReviewItem(
		candidate: FieldCandidate,
		inference: FieldInference,
		profileData: ProfileData,
		status: FillResult['status'],
		message: string,
		debugTrace?: FieldDebugTrace
	): FieldReviewItem {
		const resultFieldKey = this.getResultFieldKey(candidate, inference)
		const label = this.getCandidateReviewLabel(candidate)
		return {
			candidateId: candidate.id,
			fieldKey: resultFieldKey,
			label,
			status: status === 'filled' ? 'review' : status,
			confidence: inference.confidence,
			confidenceBand: inference.status,
			selectedValuePreview: this.getSelectedValuePreview(resultFieldKey, profileData),
			message,
			debug: debugTrace
		}
	}

	private getCandidateReviewLabel(candidate: FieldCandidate): string {
		const fallback = [candidate.attributes.name, candidate.attributes.id, candidate.placeholder]
			.find(value => typeof value === 'string' && value.trim().length > 0)

		return candidate.labelText?.trim() || fallback?.trim() || 'Unlabeled field'
	}

	private getSelectedValuePreview(fieldKey: CanonicalFieldKey, profileData: ProfileData): string | undefined {
		const resolvedValue = resolveProfileValueForFieldKey(profileData, fieldKey)
		if (!resolvedValue) {
			return undefined
		}

		const rawValue = String(resolvedValue.rawValue ?? '').trim()
		if (!rawValue) {
			return undefined
		}

		return createDebugValuePreview(rawValue, fieldKey)
	}

	private createDebugTrace(
		candidate: FieldCandidate,
		inference: FieldInference,
		profileData: ProfileData,
		result: FillResult,
		instruction?: FillInstruction,
		attemptNumber: number = 0
	): FieldDebugTrace {
		const resultFieldKey = this.getResultFieldKey(candidate, inference)
		const resolvedValue = resolveProfileValueForFieldKey(profileData, resultFieldKey)
		const selectedValue = instruction?.normalizedValue || this.toScalarString(resolvedValue?.rawValue ?? '')
		const maxAttempts = instruction?.retryPolicy.maxAttempts ?? DEFAULT_FILL_RETRY_POLICY.maxAttempts
		const retryStrategy = instruction?.retryPolicy.strategy ?? DEFAULT_FILL_RETRY_POLICY.strategy

		return {
			candidateId: result.candidateId,
			label: this.getCandidateReviewLabel(candidate),
			fieldKey: result.fieldKey,
			controlKind: candidate.controlKind,
			status: result.status,
			confidence: inference.confidence,
			confidenceBand: inference.status,
			adapterId: result.adapterId,
			outcomeMessage: result.message || result.status,
			reasons: inference.reasons.slice(0, 6),
			alternatives: inference.alternatives.map(alternative => ({
				fieldKey: alternative.fieldKey,
				confidence: alternative.confidence
			})),
			evidence: candidate.evidence
				.slice()
				.sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0))
				.slice(0, 6)
				.map(evidence => ({
					source: evidence.source,
					sample: summarizeDebugText(evidence.raw),
					weight: evidence.weight ?? 0
				})),
			selectedValuePreview: selectedValue
				? createDebugValuePreview(selectedValue, resultFieldKey)
				: undefined,
			appliedValuePreview: result.appliedValue
				? createDebugValuePreview(result.appliedValue, resultFieldKey)
				: undefined,
			retryAttemptsUsed: attemptNumber,
			retryMaxAttempts: maxAttempts,
			retryStrategy
		}
	}

	private createBlockedFillResult(
		candidateId: string,
		fieldKey: CanonicalFieldKey,
		status: 'review' | 'skipped' | 'failed',
		adapterId: string,
		message: string
	): FillResult {
		return {
			candidateId,
			fieldKey,
			status,
			adapterId,
			verified: false,
			message
		}
	}

	private async fillDirectValue(element: HTMLElement, value: string): Promise<FillResult | null> {
		if (!this.isFormField(element)) return null

		const controlKind = this.getControlKind(element)
		const adapter = this.getAdapter(element, controlKind)
		if (!adapter) {
			return this.createBlockedFillResult(
				`direct:${Date.now()}`,
				MANUAL_FIELD_KEY,
				'skipped',
				'aria.unsupported',
				`Skipped because ${controlKind} controls do not have a role-aware adapter yet`
			)
		}

		const normalizedValue = this.normalizePlannedValue(value, controlKind, MANUAL_FIELD_KEY, element)
		if (!this.hasFillableValue(normalizedValue, controlKind)) {
			return this.createBlockedFillResult(
				`direct:${Date.now()}`,
				MANUAL_FIELD_KEY,
				'skipped',
				adapter.id,
				'Skipped because there was no fillable value for the selected control'
			)
		}

		const instruction: FillInstruction = {
			candidateId: `direct:${Date.now()}`,
			fieldKey: MANUAL_FIELD_KEY,
			profilePath: 'custom.manual',
			rawValue: value,
			normalizedValue,
			adapterId: adapter.id,
			eventStrategy: [...adapter.eventStrategy],
			retryPolicy: { ...DEFAULT_FILL_RETRY_POLICY }
		}

		return this.executeFillInstruction(element, controlKind, instruction)
	}

	public notifyFormMutation(form: HTMLFormElement): void {
		const session = this.fillSessions.get(form)
		if (!session || session.cancelled) {
			return
		}

		session.mutationVersion += 1
		const waiters = Array.from(session.waiters)
		session.waiters.clear()
		waiters.forEach(waiter => waiter())
	}

	private async executeFillInstruction(
		element: FormControlElement,
		controlKind: FieldControlKind,
		instruction: FillInstruction
	): Promise<FillResult> {
		try {
			const execution = await this.applyAdapter(element, controlKind, instruction)

			if (!execution.applied) {
				return this.createBlockedFillResult(
					instruction.candidateId,
					instruction.fieldKey,
					'skipped',
					instruction.adapterId,
					execution.message || 'Skipped because the adapter could not apply a matching value'
				)
			}

			const appliedValue = execution.appliedValue ?? instruction.normalizedValue
			const verified = this.verifyFilledValue(element, controlKind, appliedValue, instruction.adapterId)

			return {
				candidateId: instruction.candidateId,
				fieldKey: instruction.fieldKey,
				status: verified ? 'filled' : 'failed',
				adapterId: instruction.adapterId,
				appliedValue,
				verified,
				message: verified
					? 'Filled and verified successfully'
					: execution.message || 'Post-fill verification failed'
			}
		} catch (error) {
			return this.createBlockedFillResult(
				instruction.candidateId,
				instruction.fieldKey,
				'failed',
				instruction.adapterId,
				error instanceof Error ? error.message : 'Unexpected fill error'
			)
		}
	}

	private async applyAdapter(
		element: FormControlElement,
		controlKind: FieldControlKind,
		instruction: FillInstruction
	): Promise<AdapterExecution> {
		switch (instruction.adapterId) {
			case REACT_SELECT_ADAPTER.id:
				return this.applyReactSelectAdapter(element, instruction)

			case HEADLESS_UI_LISTBOX_ADAPTER.id:
				return this.applyHeadlessUIListboxAdapter(element, instruction)

			case MUI_AUTOCOMPLETE_ADAPTER.id:
				return this.applyMaterialAutocompleteAdapter(element, instruction)

			case MASKED_INPUT_ADAPTER.id:
				return this.applyMaskedInputAdapter(element, instruction)

			case SHADOW_NATIVE_ADAPTER.id:
				return this.applyShadowNativeAdapter(element, controlKind, instruction)

			default:
				break
		}

		return this.applyBaseAdapter(element, controlKind, instruction)
	}

	private async applyBaseAdapter(
		element: FormControlElement,
		controlKind: FieldControlKind,
		instruction: FillInstruction
	): Promise<AdapterExecution> {
		switch (controlKind) {
			case 'select':
				return this.applySelectAdapter(element as HTMLSelectElement, instruction)

			case 'checkbox':
				return this.applyCheckboxAdapter(element as HTMLInputElement, instruction)

			case 'radio':
				return this.applyRadioAdapter(element as HTMLInputElement, instruction)

			case 'combobox':
				return this.applyComboboxAdapter(element, instruction)

			case 'listbox':
				return this.applyListboxAdapter(element, instruction)

			case 'switch':
				return this.applySwitchAdapter(element, instruction)

			case 'radiogroup':
				return this.applyAriaRadioGroupAdapter(element, instruction)

			case 'spinbutton':
				return this.applySpinbuttonAdapter(element, instruction)

			case 'textarea':
				return this.applyTextualAdapter(element as HTMLTextAreaElement, instruction)

			case 'text':
			case 'date':
			case 'datetime':
			case 'number':
			case 'email':
			case 'tel':
			case 'password':
				return this.applyTextualAdapter(element as HTMLInputElement, instruction)

			default:
				return {
					applied: false,
					message: `Unsupported adapter for ${controlKind}`
				}
		}
	}

	private async applyTextualAdapter(
		element: HTMLInputElement | HTMLTextAreaElement,
		instruction: FillInstruction
	): Promise<AdapterExecution> {
		this.focusIfPlanned(element, instruction)

		if (this.userPreferences.fillDelay > 0 && this.shouldTypeSequentially(element)) {
			element.value = ''
			for (const character of instruction.normalizedValue) {
				element.value += character
				this.dispatchIfPlanned(element, instruction, 'input')
				await this.delay(this.userPreferences.fillDelay)
			}
		} else {
			element.value = instruction.normalizedValue
			this.dispatchIfPlanned(element, instruction, 'input')
		}

		this.dispatchIfPlanned(element, instruction, 'change')
		this.blurIfPlanned(element, instruction)

		return {
			applied: true,
			appliedValue: instruction.normalizedValue
		}
	}

	private shouldTypeSequentially(element: HTMLInputElement | HTMLTextAreaElement): boolean {
		if (element instanceof HTMLTextAreaElement) {
			return true
		}

		return ['text', 'email', 'tel', 'password', 'search', 'url'].includes(element.type || 'text')
	}

	private applySelectAdapter(element: HTMLSelectElement, instruction: FillInstruction): AdapterExecution {
		const matchingOption = this.findMatchingOption(element, instruction.normalizedValue)
		if (!matchingOption) {
			return {
				applied: false,
				message: `No select option matched ${instruction.normalizedValue}`
			}
		}

		this.focusIfPlanned(element, instruction)
		element.value = matchingOption.value
		if (element.value !== matchingOption.value) {
			matchingOption.selected = true
		}
		this.dispatchIfPlanned(element, instruction, 'input')
		this.dispatchIfPlanned(element, instruction, 'change')
		this.blurIfPlanned(element, instruction)

		return {
			applied: true,
			appliedValue: matchingOption.value
		}
	}

	private applyCheckboxAdapter(element: HTMLInputElement, instruction: FillInstruction): AdapterExecution {
		const shouldCheck = this.resolveCheckboxState(instruction.normalizedValue, element)

		this.focusIfPlanned(element, instruction)
		element.checked = shouldCheck
		this.dispatchIfPlanned(element, instruction, 'input')
		this.dispatchIfPlanned(element, instruction, 'change')
		this.blurIfPlanned(element, instruction)

		return {
			applied: true,
			appliedValue: shouldCheck ? 'true' : 'false'
		}
	}

	private applyRadioAdapter(element: HTMLInputElement, instruction: FillInstruction): AdapterExecution {
		if (!this.matchesRadioValue(element, instruction.normalizedValue)) {
			return {
				applied: false,
				message: `Radio option did not match ${instruction.normalizedValue}`
			}
		}

		this.focusIfPlanned(element, instruction)
		element.checked = true
		this.dispatchIfPlanned(element, instruction, 'input')
		this.dispatchIfPlanned(element, instruction, 'change')
		this.blurIfPlanned(element, instruction)

		return {
			applied: true,
			appliedValue: element.value || instruction.normalizedValue
		}
	}

	private applyComboboxAdapter(element: FormControlElement, instruction: FillInstruction): AdapterExecution {
		this.focusIfPlanned(element, instruction)
		this.openRolePopupIfNeeded(element)

		const popup = this.resolveControlledPopup(element)
		if (!popup && element.getAttribute('aria-controls')) {
			return {
				applied: false,
				message: 'Combobox popup could not be resolved from aria-controls or aria-owns'
			}
		}

		const options = this.getRoleOptions(element, popup, ['option'])
		const matchingOption = this.findMatchingRoleOption(options, instruction.normalizedValue)
		if (!matchingOption) {
			return {
				applied: false,
				message: `No combobox option matched ${instruction.normalizedValue}`
			}
		}

		matchingOption.click()
		this.dispatchIfPlanned(element, instruction, 'input')
		this.dispatchIfPlanned(element, instruction, 'change')
		this.blurIfPlanned(element, instruction)

		return {
			applied: true,
			appliedValue: this.getRoleOptionValue(matchingOption)
		}
	}

	private applyListboxAdapter(element: FormControlElement, instruction: FillInstruction): AdapterExecution {
		this.focusIfPlanned(element, instruction)
		this.openRolePopupIfNeeded(element)

		const options = this.getRoleOptions(element, this.resolveControlledPopup(element), ['option'])
		const matchingOption = this.findMatchingRoleOption(options, instruction.normalizedValue)
		if (!matchingOption) {
			return {
				applied: false,
				message: `No listbox option matched ${instruction.normalizedValue}`
			}
		}

		matchingOption.click()
		this.dispatchIfPlanned(element, instruction, 'change')
		this.blurIfPlanned(element, instruction)

		return {
			applied: true,
			appliedValue: this.getRoleOptionValue(matchingOption)
		}
	}

	private applySwitchAdapter(element: FormControlElement, instruction: FillInstruction): AdapterExecution {
		const shouldCheck = this.resolveSwitchState(element, instruction.normalizedValue)
		if (shouldCheck === null) {
			return {
				applied: false,
				message: `Switch value ${instruction.normalizedValue} did not match an available state`
			}
		}
		const currentState = element.getAttribute('aria-checked') === 'true'

		this.focusIfPlanned(element, instruction)
		if (currentState !== shouldCheck) {
			element.click()
		}
		this.dispatchIfPlanned(element, instruction, 'input')
		this.dispatchIfPlanned(element, instruction, 'change')
		this.blurIfPlanned(element, instruction)

		return {
			applied: true,
			appliedValue: shouldCheck ? 'true' : 'false'
		}
	}

	private applyAriaRadioGroupAdapter(element: FormControlElement, instruction: FillInstruction): AdapterExecution {
		const options = this.getRoleOptions(element, undefined, ['radio'])
		const matchingOption = this.findMatchingRoleOption(options, instruction.normalizedValue)
		if (!matchingOption) {
			return {
				applied: false,
				message: `No radio option matched ${instruction.normalizedValue}`
			}
		}

		this.focusIfPlanned(element, instruction)
		matchingOption.click()
		this.dispatchIfPlanned(element, instruction, 'change')
		this.blurIfPlanned(element, instruction)

		return {
			applied: true,
			appliedValue: this.getRoleOptionValue(matchingOption)
		}
	}

	private applySpinbuttonAdapter(element: FormControlElement, instruction: FillInstruction): AdapterExecution {
		const targetValue = Number(instruction.normalizedValue)
		if (!Number.isFinite(targetValue)) {
			return {
				applied: false,
				message: `Spinbutton value ${instruction.normalizedValue} is not numeric`
			}
		}

		this.focusIfPlanned(element, instruction)

		if (element instanceof HTMLInputElement) {
			element.value = instruction.normalizedValue
			this.dispatchIfPlanned(element, instruction, 'input')
			this.dispatchIfPlanned(element, instruction, 'change')
			this.blurIfPlanned(element, instruction)
			return {
				applied: true,
				appliedValue: instruction.normalizedValue
			}
		}

		const currentValue = Number(element.getAttribute('aria-valuenow') || element.getAttribute('data-value') || '0')
		if (!Number.isFinite(currentValue)) {
			return {
				applied: false,
				message: 'Spinbutton is missing a usable current numeric value'
			}
		}

		const step = Number(element.getAttribute('aria-valuestep') || element.getAttribute('data-step') || '1') || 1
		const direction = targetValue >= currentValue ? 'ArrowUp' : 'ArrowDown'
		const stepsNeeded = Math.min(64, Math.round(Math.abs(targetValue - currentValue) / Math.abs(step || 1)))

		for (let index = 0; index < stepsNeeded; index += 1) {
			element.dispatchEvent(new KeyboardEvent('keydown', { key: direction, bubbles: true }))
			element.dispatchEvent(new KeyboardEvent('keyup', { key: direction, bubbles: true }))
		}

		this.dispatchIfPlanned(element, instruction, 'input')
		this.dispatchIfPlanned(element, instruction, 'change')
		this.blurIfPlanned(element, instruction)

		return {
			applied: true,
			appliedValue: instruction.normalizedValue
		}
	}

	private applyReactSelectAdapter(element: FormControlElement, instruction: FillInstruction): AdapterExecution {
		const execution = this.applyComboboxAdapter(element, instruction)
		if (!execution.applied) {
			return execution
		}

		const hiddenInput = this.getAssociatedHiddenInput(element)
		return {
			applied: true,
			appliedValue: hiddenInput?.value.trim() || execution.appliedValue || instruction.normalizedValue
		}
	}

	private applyHeadlessUIListboxAdapter(element: FormControlElement, instruction: FillInstruction): AdapterExecution {
		return this.applyListboxAdapter(element, instruction)
	}

	private applyMaterialAutocompleteAdapter(element: FormControlElement, instruction: FillInstruction): AdapterExecution {
		if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
			this.focusIfPlanned(element, instruction)
			element.value = instruction.normalizedValue
			this.dispatchIfPlanned(element, instruction, 'input')
		}

		return this.applyComboboxAdapter(element, instruction)
	}

	private async applyMaskedInputAdapter(element: FormControlElement, instruction: FillInstruction): Promise<AdapterExecution> {
		if (!(element instanceof HTMLInputElement)) {
			return this.applyBaseAdapter(element, this.getControlKind(element), instruction)
		}

		const maskPattern = this.getMaskPattern(element)
		const sourceValue = this.getMaskSourceCharacters(instruction.normalizedValue)
		if (!maskPattern || !sourceValue) {
			return this.applyTextualAdapter(element, instruction)
		}

		this.focusIfPlanned(element, instruction)
		element.value = ''

		for (const character of sourceValue) {
			element.value += character
			this.dispatchIfPlanned(element, instruction, 'input')
			if (this.userPreferences.fillDelay > 0) {
				await this.delay(this.userPreferences.fillDelay)
			}
		}

		if (!element.value || element.value === sourceValue) {
			element.value = this.applyMaskPattern(maskPattern, sourceValue)
			this.dispatchIfPlanned(element, instruction, 'input')
		}

		this.dispatchIfPlanned(element, instruction, 'change')
		this.blurIfPlanned(element, instruction)

		return {
			applied: true,
			appliedValue: element.value || this.applyMaskPattern(maskPattern, sourceValue)
		}
	}

	private applyShadowNativeAdapter(
		element: FormControlElement,
		controlKind: FieldControlKind,
		instruction: FillInstruction
	): Promise<AdapterExecution> {
		return this.applyBaseAdapter(element, controlKind, instruction)
	}

	private resolveControlledPopup(element: FormControlElement): HTMLElement | null {
		const popupIds = [element.getAttribute('aria-controls'), element.getAttribute('aria-owns')]
			.filter((value): value is string => Boolean(value))
			.flatMap(value => value.split(/\s+/).filter(Boolean))

		for (const id of popupIds) {
			const popup = document.getElementById(id)
			if (popup) {
				return popup
			}
		}

		return null
	}

	private openRolePopupIfNeeded(element: FormControlElement): void {
		if (
			element.getAttribute('aria-expanded') === 'false' ||
			(element.getAttribute('aria-haspopup') === 'listbox' && element.getAttribute('aria-expanded') !== 'true')
		) {
			element.click()
		}
	}

	private getRoleOptions(
		element: FormControlElement,
		popup: HTMLElement | null = null,
		roles: string[] = ['option']
	): HTMLElement[] {
		const selector = roles.map(role => `[role="${role}"]`).join(', ')
		const options = new Set<HTMLElement>()

		const addOptionsFromRoot = (root: ParentNode | null) => {
			if (!root) {
				return
			}

			root.querySelectorAll<HTMLElement>(selector).forEach(option => {
				options.add(option)
			})
		}

		addOptionsFromRoot(element)
		addOptionsFromRoot(popup)

		return Array.from(options)
	}

	private findMatchingRoleOption(options: HTMLElement[], desiredValue: string): HTMLElement | null {
		const normalizedDesiredValue = this.normalizeForMatch(desiredValue)

		for (const option of options) {
			const candidateValues = new Set<string>()
			candidateValues.add(this.normalizeForMatch(option.textContent || ''))
			candidateValues.add(this.normalizeForMatch(option.getAttribute('aria-label') || ''))
			candidateValues.add(this.normalizeForMatch(option.getAttribute('data-value') || ''))
			candidateValues.add(this.normalizeForMatch(option.getAttribute('aria-valuetext') || ''))

			if (candidateValues.has(normalizedDesiredValue)) {
				return option
			}
		}

		return null
	}

	private getRoleOptionValue(option: HTMLElement): string {
		return option.getAttribute('data-value') || option.getAttribute('aria-label') || option.textContent?.trim() || ''
	}

	private focusIfPlanned(element: FormControlElement, instruction: FillInstruction): void {
		if (instruction.eventStrategy.includes('focus')) {
			element.focus()
		}
	}

	private blurIfPlanned(element: FormControlElement, instruction: FillInstruction): void {
		if (instruction.eventStrategy.includes('blur')) {
			element.blur()
		}
	}

	private dispatchIfPlanned(element: FormControlElement, instruction: FillInstruction, eventName: 'input' | 'change'): void {
		if (instruction.eventStrategy.includes(eventName)) {
			element.dispatchEvent(new Event(eventName, { bubbles: true }))
		}
	}

	private verifyFilledValue(
		element: FormControlElement,
		controlKind: FieldControlKind,
		expectedValue: string,
		adapterId?: string
	): boolean {
		switch (adapterId) {
			case REACT_SELECT_ADAPTER.id:
				return this.verifyReactSelectValue(element, expectedValue)

			case HEADLESS_UI_LISTBOX_ADAPTER.id:
				return this.verifyPopupTriggerValue(element, expectedValue)

			case MUI_AUTOCOMPLETE_ADAPTER.id:
				return this.verifyMaterialAutocompleteValue(element, expectedValue)

			case MASKED_INPUT_ADAPTER.id:
				return this.getElementValue(element) === expectedValue

			default:
				break
		}

		switch (controlKind) {
			case 'checkbox':
				return (element as HTMLInputElement).checked === this.resolveCheckboxState(expectedValue, element as HTMLInputElement)

			case 'radio':
				return (element as HTMLInputElement).checked && this.matchesRadioValue(element as HTMLInputElement, expectedValue)

			case 'combobox':
				return this.verifyComboboxValue(element, expectedValue)

			case 'listbox':
				return this.verifyListboxValue(element, expectedValue)

			case 'switch':
				return element.getAttribute('aria-checked') === this.resolveSwitchState(element, expectedValue)?.toString()

			case 'radiogroup':
				return this.verifyAriaRadioGroupValue(element, expectedValue)

			case 'spinbutton':
				return this.verifySpinbuttonValue(element, expectedValue)

			case 'select': {
				const matchingOption = this.findMatchingOption(element as HTMLSelectElement, expectedValue)
				return Boolean(matchingOption && (element as HTMLSelectElement).value === matchingOption.value)
			}

			default:
				return this.getElementValue(element) === expectedValue
		}
	}

	private verifyReactSelectValue(element: FormControlElement, expectedValue: string): boolean {
		const hiddenInput = this.getAssociatedHiddenInput(element)
		const comboboxMatches = this.verifyComboboxValue(element, expectedValue)
		if (!hiddenInput) {
			return comboboxMatches
		}

		const hiddenMatches = this.normalizeForMatch(hiddenInput.value) === this.normalizeForMatch(expectedValue)
		return comboboxMatches && hiddenMatches
	}

	private verifyPopupTriggerValue(element: FormControlElement, expectedValue: string): boolean {
		const normalizedExpectedValue = this.normalizeForMatch(expectedValue)

		if (this.verifyListboxValue(element, expectedValue)) {
			return true
		}

		const hiddenInput = this.getAssociatedHiddenInput(element)
		if (hiddenInput && this.normalizeForMatch(hiddenInput.value) === normalizedExpectedValue) {
			return true
		}

		return this.normalizeForMatch(this.getElementValue(element)).includes(normalizedExpectedValue)
	}

	private verifyMaterialAutocompleteValue(element: FormControlElement, expectedValue: string): boolean {
		return this.verifyComboboxValue(element, expectedValue)
	}

	private isReactSelectControl(element: FormControlElement, controlKind: FieldControlKind): boolean {
		if (controlKind !== 'combobox') {
			return false
		}

		return Boolean(this.resolveControlledPopup(element) && this.getAssociatedHiddenInput(element))
	}

	private isHeadlessUIListboxTrigger(element: FormControlElement, controlKind: FieldControlKind): boolean {
		return controlKind === 'listbox' &&
			element instanceof HTMLButtonElement &&
			element.getAttribute('aria-haspopup') === 'listbox'
	}

	private isMaterialAutocompleteControl(element: FormControlElement, controlKind: FieldControlKind): boolean {
		return controlKind === 'combobox' && element.getAttribute('aria-autocomplete') === 'list'
	}

	private isMaskedInputElement(element: FormControlElement, controlKind: FieldControlKind): boolean {
		return (controlKind === 'text' || controlKind === 'tel') &&
			element instanceof HTMLInputElement &&
			Boolean(this.getMaskPattern(element))
	}

	private isShadowWrappedControl(element: FormControlElement, controlKind: FieldControlKind): boolean {
		return element.getRootNode() instanceof ShadowRoot && controlKind !== 'unknown'
	}

	private verifyComboboxValue(element: FormControlElement, expectedValue: string): boolean {
		const normalizedExpectedValue = this.normalizeForMatch(expectedValue)
		const activeDescendantId = element.getAttribute('aria-activedescendant')
		const activeDescendant = activeDescendantId ? document.getElementById(activeDescendantId) : null
		const activeText = activeDescendant?.textContent?.trim() || element.getAttribute('aria-valuetext') || ''

		if (activeText && this.normalizeForMatch(activeText) === normalizedExpectedValue) {
			return true
		}

		if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
			return this.normalizeForMatch(element.value) === normalizedExpectedValue
		}

		const selectedOption = this.getRoleOptions(element, this.resolveControlledPopup(element)).find(option => option.getAttribute('aria-selected') === 'true')
		return Boolean(selectedOption && this.normalizeForMatch(this.getRoleOptionValue(selectedOption)) === normalizedExpectedValue)
	}

	private verifyListboxValue(element: FormControlElement, expectedValue: string): boolean {
		const normalizedExpectedValue = this.normalizeForMatch(expectedValue)
		return this.getRoleOptions(element, this.resolveControlledPopup(element)).some(option => {
			return option.getAttribute('aria-selected') === 'true' &&
				this.normalizeForMatch(this.getRoleOptionValue(option)) === normalizedExpectedValue
		})
	}

	private verifyAriaRadioGroupValue(element: FormControlElement, expectedValue: string): boolean {
		const normalizedExpectedValue = this.normalizeForMatch(expectedValue)
		return this.getRoleOptions(element, null, ['radio']).some(option => {
			return option.getAttribute('aria-checked') === 'true' &&
				this.normalizeForMatch(this.getRoleOptionValue(option)) === normalizedExpectedValue
		})
	}

	private verifySpinbuttonValue(element: FormControlElement, expectedValue: string): boolean {
		if (element instanceof HTMLInputElement) {
			return element.value === expectedValue
		}

		return this.normalizeForMatch(element.getAttribute('aria-valuenow') || '') === this.normalizeForMatch(expectedValue)
	}

	private getAdapter(element: FormControlElement, controlKind: FieldControlKind): AdapterDefinition | null {
		if (this.isReactSelectControl(element, controlKind)) {
			return REACT_SELECT_ADAPTER
		}

		if (this.isHeadlessUIListboxTrigger(element, controlKind)) {
			return HEADLESS_UI_LISTBOX_ADAPTER
		}

		if (this.isMaterialAutocompleteControl(element, controlKind)) {
			return MUI_AUTOCOMPLETE_ADAPTER
		}

		if (this.isMaskedInputElement(element, controlKind)) {
			return MASKED_INPUT_ADAPTER
		}

		if (this.isShadowWrappedControl(element, controlKind)) {
			return SHADOW_NATIVE_ADAPTER
		}

		switch (controlKind) {
			case 'text':
			case 'date':
			case 'datetime':
			case 'number':
			case 'email':
			case 'tel':
			case 'password':
				return NATIVE_TEXT_ADAPTER

			case 'textarea':
				return NATIVE_TEXTAREA_ADAPTER

			case 'select':
				return NATIVE_SELECT_ADAPTER

			case 'checkbox':
				return NATIVE_CHECKBOX_ADAPTER

			case 'radio':
				return NATIVE_RADIO_ADAPTER

			case 'combobox':
				return ARIA_COMBOBOX_ADAPTER

			case 'listbox':
				return ARIA_LISTBOX_ADAPTER

			case 'switch':
				return ARIA_SWITCH_ADAPTER

			case 'radiogroup':
				return ARIA_RADIOGROUP_ADAPTER

			case 'spinbutton':
				return ARIA_SPINBUTTON_ADAPTER

			default:
				return null
		}
	}

	private normalizePlannedValue(
		rawValue: ProfileValue | string,
		controlKind: FieldControlKind,
		fieldKey: CanonicalFieldKey,
		element?: FormControlElement
	): string {
		const scalarValue = this.toScalarString(rawValue)
		const sanitizedValue = sanitizeFieldValue(
			scalarValue,
			this.getSanitizationType(controlKind, fieldKey, element)
		)

		if (controlKind === 'date' || controlKind === 'datetime') {
			return this.normalizeTemporalValue(sanitizedValue, controlKind)
		}

		return sanitizedValue
	}

	private hasFillableValue(normalizedValue: string, controlKind: FieldControlKind): boolean {
		if (controlKind === 'checkbox') {
			return normalizedValue !== ''
		}

		return normalizedValue.trim() !== ''
	}

	private toScalarString(value: ProfileValue | string): string {
		if (typeof value === 'string') return value
		if (typeof value === 'number' || typeof value === 'boolean') return String(value)
		return ''
	}

	private getSanitizationType(
		controlKind: FieldControlKind,
		fieldKey: CanonicalFieldKey,
		element?: FormControlElement
	): string | undefined {
		if (controlKind === 'email' || fieldKey.includes('email')) return 'email'
		if (controlKind === 'tel' || fieldKey.includes('phone')) return 'phone'
		if (
			controlKind === 'number' ||
			fieldKey === 'payment.cardNumber' ||
			fieldKey === 'payment.cvv' ||
			fieldKey === 'person.age'
		) {
			return 'number'
		}
		if (fieldKey.includes('website') || (element instanceof HTMLInputElement && element.type === 'url')) return 'url'

		return controlKind
	}

	private normalizeTemporalValue(value: string, controlKind: 'date' | 'datetime'): string {
		const trimmedValue = value.trim()
		if (!trimmedValue) return ''

		if (controlKind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
			return trimmedValue
		}

		if (controlKind === 'datetime' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmedValue)) {
			return trimmedValue.slice(0, 16)
		}

		const parsedDate = new Date(trimmedValue)
		if (Number.isNaN(parsedDate.getTime())) {
			return trimmedValue
		}

		return controlKind === 'datetime'
			? parsedDate.toISOString().slice(0, 16)
			: parsedDate.toISOString().slice(0, 10)
	}

	private findMatchingOption(element: HTMLSelectElement, desiredValue: string): HTMLOptionElement | null {
		const normalizedDesiredValue = this.normalizeForMatch(desiredValue)
		return Array.from(element.options).find(option => {
			const candidateValues = [option.value, option.textContent || ''].map(value => this.normalizeForMatch(value))
			return candidateValues.includes(normalizedDesiredValue)
		}) || null
	}

	private resolveCheckboxState(value: string, element?: HTMLInputElement): boolean {
		const normalizedValue = this.normalizeForMatch(value)

		if (['false', '0', 'no', 'off', 'unchecked'].includes(normalizedValue)) {
			return false
		}

		if (['true', '1', 'yes', 'on', 'checked'].includes(normalizedValue)) {
			return true
		}

		return Boolean(element?.value && this.normalizeForMatch(element.value) === normalizedValue)
	}

	private resolveSwitchState(element: FormControlElement, desiredValue: string): boolean | null {
		const normalizedDesiredValue = this.normalizeForMatch(desiredValue)
		const onValue = element.getAttribute('data-on-value')
		const offValue = element.getAttribute('data-off-value')

		if (onValue && offValue) {
			if (this.normalizeForMatch(onValue) === normalizedDesiredValue) {
				return true
			}

			if (this.normalizeForMatch(offValue) === normalizedDesiredValue) {
				return false
			}

			if (this.isExplicitBooleanState(normalizedDesiredValue)) {
				return this.resolveCheckboxState(desiredValue)
			}

			return null
		}

		return this.resolveCheckboxState(desiredValue)
	}

	private isExplicitBooleanState(normalizedValue: string): boolean {
		return ['false', '0', 'no', 'off', 'unchecked', 'true', '1', 'yes', 'on', 'checked'].includes(normalizedValue)
	}

	private getAssociatedHiddenInput(element: FormControlElement): HTMLInputElement | null {
		const directId = element.getAttribute('data-hidden-input-id')
		if (directId) {
			const directMatch = document.getElementById(directId)
			if (directMatch instanceof HTMLInputElement && directMatch.type === 'hidden') {
				return directMatch
			}
		}

		const containers = [
			this.getAssociatedForm(element),
			element.closest('section, fieldset, article, div')
		].filter((value): value is Element => value instanceof Element)

		const name = element.getAttribute('name')
		for (const container of containers) {
			const match = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="hidden"]')).find(candidate => {
				if (candidate.getAttribute('data-hidden-input-for') === element.id) {
					return true
				}

				return Boolean(name && candidate.name === name)
			})

			if (match) {
				return match
			}
		}

		return null
	}

	private getAssociatedForm(element: FormControlElement): HTMLFormElement | null {
		if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
			return element.form || element.closest('form')
		}

		return element.closest('form')
	}

	private getMaskPattern(element: HTMLInputElement): string | null {
		return element.getAttribute('data-mask') || element.getAttribute('data-input-mask') || null
	}

	private getMaskSourceCharacters(value: string): string {
		return value.replace(/[^a-zA-Z0-9]/g, '')
	}

	private applyMaskPattern(maskPattern: string, value: string): string {
		let valueIndex = 0
		let maskedValue = ''

		for (const token of maskPattern) {
			const nextValue = value[valueIndex]
			if (!nextValue) {
				break
			}

			if (token === '9') {
				if (/\d/.test(nextValue)) {
					maskedValue += nextValue
					valueIndex += 1
				}
				continue
			}

			if (token === 'a') {
				if (/[a-z]/i.test(nextValue)) {
					maskedValue += nextValue
					valueIndex += 1
				}
				continue
			}

			if (token === '*') {
				maskedValue += nextValue
				valueIndex += 1
				continue
			}

			maskedValue += token
		}

		return maskedValue
	}

	private matchesRadioValue(element: HTMLInputElement, desiredValue: string): boolean {
		const normalizedDesiredValue = this.normalizeForMatch(desiredValue)
		const candidateValues = new Set<string>()

		candidateValues.add(this.normalizeForMatch(element.value || ''))
		candidateValues.add(this.normalizeForMatch(element.getAttribute('aria-label') || ''))

		element.labels?.forEach(label => {
			candidateValues.add(this.normalizeForMatch(label.textContent || ''))
		})

		const parentLabel = element.closest('label')
		if (parentLabel?.textContent) {
			candidateValues.add(this.normalizeForMatch(parentLabel.textContent))
		}

		return candidateValues.has(normalizedDesiredValue)
	}

	private normalizeForMatch(value: string): string {
		return value.trim().toLowerCase().replace(/\s+/g, ' ')
	}

	private getElementValue(element: FormControlElement): string {
		if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
			return element.value
		}

		return element.getAttribute('aria-valuetext') || element.getAttribute('data-value') || element.textContent?.trim() || ''
	}

	private getControlKind(element: FormControlElement): FieldControlKind {
		const role = element.getAttribute('role')
		if (role && ARIA_WIDGET_ROLES.has(role)) {
			return role as FieldControlKind
		}

		if (element.getAttribute('aria-haspopup') === 'listbox' && element.getAttribute('aria-controls')) {
			return 'listbox'
		}

		if (element instanceof HTMLTextAreaElement) return 'textarea'
		if (element instanceof HTMLSelectElement) return 'select'
		if (!(element instanceof HTMLInputElement)) return 'unknown'

		switch (element.type) {
			case 'checkbox':
				return 'checkbox'
			case 'radio':
				return 'radio'
			case 'date':
				return 'date'
			case 'datetime-local':
				return 'datetime'
			case 'number':
				return 'number'
			case 'email':
				return 'email'
			case 'tel':
				return 'tel'
			case 'password':
				return 'password'
			case 'hidden':
				return 'hidden'
			default:
				return 'text'
		}
	}

	private isFormField(element: HTMLElement): element is FormControlElement {
		return element instanceof HTMLInputElement ||
			element instanceof HTMLTextAreaElement ||
			element instanceof HTMLSelectElement ||
			Boolean(element.getAttribute('role') && ARIA_WIDGET_ROLES.has(element.getAttribute('role') || '')) ||
			Boolean(element.getAttribute('aria-haspopup') === 'listbox' && element.getAttribute('aria-controls'))
	}

	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms))
	}

	// User preference management
	async updatePreferences(newPreferences: Partial<ExtensionSettings>): Promise<void> {
		this.userPreferences = { ...this.userPreferences, ...newPreferences }
		await this.storage.saveSettings(this.userPreferences)

		// Refresh UI based on new preferences
		this.refreshAllButtons()
	}

	private refreshAllButtons(): void {
		// Remove all existing buttons
		document.querySelectorAll('.formfilla-btn').forEach(btn => btn.remove())
		this.activeButtons.clear()

		// Re-detect and show buttons based on new preferences
		document.querySelectorAll('input, textarea, select').forEach(element => {
			if (element === document.activeElement) {
				const fieldInfo = this.fieldDetector.detectField(element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)
				if (fieldInfo) {
					const button = this.createFieldButton(element as HTMLElement, fieldInfo)
					if (button) {
						document.body.appendChild(button)
						this.activeButtons.set(element as HTMLElement, button)
					}
				}
			}
		})
	}

	// Clean up
	destroy(): void {
		this.fillSessions.forEach(session => this.cancelFillSession(session))
		this.fillSessions.clear()

		// Remove all buttons
		document.querySelectorAll('.formfilla-btn').forEach(btn => btn.remove())
		this.activeButtons.clear()
	}

	// Public methods for content script
	getLastClickedElement(): HTMLElement | null {
		return this.lastClickedElement
	}

	addButton(element: HTMLElement, fieldInfo: FieldInfo): void {
		const button = this.createFieldButton(element, fieldInfo)
		if (button) {
			document.body.appendChild(button)
			this.activeButtons.set(element, button)
		}
	}

	removeButton(element: HTMLElement): void {
		const button = this.activeButtons.get(element)
		if (button) {
			button.remove()
			this.activeButtons.delete(element)
		}
	}
}
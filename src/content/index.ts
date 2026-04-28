import { FieldDetector } from '../lib/field-detector'
import { InteractionManager } from '../lib/interaction-manager'
import {
	BACKGROUND_REQUEST_TYPES,
	CONTENT_COMMAND_TYPES,
	type BackgroundRequestMessage,
	type BackgroundResponseMessage,
	type ContentCommandMessage,
	type ContentResponseMessage,
	type ExtensionSettings,
	type FieldInfo,
	type ProfileData
} from '../types'
import { validateMessage } from '../lib/security'

const DEFAULT_CONTENT_SETTINGS: ExtensionSettings = {
	autoFillEnabled: true,
	defaultProfile: '',
	fillDelay: 50,
	highlightFields: true,
	showButtons: true,
	buttonPosition: 'inside-right',
	contextMenuEnabled: true,
	autoHideButtons: true,
	buttonStyle: 'minimal'
}

function isProfileDataResponse(response: BackgroundResponseMessage | null): response is { profileData: ProfileData } {
	return Boolean(response && 'profileData' in response)
}

function isSettingsResponse(response: BackgroundResponseMessage | null): response is { settings: ExtensionSettings } {
	return Boolean(response && 'settings' in response)
}

function isErrorResponse(response: BackgroundResponseMessage | null): response is { error: string } {
	return Boolean(response && 'error' in response)
}

export class FormFillaContent {
	private fieldDetector: FieldDetector
	private interactionManager: InteractionManager
	private mutationObserver: MutationObserver | null = null
	private observedForms: Set<HTMLFormElement> = new Set()

	constructor() {
		this.fieldDetector = new FieldDetector()
		this.interactionManager = new InteractionManager()

		this.initialize()
	}

	private initialize(): void {
		// Wait for DOM to be ready
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', () => this.setupFormDetection())
		} else {
			this.setupFormDetection()
		}

		// Set up message listener for background script communication
		chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
			this.handleMessage(message, sender, sendResponse)
			return true // Keep the message channel open for async responses
		})
	}

	private handleMessage(message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: ContentResponseMessage) => void): void {
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
			switch (typedMessage.type) {
				case 'fillField':
					this.interactionManager.handleMessage(typedMessage)
					sendResponse({ success: true })
					break

				case 'fillForm':
					if (typedMessage.profileData) {
						this.handleFormFillRequest(typedMessage.profileData)
						sendResponse({ success: true })
					} else {
						this.fillAllFormsOnPage()
						sendResponse({ success: true })
					}
					break

				case 'getFormFields':
					const forms = document.querySelectorAll('form')
					const fieldCount = Array.from(forms).reduce((count, form) => {
						return count + form.querySelectorAll('input, textarea, select').length
					}, 0)
					sendResponse({ formCount: forms.length, fieldCount })
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

	private handleFormFillRequest(profileData: ProfileData): void {
		const forms = document.querySelectorAll('form')
		forms.forEach(form => {
			const fields = this.fieldDetector.detectFields(form)
			this.fillFormWithData(fields, profileData)
		})
	}

	private fillAllFormsOnPage(): void {
		const forms = document.querySelectorAll('form')
		forms.forEach(form => {
			const fields = this.fieldDetector.detectFields(form)
			this.fillForm(fields)
		})
	}

	private setupFormDetection(): void {
		// Initial scan for forms
		this.scanForms()

		// Set up mutation observer to watch for dynamically added forms
		this.mutationObserver = new MutationObserver((mutations) => {
			let shouldScan = false

			mutations.forEach((mutation) => {
				if (mutation.type === 'childList') {
					mutation.addedNodes.forEach((node) => {
						if (node.nodeType === Node.ELEMENT_NODE) {
							const element = node as Element
							if (element.tagName === 'FORM' || element.querySelector('form')) {
								shouldScan = true
							}
						}
					})
				}
			})

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
		const forms = document.querySelectorAll('form')

		forms.forEach((form, index) => {
			if (this.observedForms.has(form)) return

			const fields = this.fieldDetector.detectFields(form)

			if (fields.size > 0) {
				this.addFormFillButton(form, fields, index)
				this.observedForms.add(form)
			}
		})
	}

	private addFormFillButton(form: HTMLFormElement, fields: Map<HTMLElement, FieldInfo>, _index: number): void {
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
			this.fillForm(fields)
		})

		// Position relative to form
		if (form.style.position === '' || form.style.position === 'static') {
			form.style.position = 'relative'
		}

		form.appendChild(button)
	}

	private handleFieldFocus(event: FocusEvent): void {
		const target = event.target as HTMLElement

		if (this.isFormField(target)) {
			const fieldInfo = this.fieldDetector.detectField(target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)

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
			const fieldInfo = this.fieldDetector.detectField(target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)
			this.interactionManager.enhanceContextMenu(target, fieldInfo)
		}
	}

	private handleFormSubmit(event: SubmitEvent): void {
		// Clean up any buttons when form is submitted
		const form = event.target as HTMLFormElement
		const formButton = form.querySelector('.formfilla-form-btn')
		if (formButton) {
			formButton.remove()
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

	private async fillForm(fields: Map<HTMLElement, FieldInfo>): Promise<void> {
		try {
			// Try to get profile data with retry logic in case background script is still initializing
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
					await new Promise(resolve => setTimeout(resolve, 500)) // Wait 500ms before retry
					retryCount++
				} else {
					break
				}
			}

			if (isProfileDataResponse(response)) {
				await this.fillFormWithData(fields, response.profileData)
			} else {
				// If still no response after retries, show error
				console.warn('FormFilla: No profile data received after retries')
				this.showUserMessage('FormFilla: Unable to get profile data. Please try again.')
			}
		} catch (error) {
			console.error('FormFilla: Failed to get profile data:', error)
			this.showUserMessage('FormFilla: Unable to fill form. Please try again.')
		}
	}

	private async fillFormWithData(fields: Map<HTMLElement, FieldInfo>, profileData: ProfileData): Promise<void> {
		const settings = await this.getSettings()

		for (const [element, fieldInfo] of fields) {
			const value = this.getValueForField(profileData, fieldInfo)
			if (value) {
				await this.fillField(element, value, settings.fillDelay)
			}
		}
	}

	private getValueForField(profileData: ProfileData, fieldInfo: FieldInfo): string {
		// Special handling for bio field which is stored in custom data
		if (fieldInfo.type === 'personal' && fieldInfo.subtype === 'bio') {
			return profileData.custom?.bio || ''
		}

		const path = `${fieldInfo.type}.${fieldInfo.subtype}`
		const value = this.getNestedValue(profileData, path)
		return typeof value === 'string' ? value : ''
	}

	private getNestedValue(obj: unknown, path: string): unknown {
		return path.split('.').reduce<unknown>((current, segment) => {
			if (!current || typeof current !== 'object' || Array.isArray(current)) {
				return undefined
			}

			return (current as Record<string, unknown>)[segment]
		}, obj)
	}

	private async fillField(element: HTMLElement, value: string, delay: number = 0): Promise<void> {
		if (!this.isFormField(element)) return

		const inputElement = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

		// Focus the field
		inputElement.focus()

		if (inputElement instanceof HTMLInputElement &&
			(inputElement.type === 'checkbox' || inputElement.type === 'radio')) {
			inputElement.checked = Boolean(value)
		} else if (inputElement instanceof HTMLSelectElement) {
			// Try to find matching option
			const option = Array.from(inputElement.options).find(opt =>
				opt.value === value || opt.textContent === value
			)
			if (option) {
				inputElement.value = option.value
			}
		} else {
			// Simulate human-like typing
			if (delay > 0) {
				inputElement.value = ''
				for (const char of value) {
					inputElement.value += char
					inputElement.dispatchEvent(new Event('input', { bubbles: true }))
					await this.delay(delay)
				}
			} else {
				inputElement.value = value
				inputElement.dispatchEvent(new Event('input', { bubbles: true }))
			}
		}

		// Trigger change event
		inputElement.dispatchEvent(new Event('change', { bubbles: true }))

		// Add visual feedback
		this.addFillFeedback(inputElement)

		inputElement.blur()
	}

	private addFillFeedback(element: HTMLElement): void {
		// Add temporary highlight to show field was filled
		const originalBorder = element.style.border
		const originalBoxShadow = element.style.boxShadow

		element.style.border = '2px solid #4CAF50'
		element.style.boxShadow = '0 0 5px rgba(76, 175, 80, 0.5)'

		setTimeout(() => {
			element.style.border = originalBorder
			element.style.boxShadow = originalBoxShadow
		}, 1000)
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

	private async getSettings(): Promise<ExtensionSettings> {
		const message: BackgroundRequestMessage = { type: 'getSettings' }
		const validation = validateMessage(message, BACKGROUND_REQUEST_TYPES)

		if (!validation.isValid) {
			console.error('FormFilla: Invalid outgoing message:', validation.error)
			return DEFAULT_CONTENT_SETTINGS
		}

		try {
			const response = await this.sendMessageSafely(message)
			if (isSettingsResponse(response)) {
				return response.settings
			}

			if (isErrorResponse(response)) {
				console.error('FormFilla: Background error while loading settings:', response.error)
			}

			return DEFAULT_CONTENT_SETTINGS
		} catch (error) {
			console.error('FormFilla: Failed to get settings:', error)
			return DEFAULT_CONTENT_SETTINGS
		}
	}

	private isFormField(element: HTMLElement): boolean {
		return element.tagName === 'INPUT' ||
			element.tagName === 'TEXTAREA' ||
			element.tagName === 'SELECT'
	}

	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms))
	}

	// Cleanup method
	public destroy(): void {
		if (this.mutationObserver) {
			this.mutationObserver.disconnect()
		}

		this.interactionManager.destroy()

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
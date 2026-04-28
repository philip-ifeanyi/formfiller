import { FieldInfo, StorageData } from '@/types'
import { FieldDetector } from './field-detector'
import { StorageService } from './storage'
import { sanitizeFieldValue } from './security'

export class InteractionManager {
	private userPreferences: StorageData['settings']
	private activeButtons = new Map<HTMLElement, HTMLElement>()
	private fieldDetector: FieldDetector
	private storage: StorageService
	private lastClickedElement: HTMLElement | null = null

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
			buttonStyle: 'minimal'
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
				chrome.runtime.sendMessage({
					type: 'updateContextMenu',
					fieldType: `${fieldInfo.type}.${fieldInfo.subtype}`,
					fieldDisplayName: this.fieldDetector.getFieldTypeDisplayName(fieldInfo.type, fieldInfo.subtype)
				})
			}
		})
	}

	// Handle messages from background script
	handleMessage(message: any): void {
		switch (message.type) {
			case 'fillField':
				if (this.lastClickedElement && this.isFormField(this.lastClickedElement)) {
					this.setFieldValue(this.lastClickedElement, message.value)
				}
				break

			case 'fillForm':
				this.fillEntireForm(message.profileData)
				break
		}
	}

	private async fillFieldDefault(element: HTMLElement, fieldInfo: FieldInfo): Promise<void> {
		// Send message to background script to get default value
		chrome.runtime.sendMessage({
			type: 'getFieldValue',
			fieldType: fieldInfo.type,
			subtype: fieldInfo.subtype
		}, (response) => {
			if (response && response.value) {
				this.setFieldValue(element, response.value)
			}
		})
	}

	private async fillEntireForm(profileData: any): Promise<void> {
		const forms = document.querySelectorAll('form')

		for (const form of forms) {
			const fields = this.fieldDetector.detectFields(form)

			for (const [element, fieldInfo] of fields) {
				const value = this.getValueFromProfile(profileData, fieldInfo.type, fieldInfo.subtype)
				if (value) {
					await this.setFieldValue(element, value)
					await this.delay(this.userPreferences.fillDelay)
				}
			}
		}
	}

	private getValueFromProfile(profileData: any, type: string, subtype: string): string {
		// Special handling for bio field which is stored in custom data
		if (type === 'personal' && subtype === 'bio') {
			return profileData.custom?.bio || ''
		}

		const path = `${type}.${subtype}`
		return this.getNestedValue(profileData, path) || ''
	}

	private getNestedValue(obj: any, path: string): any {
		return path.split('.').reduce((o, p) => o?.[p], obj)
	}

	private async setFieldValue(element: HTMLElement, value: string): Promise<void> {
		if (!this.isFormField(element)) return

		const inputElement = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

		// Determine field type for sanitization
		let fieldType = 'text'
		if (inputElement instanceof HTMLInputElement) {
			fieldType = inputElement.type
			if (inputElement.name?.toLowerCase().includes('email')) fieldType = 'email'
			if (inputElement.name?.toLowerCase().includes('phone')) fieldType = 'phone'
			if (inputElement.name?.toLowerCase().includes('url')) fieldType = 'url'
		}

		// Sanitize the value before setting
		const sanitizedValue = sanitizeFieldValue(value, fieldType)

		// Focus the element first
		inputElement.focus()

		if (inputElement instanceof HTMLInputElement &&
			(inputElement.type === 'checkbox' || inputElement.type === 'radio')) {
			inputElement.checked = Boolean(sanitizedValue)
		} else if (inputElement instanceof HTMLSelectElement) {
			inputElement.value = sanitizedValue
		} else {
			// Simulate typing for better compatibility
			if (this.userPreferences.fillDelay > 0) {
				inputElement.value = ''
				for (const char of sanitizedValue) {
					inputElement.value += char
					inputElement.dispatchEvent(new Event('input', { bubbles: true }))
					await this.delay(this.userPreferences.fillDelay)
				}
			} else {
				inputElement.value = sanitizedValue
				inputElement.dispatchEvent(new Event('input', { bubbles: true }))
			}
		}

		// Trigger change event
		inputElement.dispatchEvent(new Event('change', { bubbles: true }))
		inputElement.blur()
	}

	private isFormField(element: HTMLElement): boolean {
		return element.tagName === 'INPUT' ||
			element.tagName === 'TEXTAREA' ||
			element.tagName === 'SELECT'
	}

	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms))
	}

	// User preference management
	async updatePreferences(newPreferences: Partial<StorageData['settings']>): Promise<void> {
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
import { validateProfileData } from '@/lib/security'
import { ProfileManager } from '@/lib/profiles'
import { StorageService } from '@/lib/storage'
import type { ExtensionSettings, Profile, ProfileData } from '@/types'

type NotificationType = 'success' | 'error'
type ProfileSectionKey = Exclude<keyof ProfileData, 'custom'>

interface ProfileFieldConfig {
	id: string
	section: ProfileSectionKey
	key: string
	label: string
	type: 'text' | 'email' | 'tel' | 'date' | 'number' | 'url' | 'password'
	placeholder?: string
	autocomplete?: string
	inputMode?: string
	fullWidth?: boolean
}

interface ProfileFieldGroup {
	title: string
	description: string
	fields: ProfileFieldConfig[]
}

interface OptionsElements {
	notifications: HTMLElement
	profilesContainer: HTMLElement
	autoFillEnabled: HTMLInputElement
	fillDelay: HTMLInputElement
	showButtons: HTMLInputElement
	buttonPosition: HTMLSelectElement
	contextMenuEnabled: HTMLInputElement
	autoHideButtons: HTMLInputElement
	buttonStyle: HTMLSelectElement
	debugMode: HTMLInputElement
	featureFlags: HTMLTextAreaElement
	saveSettingsButton: HTMLButtonElement
	addProfileButton: HTMLButtonElement
	exportProfilesButton: HTMLButtonElement
	importProfilesButton: HTMLButtonElement
	importFileInput: HTMLInputElement
	profileModal: HTMLElement
	profileForm: HTMLFormElement
	profileModalTitle: HTMLElement
	profileName: HTMLInputElement
	makeDefault: HTMLInputElement
	defaultHelp: HTMLElement
	profileValidation: HTMLElement
	customFieldsContainer: HTMLElement
	addCustomFieldButton: HTMLButtonElement
	closeModalButton: HTMLButtonElement
	cancelModalButton: HTMLButtonElement
}

const PROFILE_FIELD_GROUPS: ProfileFieldGroup[] = [
	{
		title: 'Personal',
		description: 'Core identity and contact values used across sign-up, onboarding, and checkout forms.',
		fields: [
			{ id: 'profile-personal-first-name', section: 'personal', key: 'firstName', label: 'First name', type: 'text', autocomplete: 'given-name' },
			{ id: 'profile-personal-last-name', section: 'personal', key: 'lastName', label: 'Last name', type: 'text', autocomplete: 'family-name' },
			{ id: 'profile-personal-full-name', section: 'personal', key: 'fullName', label: 'Full name', type: 'text', autocomplete: 'name', fullWidth: true },
			{ id: 'profile-personal-email', section: 'personal', key: 'email', label: 'Email', type: 'email', autocomplete: 'email' },
			{ id: 'profile-personal-phone', section: 'personal', key: 'phone', label: 'Phone', type: 'tel', autocomplete: 'tel', inputMode: 'tel' },
			{ id: 'profile-personal-date-of-birth', section: 'personal', key: 'dateOfBirth', label: 'Date of birth', type: 'date', autocomplete: 'bday' },
			{ id: 'profile-personal-age', section: 'personal', key: 'age', label: 'Age', type: 'number', inputMode: 'numeric' },
			{ id: 'profile-personal-gender', section: 'personal', key: 'gender', label: 'Gender', type: 'text' },
			{ id: 'profile-personal-ssn', section: 'personal', key: 'ssn', label: 'SSN', type: 'text', fullWidth: true }
		]
	},
	{
		title: 'Address',
		description: 'Shipping, billing, and contact address values.',
		fields: [
			{ id: 'profile-address-street', section: 'address', key: 'street', label: 'Street', type: 'text', autocomplete: 'address-line1', fullWidth: true },
			{ id: 'profile-address-street2', section: 'address', key: 'street2', label: 'Street line 2', type: 'text', autocomplete: 'address-line2', fullWidth: true },
			{ id: 'profile-address-city', section: 'address', key: 'city', label: 'City', type: 'text', autocomplete: 'address-level2' },
			{ id: 'profile-address-state', section: 'address', key: 'state', label: 'State or province', type: 'text', autocomplete: 'address-level1' },
			{ id: 'profile-address-zip', section: 'address', key: 'zip', label: 'Postal code', type: 'text', autocomplete: 'postal-code' },
			{ id: 'profile-address-country', section: 'address', key: 'country', label: 'Country', type: 'text', autocomplete: 'country-name' }
		]
	},
	{
		title: 'Company',
		description: 'Employer and organization details used by work and B2B forms.',
		fields: [
			{ id: 'profile-company-name', section: 'company', key: 'name', label: 'Company name', type: 'text' },
			{ id: 'profile-company-title', section: 'company', key: 'title', label: 'Job title', type: 'text' },
			{ id: 'profile-company-department', section: 'company', key: 'department', label: 'Department', type: 'text' },
			{ id: 'profile-company-website', section: 'company', key: 'website', label: 'Website', type: 'url', fullWidth: true }
		]
	},
	{
		title: 'Payment',
		description: 'Test payment values. Use only with dummy or sandbox data.',
		fields: [
			{ id: 'profile-payment-card-number', section: 'payment', key: 'cardNumber', label: 'Card number', type: 'text', inputMode: 'numeric' },
			{ id: 'profile-payment-expiry', section: 'payment', key: 'expiry', label: 'Expiry', type: 'text', placeholder: 'MM/YY' },
			{ id: 'profile-payment-cvv', section: 'payment', key: 'cvv', label: 'CVV', type: 'password', inputMode: 'numeric' },
			{ id: 'profile-payment-cardholder-name', section: 'payment', key: 'cardholderName', label: 'Cardholder name', type: 'text', fullWidth: true }
		]
	},
	{
		title: 'Account',
		description: 'Credentials and account-specific values.',
		fields: [
			{ id: 'profile-account-username', section: 'account', key: 'username', label: 'Username', type: 'text', autocomplete: 'username' },
			{ id: 'profile-account-password', section: 'account', key: 'password', label: 'Password', type: 'password', autocomplete: 'new-password', fullWidth: true }
		]
	}
]

function createEmptyProfileData(): ProfileData {
	return {
		personal: {
			firstName: '',
			lastName: '',
			fullName: '',
			email: '',
			phone: '',
			dateOfBirth: '',
			age: '',
			gender: '',
			ssn: ''
		},
		address: {
			street: '',
			street2: '',
			city: '',
			state: '',
			zip: '',
			country: ''
		},
		company: {
			name: '',
			title: '',
			department: '',
			website: ''
		},
		payment: {
			cardNumber: '',
			expiry: '',
			cvv: '',
			cardholderName: ''
		},
		account: {
			username: '',
			password: ''
		},
		custom: {}
	}
}

class OptionsUI {
	private storage: StorageService
	private profileManager: ProfileManager
	private elements: OptionsElements
	private editingProfile: Profile | null = null

	constructor() {
		this.storage = StorageService.getInstance()
		this.profileManager = new ProfileManager(this.storage)
		this.elements = this.getElements()
		void this.initialize()
	}

	private async initialize(): Promise<void> {
		await Promise.all([this.loadSettings(), this.loadProfiles()])
		this.setupEventListeners()
		this.closeProfileForm(false)
	}

	private getElements(): OptionsElements {
		return {
			notifications: document.getElementById('notifications')!,
			profilesContainer: document.getElementById('profiles-container')!,
			autoFillEnabled: document.getElementById('auto-fill-enabled') as HTMLInputElement,
			fillDelay: document.getElementById('fill-delay') as HTMLInputElement,
			showButtons: document.getElementById('show-buttons') as HTMLInputElement,
			buttonPosition: document.getElementById('button-position') as HTMLSelectElement,
			contextMenuEnabled: document.getElementById('context-menu-enabled') as HTMLInputElement,
			autoHideButtons: document.getElementById('auto-hide-buttons') as HTMLInputElement,
			buttonStyle: document.getElementById('button-style') as HTMLSelectElement,
			debugMode: document.getElementById('debug-mode') as HTMLInputElement,
			featureFlags: document.getElementById('feature-flags') as HTMLTextAreaElement,
			saveSettingsButton: document.getElementById('save-settings') as HTMLButtonElement,
			addProfileButton: document.getElementById('add-profile') as HTMLButtonElement,
			exportProfilesButton: document.getElementById('export-profiles') as HTMLButtonElement,
			importProfilesButton: document.getElementById('import-profiles') as HTMLButtonElement,
			importFileInput: document.getElementById('import-file') as HTMLInputElement,
			profileModal: document.getElementById('profile-modal')!,
			profileForm: document.getElementById('profile-form') as HTMLFormElement,
			profileModalTitle: document.getElementById('profile-modal-title')!,
			profileName: document.getElementById('profile-name') as HTMLInputElement,
			makeDefault: document.getElementById('profile-make-default') as HTMLInputElement,
			defaultHelp: document.getElementById('profile-default-help')!,
			profileValidation: document.getElementById('profile-validation')!,
			customFieldsContainer: document.getElementById('custom-fields-container')!,
			addCustomFieldButton: document.getElementById('add-custom-field') as HTMLButtonElement,
			closeModalButton: document.getElementById('close-profile-modal') as HTMLButtonElement,
			cancelModalButton: document.getElementById('cancel-profile-form') as HTMLButtonElement
		}
	}

	private setupEventListeners(): void {
		this.elements.saveSettingsButton.addEventListener('click', () => {
			void this.saveSettings()
		})
		this.elements.addProfileButton.addEventListener('click', () => {
			this.addNewProfile()
		})
		this.elements.exportProfilesButton.addEventListener('click', () => {
			void this.exportProfiles()
		})
		this.elements.importProfilesButton.addEventListener('click', () => {
			this.importProfiles()
		})
		this.elements.importFileInput.addEventListener('change', (event) => {
			void this.handleFileImport(event)
		})
		this.elements.profileForm.addEventListener('submit', (event) => {
			void this.handleProfileSubmit(event)
		})
		this.elements.closeModalButton.addEventListener('click', () => {
			this.closeProfileForm()
		})
		this.elements.cancelModalButton.addEventListener('click', () => {
			this.closeProfileForm()
		})
		this.elements.addCustomFieldButton.addEventListener('click', () => {
			this.appendCustomFieldRow()
		})
		this.elements.profileModal.addEventListener('click', (event) => {
			if (event.target === this.elements.profileModal) {
				this.closeProfileForm()
			}
		})
		document.addEventListener('keydown', (event) => {
			if (event.key === 'Escape' && !this.elements.profileModal.classList.contains('hidden')) {
				this.closeProfileForm()
			}
		})
	}

	private async loadSettings(): Promise<void> {
		const settings = await this.storage.getSettings()
		this.elements.autoFillEnabled.checked = settings.autoFillEnabled
		this.elements.fillDelay.value = settings.fillDelay.toString()
		this.elements.showButtons.checked = settings.showButtons
		this.elements.buttonPosition.value = settings.buttonPosition
		this.elements.contextMenuEnabled.checked = settings.contextMenuEnabled
		this.elements.autoHideButtons.checked = settings.autoHideButtons
		this.elements.buttonStyle.value = settings.buttonStyle
		this.elements.debugMode.checked = Boolean(settings.debugMode)
		this.elements.featureFlags.value = this.formatFeatureFlags(settings.featureFlags)
	}

	private async loadProfiles(): Promise<void> {
		const profiles = await this.profileManager.getAllProfiles()
		const container = this.elements.profilesContainer

		container.innerHTML = ''

		if (profiles.length === 0) {
			const emptyState = document.createElement('div')
			emptyState.className = 'empty-state'

			const title = document.createElement('strong')
			title.textContent = 'No profiles created yet.'

			const copy = document.createElement('p')
			copy.textContent = 'Create a persona with grouped canonical fields and any custom values you need for test environments.'

			emptyState.append(title, copy)
			container.appendChild(emptyState)
			return
		}

		const profileGrid = document.createElement('div')
		profileGrid.className = 'profile-grid'

		profiles.forEach(profile => {
			profileGrid.appendChild(this.createProfileCardElement(profile))
		})

		container.appendChild(profileGrid)
	}

	private createProfileCardElement(profile: Profile): HTMLElement {
		const card = document.createElement('article')
		card.className = 'profile-card'
		card.dataset.id = profile.id

		const header = document.createElement('div')
		header.className = 'profile-card-header'

		const titleBlock = document.createElement('div')

		const title = document.createElement('h3')
		title.textContent = profile.name

		const subtitle = document.createElement('p')
		subtitle.className = 'profile-card-copy'
		subtitle.textContent = this.buildProfileSubtitle(profile)

		titleBlock.append(title, subtitle)

		header.appendChild(titleBlock)

		if (profile.isDefault) {
			const badge = document.createElement('span')
			badge.className = 'profile-badge'
			badge.textContent = 'Default'
			header.appendChild(badge)
		}

		const meta = document.createElement('dl')
		meta.className = 'profile-meta'
		this.appendMetaItem(meta, 'Email', profile.data.personal.email || 'Not set')
		this.appendMetaItem(meta, 'Phone', profile.data.personal.phone || 'Not set')
		this.appendMetaItem(meta, 'Updated', new Date(profile.updatedAt).toLocaleDateString())

		const actions = document.createElement('div')
		actions.className = 'profile-actions'

		actions.appendChild(this.createActionButton('Edit', 'btn btn-primary btn-sm', () => {
			void this.editProfile(profile.id)
		}))
		actions.appendChild(this.createActionButton('Duplicate', 'btn btn-secondary btn-sm', () => {
			void this.duplicateProfile(profile.id)
		}))

		if (!profile.isDefault) {
			actions.appendChild(this.createActionButton('Set Default', 'btn btn-secondary btn-sm', () => {
				void this.setDefault(profile.id)
			}))
		}

		actions.appendChild(this.createActionButton('Delete', 'btn btn-danger btn-sm', () => {
			void this.deleteProfile(profile.id)
		}))

		card.append(header, meta, actions)
		return card
	}

	private appendMetaItem(list: HTMLElement, label: string, value: string): void {
		const term = document.createElement('dt')
		term.textContent = label

		const description = document.createElement('dd')
		description.textContent = value

		list.append(term, description)
	}

	private createActionButton(label: string, className: string, onClick: () => void): HTMLButtonElement {
		const button = document.createElement('button')
		button.type = 'button'
		button.className = className
		button.textContent = label
		button.addEventListener('click', onClick)
		return button
	}

	private buildProfileSubtitle(profile: Profile): string {
		const name = profile.data.personal.fullName || [profile.data.personal.firstName, profile.data.personal.lastName].filter(Boolean).join(' ').trim()
		if (name) {
			return name
		}

		return 'Structured persona ready for grouped field mapping.'
	}

	private async saveSettings(): Promise<void> {
		try {
			const fillDelay = Number.parseInt(this.elements.fillDelay.value, 10)
			const featureFlags = this.parseFeatureFlags(this.elements.featureFlags.value)

			const settings: Partial<ExtensionSettings> = {
				autoFillEnabled: this.elements.autoFillEnabled.checked,
				fillDelay: Number.isFinite(fillDelay) && fillDelay >= 0 ? fillDelay : 0,
				showButtons: this.elements.showButtons.checked,
				buttonPosition: this.elements.buttonPosition.value as ExtensionSettings['buttonPosition'],
				contextMenuEnabled: this.elements.contextMenuEnabled.checked,
				autoHideButtons: this.elements.autoHideButtons.checked,
				buttonStyle: this.elements.buttonStyle.value as ExtensionSettings['buttonStyle'],
				debugMode: this.elements.debugMode.checked,
				featureFlags
			}

			await this.storage.saveSettings(settings)
			this.showNotification('Settings saved successfully.', 'success')
		} catch (error) {
			this.showNotification(error instanceof Error ? error.message : 'Failed to save settings.', 'error')
		}
	}

	private parseFeatureFlags(rawValue: string): Record<string, boolean> {
		const trimmedValue = rawValue.trim()
		if (!trimmedValue) {
			return {}
		}

		let parsed: unknown
		try {
			parsed = JSON.parse(trimmedValue)
		} catch {
			throw new Error('Feature flags must be valid JSON.')
		}

		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new Error('Feature flags must be a JSON object of boolean values.')
		}

		return Object.entries(parsed).reduce<Record<string, boolean>>((accumulator, [key, value]) => {
			if (typeof value !== 'boolean') {
				throw new Error(`Feature flag "${key}" must be true or false.`)
			}

			accumulator[key] = value
			return accumulator
		}, {})
	}

	private formatFeatureFlags(featureFlags?: Record<string, boolean>): string {
		if (!featureFlags || Object.keys(featureFlags).length === 0) {
			return ''
		}

		return JSON.stringify(featureFlags, null, 2)
	}

	private addNewProfile(): void {
		this.showProfileForm()
	}

	private async editProfile(id: string): Promise<void> {
		const profile = await this.profileManager.getProfile(id)
		if (profile) {
			this.showProfileForm(profile)
		}
	}

	private async duplicateProfile(id: string): Promise<void> {
		try {
			await this.profileManager.duplicateProfile(id)
			await this.loadProfiles()
			this.showNotification('Profile duplicated successfully.', 'success')
		} catch {
			this.showNotification('Failed to duplicate profile.', 'error')
		}
	}

	private async setDefault(id: string): Promise<void> {
		try {
			await this.profileManager.setDefaultProfile(id)
			await this.loadProfiles()
			this.showNotification('Default profile updated.', 'success')
		} catch {
			this.showNotification('Failed to set default profile.', 'error')
		}
	}

	private async deleteProfile(id: string): Promise<void> {
		if (!confirm('Delete this profile? This cannot be undone.')) {
			return
		}

		try {
			await this.profileManager.deleteProfile(id)
			await this.loadProfiles()
			this.showNotification('Profile deleted successfully.', 'success')
		} catch {
			this.showNotification('Failed to delete profile.', 'error')
		}
	}

	private showProfileForm(profile?: Profile): void {
		this.editingProfile = profile ?? null
		const profileData = profile ? this.cloneProfileData(profile.data) : createEmptyProfileData()

		this.elements.profileModalTitle.textContent = profile ? `Edit ${profile.name}` : 'Create Profile'
		this.elements.profileName.value = profile?.name ?? ''
		this.elements.makeDefault.checked = Boolean(profile?.isDefault)
		this.elements.makeDefault.disabled = Boolean(profile?.isDefault)
		this.elements.defaultHelp.textContent = profile?.isDefault
			? 'This persona is already the default profile.'
			: 'Enable this to make the persona the default after saving.'
		this.populateProfileFields(profileData)
		this.renderCustomFields(profileData.custom)
		this.clearProfileValidation()

		this.elements.profileModal.classList.remove('hidden')
		this.elements.profileModal.setAttribute('aria-hidden', 'false')
		document.body.classList.add('modal-open')
		this.elements.profileName.focus()
	}

	private closeProfileForm(resetForm: boolean = true): void {
		this.editingProfile = null
		this.elements.profileModal.classList.add('hidden')
		this.elements.profileModal.setAttribute('aria-hidden', 'true')
		document.body.classList.remove('modal-open')
		this.clearProfileValidation()

		if (resetForm) {
			this.elements.profileForm.reset()
			this.renderCustomFields({})
			this.elements.makeDefault.disabled = false
		}
	}

	private populateProfileFields(profileData: ProfileData): void {
		PROFILE_FIELD_GROUPS.forEach(group => {
			group.fields.forEach(field => {
				const input = document.getElementById(field.id) as HTMLInputElement
				input.value = this.getProfileFieldValue(profileData, field.section, field.key)
			})
		})
	}

	private getProfileFieldValue(profileData: ProfileData, section: ProfileSectionKey, key: string): string {
		return ((profileData[section] as Record<string, string | undefined>)[key] || '').toString()
	}

	private cloneProfileData(profileData: ProfileData): ProfileData {
		return {
			personal: { ...profileData.personal },
			address: { ...profileData.address },
			company: { ...profileData.company },
			payment: { ...profileData.payment },
			account: { ...profileData.account },
			custom: { ...profileData.custom }
		}
	}

	private renderCustomFields(customFields: Record<string, string>): void {
		this.elements.customFieldsContainer.innerHTML = ''

		const entries = Object.entries(customFields)
		if (entries.length === 0) {
			this.appendCustomFieldRow()
			return
		}

		entries.forEach(([key, value]) => {
			this.appendCustomFieldRow(key, value)
		})
	}

	private appendCustomFieldRow(key: string = '', value: string = ''): void {
		const row = document.createElement('div')
		row.className = 'custom-field-row'

		const keyInput = document.createElement('input')
		keyInput.type = 'text'
		keyInput.className = 'custom-field-key'
		keyInput.placeholder = 'custom.key'
		keyInput.value = key

		const valueInput = document.createElement('input')
		valueInput.type = 'text'
		valueInput.className = 'custom-field-value'
		valueInput.placeholder = 'Value'
		valueInput.value = value

		const removeButton = document.createElement('button')
		removeButton.type = 'button'
		removeButton.className = 'btn btn-secondary btn-sm'
		removeButton.textContent = 'Remove'
		removeButton.addEventListener('click', () => {
			row.remove()
			if (this.elements.customFieldsContainer.children.length === 0) {
				this.appendCustomFieldRow()
			}
		})

		row.append(keyInput, valueInput, removeButton)
		this.elements.customFieldsContainer.appendChild(row)
	}

	private async handleProfileSubmit(event: Event): Promise<void> {
		event.preventDefault()

		if (!this.elements.profileForm.reportValidity()) {
			return
		}

		const profileName = this.elements.profileName.value.trim()
		const { data, errors: customFieldErrors } = this.collectProfileFormData()
		const validation = validateProfileData(data)
		const errors = [...customFieldErrors, ...validation.errors]

		if (!profileName) {
			errors.unshift('Profile name is required.')
		}

		if (errors.length > 0) {
			this.renderProfileValidation(errors)
			return
		}

		const isEditing = Boolean(this.editingProfile)

		try {
			let savedProfile: Profile | null

			if (this.editingProfile) {
				savedProfile = await this.profileManager.updateProfile(this.editingProfile.id, {
					name: profileName,
					data
				})
			} else {
				savedProfile = await this.profileManager.createProfile({
					name: profileName,
					isDefault: false,
					data
				})
			}

			if (!savedProfile) {
				throw new Error('Profile could not be saved.')
			}

			if (this.elements.makeDefault.checked && !this.elements.makeDefault.disabled) {
				await this.profileManager.setDefaultProfile(savedProfile.id)
			}

			await this.loadProfiles()
			this.closeProfileForm()
			this.showNotification(isEditing ? 'Profile updated successfully.' : 'Profile created successfully.', 'success')
		} catch (error) {
			this.renderProfileValidation([
				error instanceof Error ? error.message : 'Failed to save profile.'
			])
		}
	}

	private collectProfileFormData(): { data: ProfileData; errors: string[] } {
		const data = createEmptyProfileData()
		const errors: string[] = []

		PROFILE_FIELD_GROUPS.forEach(group => {
			group.fields.forEach(field => {
				const input = document.getElementById(field.id) as HTMLInputElement
				const value = input.value.trim()
				;(data[field.section] as Record<string, string>)[field.key] = value
			})
		})

		if (!data.personal.fullName) {
			data.personal.fullName = [data.personal.firstName, data.personal.lastName].filter(Boolean).join(' ').trim()
		}

		const customFields = this.readCustomFields()
		data.custom = customFields.values
		errors.push(...customFields.errors)

		return { data, errors }
	}

	private readCustomFields(): { values: Record<string, string>; errors: string[] } {
		const values: Record<string, string> = {}
		const errors: string[] = []
		const seenKeys = new Set<string>()

		Array.from(this.elements.customFieldsContainer.querySelectorAll<HTMLElement>('.custom-field-row')).forEach(row => {
			const keyInput = row.querySelector<HTMLInputElement>('.custom-field-key')
			const valueInput = row.querySelector<HTMLInputElement>('.custom-field-value')

			const key = keyInput?.value.trim() || ''
			const value = valueInput?.value.trim() || ''

			if (!key && !value) {
				return
			}

			if (!key) {
				errors.push('Custom fields with values must include a key.')
				return
			}

			if (!/^[a-zA-Z0-9._-]+$/.test(key)) {
				errors.push(`Custom field key "${key}" must only use letters, numbers, dots, dashes, or underscores.`)
				return
			}

			if (seenKeys.has(key)) {
				errors.push(`Custom field key "${key}" is duplicated.`)
				return
			}

			seenKeys.add(key)
			values[key] = value
		})

		return { values, errors }
	}

	private renderProfileValidation(errors: string[]): void {
		this.elements.profileValidation.innerHTML = ''
		this.elements.profileValidation.classList.remove('hidden')

		const title = document.createElement('strong')
		title.textContent = 'Please fix the following before saving:'

		const list = document.createElement('ul')
		errors.forEach(error => {
			const item = document.createElement('li')
			item.textContent = error
			list.appendChild(item)
		})

		this.elements.profileValidation.append(title, list)
	}

	private clearProfileValidation(): void {
		this.elements.profileValidation.classList.add('hidden')
		this.elements.profileValidation.innerHTML = ''
	}

	private async exportProfiles(): Promise<void> {
		try {
			const exportData = await this.profileManager.exportProfiles()
			const blob = new Blob([exportData], { type: 'application/json' })
			const url = URL.createObjectURL(blob)

			const anchor = document.createElement('a')
			anchor.href = url
			anchor.download = `formfilla-profiles-${new Date().toISOString().split('T')[0]}.json`
			document.body.appendChild(anchor)
			anchor.click()
			document.body.removeChild(anchor)
			URL.revokeObjectURL(url)

			this.showNotification('Profiles exported successfully.', 'success')
		} catch {
			this.showNotification('Failed to export profiles.', 'error')
		}
	}

	private importProfiles(): void {
		this.elements.importFileInput.click()
	}

	private async handleFileImport(event: Event): Promise<void> {
		const input = event.target as HTMLInputElement
		const file = input.files?.[0]
		if (!file) {
			return
		}

		try {
			const text = await file.text()
			const replaceExisting = confirm('Replace existing profiles? Click OK to replace them, or Cancel to merge the imported personas with the current list.')

			await this.profileManager.importProfiles(text, replaceExisting)
			await this.loadProfiles()
			this.showNotification('Profiles imported successfully.', 'success')
		} catch (error) {
			this.showNotification(error instanceof Error ? error.message : 'Failed to import profiles.', 'error')
		} finally {
			input.value = ''
		}
	}

	private showNotification(message: string, type: NotificationType): void {
		const notification = document.createElement('div')
		notification.className = `notification ${type}`
		notification.textContent = message

		this.elements.notifications.appendChild(notification)

		window.setTimeout(() => {
			notification.remove()
		}, 5000)
	}
}

document.addEventListener('DOMContentLoaded', () => {
	void new OptionsUI()
})
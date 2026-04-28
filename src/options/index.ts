import { StorageService } from '@/lib/storage'
import { ProfileManager } from '@/lib/profiles'
import { Profile } from '@/types'

class OptionsUI {
	private storage: StorageService
	private profileManager: ProfileManager

	constructor() {
		this.storage = StorageService.getInstance()
		this.profileManager = new ProfileManager(this.storage)
		this.initialize()
	}

	private async initialize(): Promise<void> {
		await this.loadSettings()
		await this.loadProfiles()
		this.setupEventListeners()
	}

	private async loadSettings(): Promise<void> {
		const settings = await this.storage.getSettings()

			; (document.getElementById('auto-fill-enabled') as HTMLInputElement).checked = settings.autoFillEnabled
			; (document.getElementById('fill-delay') as HTMLInputElement).value = settings.fillDelay.toString()
			; (document.getElementById('show-buttons') as HTMLInputElement).checked = settings.showButtons
			; (document.getElementById('button-position') as HTMLSelectElement).value = settings.buttonPosition
			; (document.getElementById('context-menu-enabled') as HTMLInputElement).checked = settings.contextMenuEnabled
	}

	private async loadProfiles(): Promise<void> {
		const profiles = await this.profileManager.getAllProfiles()
		const container = document.getElementById('profiles-container')!

		if (profiles.length === 0) {
			container.innerHTML = ''
			const emptyMessage = document.createElement('p')
			emptyMessage.textContent = 'No profiles created yet.'
			container.appendChild(emptyMessage)
			return
		}

		// Clear existing content
		container.innerHTML = ''

		// Create profile grid
		const profileGrid = document.createElement('div')
		profileGrid.className = 'profile-grid'

		profiles.forEach(profile => {
			const profileCard = this.createProfileCardElement(profile)
			profileGrid.appendChild(profileCard)
		})

		container.appendChild(profileGrid)
	}

	private createProfileCardElement(profile: Profile): HTMLElement {
		const card = document.createElement('div')
		card.className = 'profile-card'
		card.dataset.id = profile.id

		// Profile header
		const header = document.createElement('h3')
		header.textContent = `${profile.name} ${profile.isDefault ? '(Default)' : ''}`
		card.appendChild(header)

		// Email info
		const emailP = document.createElement('p')
		const emailStrong = document.createElement('strong')
		emailStrong.textContent = 'Email:'
		emailP.appendChild(emailStrong)
		emailP.appendChild(document.createTextNode(` ${profile.data.personal.email || 'Not set'}`))
		card.appendChild(emailP)

		// Phone info
		const phoneP = document.createElement('p')
		const phoneStrong = document.createElement('strong')
		phoneStrong.textContent = 'Phone:'
		phoneP.appendChild(phoneStrong)
		phoneP.appendChild(document.createTextNode(` ${profile.data.personal.phone || 'Not set'}`))
		card.appendChild(phoneP)

		// Created date info
		const createdP = document.createElement('p')
		const createdStrong = document.createElement('strong')
		createdStrong.textContent = 'Created:'
		createdP.appendChild(createdStrong)
		createdP.appendChild(document.createTextNode(` ${new Date(profile.createdAt).toLocaleDateString()}`))
		card.appendChild(createdP)

		// Actions container
		const actionsDiv = document.createElement('div')
		actionsDiv.className = 'profile-actions'

		// Edit button
		const editBtn = document.createElement('button')
		editBtn.className = 'btn btn-primary btn-sm'
		editBtn.textContent = 'Edit'
		editBtn.addEventListener('click', () => this.editProfile(profile.id))
		actionsDiv.appendChild(editBtn)

		// Duplicate button
		const duplicateBtn = document.createElement('button')
		duplicateBtn.className = 'btn btn-secondary btn-sm'
		duplicateBtn.textContent = 'Duplicate'
		duplicateBtn.addEventListener('click', () => this.duplicateProfile(profile.id))
		actionsDiv.appendChild(duplicateBtn)

		// Set Default button (if not already default)
		if (!profile.isDefault) {
			const defaultBtn = document.createElement('button')
			defaultBtn.className = 'btn btn-secondary btn-sm'
			defaultBtn.textContent = 'Set Default'
			defaultBtn.addEventListener('click', () => this.setDefault(profile.id))
			actionsDiv.appendChild(defaultBtn)
		}

		// Delete button
		const deleteBtn = document.createElement('button')
		deleteBtn.className = 'btn btn-danger btn-sm'
		deleteBtn.textContent = 'Delete'
		deleteBtn.addEventListener('click', () => this.deleteProfile(profile.id))
		actionsDiv.appendChild(deleteBtn)

		card.appendChild(actionsDiv)
		return card
	}

	private setupEventListeners(): void {
		document.getElementById('save-settings')?.addEventListener('click', this.saveSettings.bind(this))
		document.getElementById('add-profile')?.addEventListener('click', this.addNewProfile.bind(this))
		document.getElementById('export-profiles')?.addEventListener('click', this.exportProfiles.bind(this))
		document.getElementById('import-profiles')?.addEventListener('click', this.importProfiles.bind(this))
		document.getElementById('import-file')?.addEventListener('change', this.handleFileImport.bind(this))
	}

	private async saveSettings(): Promise<void> {
		const autoFillEnabled = (document.getElementById('auto-fill-enabled') as HTMLInputElement).checked
		const fillDelay = parseInt((document.getElementById('fill-delay') as HTMLInputElement).value)
		const showButtons = (document.getElementById('show-buttons') as HTMLInputElement).checked
		const buttonPosition = (document.getElementById('button-position') as HTMLSelectElement).value as any
		const contextMenuEnabled = (document.getElementById('context-menu-enabled') as HTMLInputElement).checked

		await this.storage.saveSettings({
			autoFillEnabled,
			fillDelay,
			showButtons,
			buttonPosition,
			contextMenuEnabled
		})

		this.showNotification('Settings saved successfully!', 'success')
	}

	private addNewProfile(): void {
		this.showProfileForm()
	}

	public async editProfile(id: string): Promise<void> {
		const profile = await this.profileManager.getProfile(id)
		if (profile) {
			this.showProfileForm(profile)
		}
	}

	public async duplicateProfile(id: string): Promise<void> {
		try {
			await this.profileManager.duplicateProfile(id)
			await this.loadProfiles()
			this.showNotification('Profile duplicated successfully!', 'success')
		} catch (error) {
			this.showNotification('Failed to duplicate profile', 'error')
		}
	}

	public async setDefault(id: string): Promise<void> {
		try {
			await this.profileManager.setDefaultProfile(id)
			await this.loadProfiles()
			this.showNotification('Default profile updated!', 'success')
		} catch (error) {
			this.showNotification('Failed to set default profile', 'error')
		}
	}

	public async deleteProfile(id: string): Promise<void> {
		if (confirm('Are you sure you want to delete this profile?')) {
			try {
				await this.profileManager.deleteProfile(id)
				await this.loadProfiles()
				this.showNotification('Profile deleted successfully!', 'success')
			} catch (error) {
				this.showNotification('Failed to delete profile', 'error')
			}
		}
	}

	private showProfileForm(profile?: Profile): void {
		// For now, create a simple prompt-based form
		// In a full implementation, this would be a modal with proper form fields
		const name = prompt('Profile name:', profile?.name || '')
		if (!name) return

		const email = prompt('Email:', profile?.data.personal.email || '')
		const firstName = prompt('First name:', profile?.data.personal.firstName || '')
		const lastName = prompt('Last name:', profile?.data.personal.lastName || '')
		const phone = prompt('Phone:', profile?.data.personal.phone || '')

		if (profile) {
			// Update existing profile
			this.updateProfile(profile.id, {
				name,
				data: {
					...profile.data,
					personal: {
						...profile.data.personal,
						firstName: firstName || '',
						lastName: lastName || '',
						email: email || '',
						phone: phone || ''
					}
				}
			})
		} else {
			// Create new profile
			this.createProfile({
				name,
				isDefault: false,
				data: {
					personal: {
						firstName: firstName || '',
						lastName: lastName || '',
						fullName: `${firstName || ''} ${lastName || ''}`.trim(),
						email: email || '',
						phone: phone || '',
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
			})
		}
	}

	private async createProfile(profileData: Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
		try {
			await this.profileManager.createProfile(profileData)
			await this.loadProfiles()
			this.showNotification('Profile created successfully!', 'success')
		} catch (error) {
			this.showNotification('Failed to create profile', 'error')
		}
	}

	private async updateProfile(id: string, updates: Partial<Profile>): Promise<void> {
		try {
			await this.profileManager.updateProfile(id, updates)
			await this.loadProfiles()
			this.showNotification('Profile updated successfully!', 'success')
		} catch (error) {
			this.showNotification('Failed to update profile', 'error')
		}
	}

	private async exportProfiles(): Promise<void> {
		try {
			const exportData = await this.profileManager.exportProfiles()
			const blob = new Blob([exportData], { type: 'application/json' })
			const url = URL.createObjectURL(blob)

			const a = document.createElement('a')
			a.href = url
			a.download = `formfilla-profiles-${new Date().toISOString().split('T')[0]}.json`
			document.body.appendChild(a)
			a.click()
			document.body.removeChild(a)

			URL.revokeObjectURL(url)
			this.showNotification('Profiles exported successfully!', 'success')
		} catch (error) {
			this.showNotification('Failed to export profiles', 'error')
		}
	}

	private importProfiles(): void {
		const fileInput = document.getElementById('import-file') as HTMLInputElement
		fileInput.click()
	}

	private async handleFileImport(event: Event): Promise<void> {
		const file = (event.target as HTMLInputElement).files?.[0]
		if (!file) return

		try {
			const text = await file.text()
			const replaceExisting = confirm('Replace existing profiles? Click OK to replace, Cancel to add to existing.')

			await this.profileManager.importProfiles(text, replaceExisting)
			await this.loadProfiles()

			this.showNotification('Profiles imported successfully!', 'success')
		} catch (error) {
			this.showNotification(`Failed to import profiles: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
		}
	}

	private showNotification(message: string, type: 'success' | 'error' = 'success'): void {
		const container = document.getElementById('notifications')!
		const notification = document.createElement('div')
		notification.className = `notification ${type}`
		notification.textContent = message

		container.appendChild(notification)

		setTimeout(() => {
			notification.remove()
		}, 5000)
	}
}

// Make instance globally available for button onclick handlers
declare global {
	var optionsUI: OptionsUI
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
	window.optionsUI = new OptionsUI()
})
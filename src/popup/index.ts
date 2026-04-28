import { StorageService } from '@/lib/storage'
import { ProfileManager } from '@/lib/profiles'
import { DummyDataProvider } from '@/lib/dummy-data'

class PopupUI {
	private storage: StorageService
	private profileManager: ProfileManager
	private dummyData: DummyDataProvider

	constructor() {
		this.storage = StorageService.getInstance()
		this.profileManager = new ProfileManager(this.storage)
		this.dummyData = new DummyDataProvider()
		this.initialize()
	}

	private async initialize(): Promise<void> {
		await this.loadProfiles()
		await this.loadDummyProfiles()
		this.setupEventListeners()
	}

	private async loadProfiles(): Promise<void> {
		const profiles = await this.profileManager.getAllProfiles()
		const profilesList = document.getElementById('profiles-list')!

		if (profiles.length === 0) {
			const emptyDiv = document.createElement('div')
			emptyDiv.className = 'empty-state'

			const p1 = document.createElement('p')
			p1.textContent = 'No profiles created yet'

			const p2 = document.createElement('p')
			p2.textContent = 'Create your first profile or use sample data below'

			emptyDiv.appendChild(p1)
			emptyDiv.appendChild(p2)
			profilesList.appendChild(emptyDiv)
		} else {
			// Clear existing content
			profilesList.innerHTML = ''

			profiles.forEach(profile => {
				const profileDiv = document.createElement('div')
				profileDiv.className = `profile-item ${profile.isDefault ? 'default' : ''}`
				profileDiv.dataset.id = profile.id

				const nameSpan = document.createElement('span')
				nameSpan.className = 'profile-name'
				nameSpan.textContent = profile.name
				profileDiv.appendChild(nameSpan)

				if (profile.isDefault) {
					const badgeSpan = document.createElement('span')
					badgeSpan.className = 'profile-badge'
					badgeSpan.textContent = 'Default'
					profileDiv.appendChild(badgeSpan)
				}

				profilesList.appendChild(profileDiv)
			})

			// Add click handlers for profiles
			profilesList.addEventListener('click', this.handleProfileClick.bind(this))
		}
	}

	private async loadDummyProfiles(): Promise<void> {
		const dummySection = document.getElementById('dummy-profiles')!
		const profileNames = this.dummyData.getProfileNames()

		// Clear existing content
		dummySection.innerHTML = ''

		// Create header
		const header = document.createElement('h2')
		header.textContent = 'Sample Data'
		dummySection.appendChild(header)

		// Create dummy profile elements
		profileNames.forEach(name => {
			const displayName = this.getDummyDisplayName(name)

			const profileDiv = document.createElement('div')
			profileDiv.className = 'dummy-profile'
			profileDiv.dataset.name = name

			const nameSpan = document.createElement('span')
			nameSpan.textContent = displayName
			profileDiv.appendChild(nameSpan)

			const useButton = document.createElement('button')
			useButton.textContent = 'Use'
			useButton.dataset.action = `use-${name}`
			useButton.addEventListener('click', (event) => {
				event.stopPropagation()
			})
			profileDiv.appendChild(useButton)

			dummySection.appendChild(profileDiv)
		})

		// Add click handlers
		dummySection.addEventListener('click', this.handleDummyClick.bind(this))
	}

	private getDummyDisplayName(name: string): string {
		const displayNames: Record<string, string> = {
			developer: '👨‍💻 Developer Profile',
			international: '🌍 International Profile',
			edgeCases: '⚠️ Edge Cases Profile',
			tester: '🧪 QA Tester Profile'
		}
		return displayNames[name] || name
	}

	private setupEventListeners(): void {
		// Quick actions
		document.getElementById('fill-page')?.addEventListener('click', this.fillPageForms.bind(this))
		document.getElementById('random-data')?.addEventListener('click', this.fillWithRandomData.bind(this))

		// Create profile
		document.getElementById('create-profile')?.addEventListener('click', this.createNewProfile.bind(this))

		// Footer links
		document.getElementById('settings-link')?.addEventListener('click', this.openSettings.bind(this))
		document.getElementById('help-link')?.addEventListener('click', this.openHelp.bind(this))
	}

	private async handleProfileClick(event: Event): Promise<void> {
		const target = event.target as HTMLElement
		const profileItem = target.closest('.profile-item') as HTMLElement

		if (profileItem) {
			const profileId = profileItem.dataset.id!
			await this.useProfile(profileId)
			window.close()
		}
	}

	private async handleDummyClick(event: Event): Promise<void> {
		const target = event.target as HTMLElement
		const dummyProfile = target.closest('.dummy-profile') as HTMLElement

		if (dummyProfile) {
			const profileName = dummyProfile.dataset.name!

			if (target.tagName === 'BUTTON') {
				// "Use" button clicked - fill forms
				await this.useDummyProfile(profileName)
				window.close()
			} else {
				// Profile clicked - create custom profile from dummy
				await this.createFromDummy(profileName)
			}
		}
	}

	private async fillPageForms(): Promise<void> {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
		if (!tab.id) return

		try {
			// Get default profile data directly
			const defaultProfile = await this.profileManager.getDefaultProfile()
			const profileData = defaultProfile ? defaultProfile.data : this.dummyData.getRandomProfile()

			chrome.tabs.sendMessage(tab.id, {
				type: 'fillForm',
				profileData: profileData
			})
		} catch (error) {
			console.error('Error getting profile data:', error)
			// Fallback to random data
			const randomProfile = this.dummyData.getRandomProfile()
			chrome.tabs.sendMessage(tab.id, {
				type: 'fillForm',
				profileData: randomProfile
			})
		}

		window.close()
	}

	private async fillWithRandomData(): Promise<void> {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
		if (!tab.id) return

		const randomProfile = this.dummyData.getRandomProfile()
		chrome.tabs.sendMessage(tab.id, {
			type: 'fillForm',
			profileData: randomProfile
		})
		window.close()
	}

	private async useProfile(profileId: string): Promise<void> {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
		if (!tab.id) return

		const profile = await this.profileManager.getProfile(profileId)
		if (profile) {
			chrome.tabs.sendMessage(tab.id, {
				type: 'fillForm',
				profileData: profile.data
			})
		}
	}

	private async useDummyProfile(profileName: string): Promise<void> {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
		if (!tab.id) return

		const profileData = this.dummyData.getProfile(profileName)
		if (profileData) {
			chrome.tabs.sendMessage(tab.id, {
				type: 'fillForm',
				profileData: profileData
			})
		}
	}

	private async createNewProfile(): Promise<void> {
		chrome.tabs.create({ url: chrome.runtime.getURL('src/options/index.html') })
	}

	private async createFromDummy(profileName: string): Promise<void> {
		const dummyProfile = this.dummyData.getProfile(profileName)
		if (!dummyProfile) return

		try {
			await this.profileManager.createProfile({
				name: `My ${this.getDummyDisplayName(profileName)}`,
				isDefault: false,
				data: dummyProfile
			})

			await this.loadProfiles()

			// Show success feedback
			this.showNotification('Profile created successfully!')
		} catch (error) {
			this.showNotification('Failed to create profile', 'error')
		}
	}

	private openSettings(): void {
		chrome.tabs.create({ url: chrome.runtime.getURL('src/options/index.html') })
	}

	private openHelp(): void {
		chrome.tabs.create({ url: 'https://github.com/your-repo/formfilla#readme' })
	}

	private showNotification(message: string, type: 'success' | 'error' = 'success'): void {
		// Simple notification - could be enhanced with a toast system
		const notification = document.createElement('div')
		notification.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 8px 12px;
      background: ${type === 'success' ? '#4CAF50' : '#f44336'};
      color: white;
      border-radius: 4px;
      font-size: 12px;
      z-index: 10000;
    `
		notification.textContent = message
		document.body.appendChild(notification)

		setTimeout(() => {
			notification.remove()
		}, 3000)
	}
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
	new PopupUI()
})
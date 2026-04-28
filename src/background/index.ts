import { ProfileManager } from '../lib/profiles'
import { DummyDataProvider } from '../lib/dummy-data'
import { StorageService } from '../lib/storage'
import { validateMessage } from '../lib/security'

class ContextMenuManager {
	private profileManager: ProfileManager
	private dummyData: DummyDataProvider
	private currentFieldType: string | null = null

	constructor() {
		const storage = StorageService.getInstance()
		this.profileManager = new ProfileManager(storage)
		this.dummyData = new DummyDataProvider()
		this.initialize()
	}

	private async initialize(): Promise<void> {
		try {
			// Initialize default profiles on first install
			await this.initializeDefaultProfiles()

			await this.createContextMenus()

			// Set up event listeners
			chrome.contextMenus.onClicked.addListener((info, tab) => {
				this.handleMenuClick(info, tab)
			})

			// Set up message listener for content script communication
			chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
				// Handle async message processing
				this.handleMessage(message, sender, sendResponse).catch(error => {
					console.error('FormFilla: Error handling message:', error)
					sendResponse({ error: 'Internal error processing message' })
				})
				return true // Keep the message channel open for async responses
			})

			// Set up extension install/update listener
			chrome.runtime.onInstalled.addListener((details) => {
				if (details.reason === 'install') {
					this.handleFirstInstall()
				}
			})

			console.log('FormFilla: Background script initialized successfully')
		} catch (error) {
			console.error('FormFilla: Error during background script initialization:', error)
		}
	}

	private async initializeDefaultProfiles(): Promise<void> {
		try {
			const existingProfiles = await this.profileManager.getAllProfiles()

			// Only create default profiles if none exist
			if (existingProfiles.length === 0) {
				console.log('FormFilla: Creating default profiles...')

				// Create profiles for each dummy data template
				const profileTemplates = [
					'developer', 'international', 'edgeCases', 'tester',
					'accountSignatory', 'employer', 'businessOwner', 'shareholder', 'director'
				]

				for (const templateName of profileTemplates) {
					const profileData = this.dummyData.getProfile(templateName)
					if (profileData) {
						const displayName = this.getDummyProfileDisplayName(templateName)
						const profile = await this.profileManager.createProfile({
							name: displayName,
							isDefault: templateName === 'developer', // Set developer as default
							data: profileData
						})
						console.log(`FormFilla: Created profile "${displayName}" with ID: ${profile.id}`)
					}
				}

				console.log('FormFilla: Default profiles created successfully')
			} else {
				console.log(`FormFilla: Found ${existingProfiles.length} existing profiles, skipping default profile creation`)
			}
		} catch (error) {
			console.error('FormFilla: Error initializing default profiles:', error)
		}
	}

	private handleFirstInstall(): void {
		console.log('FormFilla: Extension installed for the first time')
		// Could show welcome page or tutorial here in the future
	}

	private async createContextMenus(): Promise<void> {
		// Remove all existing menus
		chrome.contextMenus.removeAll()

		// Create main menu
		chrome.contextMenus.create({
			id: 'formfilla-root',
			title: 'FormFilla',
			contexts: ['editable']
		})

		// Fill current field
		chrome.contextMenus.create({
			id: 'fill-field',
			parentId: 'formfilla-root',
			title: 'Fill This Field',
			contexts: ['editable']
		})

		// Fill entire form
		chrome.contextMenus.create({
			id: 'fill-form',
			parentId: 'formfilla-root',
			title: 'Fill Entire Form',
			contexts: ['editable']
		})

		// Separator
		chrome.contextMenus.create({
			id: 'separator1',
			parentId: 'formfilla-root',
			type: 'separator',
			contexts: ['editable']
		})

		await this.createProfileMenus()

		// Separator
		chrome.contextMenus.create({
			id: 'separator2',
			parentId: 'formfilla-root',
			type: 'separator',
			contexts: ['editable']
		})

		await this.createDummyDataMenus()

		// Separator
		chrome.contextMenus.create({
			id: 'separator3',
			parentId: 'formfilla-root',
			type: 'separator',
			contexts: ['editable']
		})

		chrome.contextMenus.create({
			id: 'manage-profiles',
			parentId: 'formfilla-root',
			title: 'Manage Profiles',
			contexts: ['editable']
		})
	}

	private async createProfileMenus(): Promise<void> {
		const profiles = await this.profileManager.getAllProfiles()

		if (profiles.length > 0) {
			chrome.contextMenus.create({
				id: 'profiles-header',
				parentId: 'formfilla-root',
				title: '--- User Profiles ---',
				contexts: ['editable'],
				enabled: false
			})

			for (const profile of profiles) {
				chrome.contextMenus.create({
					id: `profile-${profile.id}`,
					parentId: 'formfilla-root',
					title: profile.name,
					contexts: ['editable']
				})
			}
		}
	}

	private async createDummyDataMenus(): Promise<void> {
		chrome.contextMenus.create({
			id: 'dummy-header',
			parentId: 'formfilla-root',
			title: '--- Test Profiles ---',
			contexts: ['editable'],
			enabled: false
		})

		const dummyProfiles = [
			'developer', 'international', 'edgeCases', 'tester',
			'accountSignatory', 'employer', 'businessOwner', 'shareholder', 'director'
		]

		for (const profileName of dummyProfiles) {
			chrome.contextMenus.create({
				id: `dummy-${profileName}`,
				parentId: 'formfilla-root',
				title: this.getDummyProfileDisplayName(profileName),
				contexts: ['editable']
			})
		}

		chrome.contextMenus.create({
			id: 'dummy-random',
			parentId: 'formfilla-root',
			title: 'Random Test Data',
			contexts: ['editable']
		})
	}

	private getDummyProfileDisplayName(profileName: string): string {
		const displayNames: Record<string, string> = {
			developer: 'Developer Profile',
			international: 'International Profile',
			edgeCases: 'Edge Cases Profile',
			tester: 'QA Tester Profile',
			accountSignatory: 'Account Signatory',
			employer: 'Employer Profile',
			businessOwner: 'Business Owner',
			shareholder: 'Shareholder Profile',
			director: 'Board Director'
		}
		return displayNames[profileName] || profileName
	}

	private updateMenuForField(fieldType: string, fieldDisplayName: string): void {
		this.currentFieldType = fieldType

		// Update menu items based on field type
		if (fieldType && fieldDisplayName) {
			chrome.contextMenus.update('fill-field', {
				title: `Fill ${fieldDisplayName}`
			})
		} else {
			chrome.contextMenus.update('fill-field', {
				title: 'Fill This Field'
			})
		}
	}

	private async handleMessage(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void): Promise<void> {
		// Validate message structure and source
		const expectedTypes = ['updateContextMenu', 'getFieldValue', 'getDefaultProfileData', 'getSettings', 'refreshContextMenu']
		const validation = validateMessage(message, expectedTypes)

		if (!validation.isValid) {
			console.warn('FormFilla: Invalid message received:', validation.error)
			sendResponse({ error: 'Invalid message format' })
			return
		}

		// Validate sender - must be from extension (either popup/options) or content script
		const isFromExtension = sender.origin && sender.origin.startsWith('chrome-extension://')
		const isFromContentScript = sender.tab && sender.tab.id

		if (!isFromExtension && !isFromContentScript) {
			console.warn('FormFilla: Message from unauthorized source')
			sendResponse({ error: 'Unauthorized sender' })
			return
		}

		try {
			switch (message.type) {
				case 'updateContextMenu':
					if (typeof message.fieldType !== 'string' || typeof message.fieldDisplayName !== 'string') {
						sendResponse({ error: 'Invalid message parameters' })
						return
					}
					this.updateMenuForField(message.fieldType, message.fieldDisplayName)
					break

				case 'getFieldValue':
					if (typeof message.fieldType !== 'string') {
						sendResponse({ error: 'Invalid field type' })
						return
					}
					const value = await this.getFieldValue(message.fieldType, message.subtype)
					sendResponse({ value })
					break

				case 'getDefaultProfileData':
					try {
						console.log('FormFilla: Processing getDefaultProfileData request')
						const defaultProfile = await this.profileManager.getDefaultProfile()
						const profileData = defaultProfile ? defaultProfile.data : this.dummyData.getRandomProfile()

						if (!profileData) {
							// Fallback to ensure we always have profile data
							console.log('FormFilla: No profile data found, using fallback')
							const fallbackData = this.dummyData.getRandomProfile()
							sendResponse({ profileData: fallbackData })
						} else {
							console.log('FormFilla: Sending profile data:', defaultProfile ? 'default profile' : 'random profile')
							sendResponse({ profileData })
						}
					} catch (error) {
						console.error('FormFilla: Error getting default profile:', error)
						// Always provide fallback data
						const fallbackData = this.dummyData.getRandomProfile()
						sendResponse({ profileData: fallbackData })
					}
					break

				case 'getSettings':
					const settings = await this.getSettings()
					sendResponse(settings)
					break

				case 'refreshContextMenu':
					await this.createContextMenus()
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

	private async handleMenuClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<void> {
		if (!tab?.id) return

		const action = info.menuItemId as string

		switch (action) {
			case 'fill-field':
				await this.fillField(tab.id, this.currentFieldType)
				break

			case 'fill-form':
				await this.fillEntireForm(tab.id)
				break

			case 'dummy-random':
				await this.fillWithRandomDummyData(tab.id)
				break

			case 'manage-profiles':
				chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/index.html') })
				break

			default:
				if (action.startsWith('profile-')) {
					const profileId = action.replace('profile-', '')
					await this.fillWithProfile(tab.id, profileId)
				} else if (action.startsWith('dummy-')) {
					const profileName = action.replace('dummy-', '')
					await this.fillWithDummyProfile(tab.id, profileName)
				}
		}
	}

	private async getFieldValue(fieldType: string, subtype: string): Promise<string> {
		// First try to get from default profile
		const defaultProfile = await this.profileManager.getDefaultProfile()

		if (defaultProfile) {
			const value = this.getValueFromProfile(defaultProfile.data, fieldType, subtype)
			if (value) return value
		}

		// Fall back to dummy data
		return this.dummyData.generateRandomData(fieldType, subtype)
	}

	private async fillField(tabId: number, fieldType: string | null): Promise<void> {
		if (!fieldType) return

		const [type, subtype] = fieldType.split('.')
		const value = await this.getFieldValue(type, subtype)

		chrome.tabs.sendMessage(tabId, {
			type: 'fillField',
			value: value
		})
	}

	private async fillEntireForm(tabId: number): Promise<void> {
		const defaultProfile = await this.profileManager.getDefaultProfile()
		const profileData = defaultProfile ? defaultProfile.data : this.dummyData.getRandomProfile()

		chrome.tabs.sendMessage(tabId, {
			type: 'fillForm',
			profileData: profileData
		})
	}

	private async fillWithProfile(tabId: number, profileId: string): Promise<void> {
		const profile = await this.profileManager.getProfile(profileId)
		if (!profile) return

		chrome.tabs.sendMessage(tabId, {
			type: 'fillForm',
			profileData: profile.data
		})
	}

	private async fillWithDummyProfile(tabId: number, profileName: string): Promise<void> {
		const profileData = this.dummyData.getProfile(profileName)
		if (!profileData) return

		chrome.tabs.sendMessage(tabId, {
			type: 'fillForm',
			profileData: profileData
		})
	}

	private async fillWithRandomDummyData(tabId: number): Promise<void> {
		const profileData = this.dummyData.getRandomProfile()

		chrome.tabs.sendMessage(tabId, {
			type: 'fillForm',
			profileData: profileData
		})
	}

	private getValueFromProfile(profileData: any, type: string, subtype: string): string {
		const path = `${type}.${subtype}`
		return this.getNestedValue(profileData, path) || ''
	}

	private getNestedValue(obj: any, path: string): any {
		return path.split('.').reduce((o, p) => o?.[p], obj)
	}

	private async getSettings(): Promise<any> {
		return new Promise((resolve) => {
			chrome.storage.sync.get(['settings'], (result) => {
				resolve(result.settings || { fillDelay: 50 })
			})
		})
	}
}

// Initialize context menu manager
new ContextMenuManager()
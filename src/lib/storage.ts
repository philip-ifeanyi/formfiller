import { Profile, StorageData } from '@/types'
import { simpleEncrypt, simpleDecrypt, validateProfileData, generateEncryptionKey } from './security'

export class StorageService {
	private static instance: StorageService
	private encryptionKey: string | null = null

	static getInstance(): StorageService {
		if (!this.instance) {
			this.instance = new StorageService()
		}
		return this.instance
	}

	private async getEncryptionKey(): Promise<string> {
		if (this.encryptionKey) return this.encryptionKey

		// Try to get existing key from storage
		const result = await chrome.storage.local.get('encryptionKey')
		if (result.encryptionKey) {
			this.encryptionKey = result.encryptionKey
			return this.encryptionKey as string
		}

		// Generate new key if none exists
		this.encryptionKey = generateEncryptionKey()
		await chrome.storage.local.set({ encryptionKey: this.encryptionKey })
		return this.encryptionKey
	}

	private async encryptSensitiveData(profiles: Profile[]): Promise<string> {
		const key = await this.getEncryptionKey()

		// Extract and encrypt sensitive fields
		const processedProfiles = profiles.map(profile => {
			const sensitiveFields = {
				ssn: profile.data.personal.ssn,
				cardNumber: profile.data.payment?.cardNumber,
				cvv: profile.data.payment?.cvv,
				password: profile.data.account?.password
			}

			// Encrypt sensitive fields if they exist
			const encryptedSensitive: any = {}
			Object.entries(sensitiveFields).forEach(([fieldName, value]) => {
				if (value) {
					encryptedSensitive[fieldName] = simpleEncrypt(value, key)
				}
			})

			// Create profile copy with encrypted sensitive data
			return {
				...profile,
				data: {
					...profile.data,
					personal: {
						...profile.data.personal,
						ssn: encryptedSensitive.ssn || profile.data.personal.ssn || ''
					},
					payment: profile.data.payment ? {
						...profile.data.payment,
						cardNumber: encryptedSensitive.cardNumber || profile.data.payment.cardNumber || '',
						cvv: encryptedSensitive.cvv || profile.data.payment.cvv || ''
					} : undefined,
					account: profile.data.account ? {
						...profile.data.account,
						password: encryptedSensitive.password || profile.data.account.password || ''
					} : undefined
				}
			}
		})

		return JSON.stringify(processedProfiles)
	}

	private async decryptSensitiveData(encryptedData: string): Promise<Profile[]> {
		const key = await this.getEncryptionKey()

		try {
			const profiles: Profile[] = JSON.parse(encryptedData)

			// Decrypt sensitive fields
			return profiles.map(profile => {
				const decryptedProfile = { ...profile }

				// Decrypt SSN if encrypted
				if (profile.data.personal.ssn) {
					try {
						const decrypted = simpleDecrypt(profile.data.personal.ssn, key)
						if (decrypted) {
							decryptedProfile.data.personal.ssn = decrypted
						}
					} catch (e) {
						// If decryption fails, keep original (might not be encrypted)
					}
				}

				// Decrypt payment data if present
				if (profile.data.payment) {
					if (profile.data.payment.cardNumber) {
						try {
							const decrypted = simpleDecrypt(profile.data.payment.cardNumber, key)
							if (decrypted) {
								decryptedProfile.data.payment.cardNumber = decrypted
							}
						} catch (e) {
							// Keep original if decryption fails
						}
					}

					if (profile.data.payment.cvv) {
						try {
							const decrypted = simpleDecrypt(profile.data.payment.cvv, key)
							if (decrypted) {
								decryptedProfile.data.payment.cvv = decrypted
							}
						} catch (e) {
							// Keep original if decryption fails
						}
					}
				}

				// Decrypt account password if present
				if (profile.data.account?.password) {
					try {
						const decrypted = simpleDecrypt(profile.data.account.password, key)
						if (decrypted) {
							decryptedProfile.data.account.password = decrypted
						}
					} catch (e) {
						// Keep original if decryption fails
					}
				}

				return decryptedProfile
			})
		} catch (error) {
			console.error('FormFilla: Failed to decrypt profile data', error)
			return []
		}
	}

	// Use storage.local for large data, storage.sync for settings
	async saveProfiles(profiles: Profile[]): Promise<void> {
		// Validate profile data before saving
		for (const profile of profiles) {
			const validation = validateProfileData(profile.data)
			if (!validation.isValid) {
				throw new Error(`Invalid profile data: ${validation.errors.join(', ')}`)
			}
		}

		// Encrypt sensitive data before storage
		const encryptedData = await this.encryptSensitiveData(profiles)
		await chrome.storage.local.set({ profiles: encryptedData })
	}

	async getProfiles(): Promise<Profile[]> {
		const result = await chrome.storage.local.get('profiles')
		if (!result.profiles) return []

		// Handle both old (object array) and new (encrypted string) formats
		if (typeof result.profiles === 'string') {
			return await this.decryptSensitiveData(result.profiles)
		} else {
			// Legacy format - convert to encrypted format
			const profiles = result.profiles || []
			await this.saveProfiles(profiles)
			return profiles
		}
	}

	async saveSettings(settings: Partial<StorageData['settings']>): Promise<void> {
		const current = await this.getSettings()
		await chrome.storage.sync.set({
			settings: { ...current, ...settings }
		})
	}

	async getSettings(): Promise<StorageData['settings']> {
		const result = await chrome.storage.sync.get('settings')
		return result.settings || {
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
	}

	async saveFieldMappings(mappings: Record<string, string>): Promise<void> {
		await chrome.storage.local.set({ fieldMappings: mappings })
	}

	async getFieldMappings(): Promise<Record<string, string>> {
		const result = await chrome.storage.local.get('fieldMappings')
		return result.fieldMappings || {}
	}

	// Listen for storage changes
	onStorageChanged(callback: (changes: any, area: string) => void): void {
		chrome.storage.onChanged.addListener(callback)
	}

	// Remove storage change listener
	removeStorageListener(callback: (changes: any, area: string) => void): void {
		chrome.storage.onChanged.removeListener(callback)
	}
}

export const storageService = StorageService.getInstance()
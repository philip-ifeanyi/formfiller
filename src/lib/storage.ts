import {
	PROFILE_SCHEMA_VERSION,
	Profile,
	ProfileData,
	ProfileDefinition,
	StorageData
} from '@/types'
import { simpleEncrypt, simpleDecrypt, validateProfileData, generateEncryptionKey } from './security'

const PROFILE_STORAGE_VERSION_KEY = 'profileStorageVersion'

export const DEFAULT_FEATURE_FLAGS = {
	showReleaseGateChecks: true,
	allowDebugTools: true,
	allowFileFixtures: true
} as const

type StoredProfileRecord = ProfileDefinition & {
	data: ProfileData
}

const DEFAULT_SETTINGS: StorageData['settings'] = {
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string {
	return typeof value === 'string' ? value : ''
}

function readOptionalString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value : undefined
}

function readNumber(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback
}

function normalizeStringList(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined

	const normalized = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)

	return normalized.length > 0 ? normalized : undefined
}

function normalizeStringRecord(value: unknown): Record<string, string> {
	if (!isRecord(value)) return {}

	return Object.entries(value).reduce<Record<string, string>>((accumulator, [key, entry]) => {
		if (typeof entry === 'string') {
			accumulator[key] = entry
		} else if (typeof entry === 'number' || typeof entry === 'boolean') {
			accumulator[key] = String(entry)
		}

		return accumulator
	}, {})
}

function normalizeFeatureFlags(value: unknown): Record<string, boolean> {
	const configuredFlags = isRecord(value)
		? Object.entries(value).reduce<Record<string, boolean>>((accumulator, [key, entry]) => {
			if (typeof entry === 'boolean') {
				accumulator[key] = entry
			}

			return accumulator
		}, {})
		: {}

	return {
		...DEFAULT_FEATURE_FLAGS,
		...configuredFlags
	}
}

function normalizeSettings(rawSettings: unknown): StorageData['settings'] {
	const source = isRecord(rawSettings) ? rawSettings : {}
	const featureFlags = normalizeFeatureFlags(source.featureFlags)
	const debugMode = featureFlags.allowDebugTools
		? readBoolean(source.debugMode, DEFAULT_SETTINGS.debugMode)
		: false

	return {
		autoFillEnabled: readBoolean(source.autoFillEnabled, DEFAULT_SETTINGS.autoFillEnabled),
		defaultProfile: readString(source.defaultProfile),
		fillDelay: Math.max(0, readNumber(source.fillDelay, DEFAULT_SETTINGS.fillDelay)),
		highlightFields: readBoolean(source.highlightFields, DEFAULT_SETTINGS.highlightFields),
		showButtons: readBoolean(source.showButtons, DEFAULT_SETTINGS.showButtons),
		buttonPosition: source.buttonPosition === 'outside-right' || source.buttonPosition === 'above'
			? source.buttonPosition
			: DEFAULT_SETTINGS.buttonPosition,
		contextMenuEnabled: readBoolean(source.contextMenuEnabled, DEFAULT_SETTINGS.contextMenuEnabled),
		autoHideButtons: readBoolean(source.autoHideButtons, DEFAULT_SETTINGS.autoHideButtons),
		buttonStyle: source.buttonStyle === 'full' ? 'full' : DEFAULT_SETTINGS.buttonStyle,
		debugMode,
		featureFlags
	}
}

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

	private normalizeProfileData(rawData: unknown): ProfileData {
		const defaults = createEmptyProfileData()
		const data = isRecord(rawData) ? rawData : {}
		const personal = isRecord(data.personal) ? data.personal : {}
		const address = isRecord(data.address) ? data.address : {}
		const company = isRecord(data.company) ? data.company : {}
		const payment = isRecord(data.payment) ? data.payment : {}
		const account = isRecord(data.account) ? data.account : {}

		return {
			personal: {
				...defaults.personal,
				firstName: readString(personal.firstName),
				lastName: readString(personal.lastName),
				fullName: readString(personal.fullName),
				email: readString(personal.email),
				phone: readString(personal.phone),
				dateOfBirth: readString(personal.dateOfBirth),
				age: readString(personal.age),
				gender: readString(personal.gender),
				ssn: readString(personal.ssn)
			},
			address: {
				...defaults.address,
				street: readString(address.street),
				street2: readString(address.street2),
				city: readString(address.city),
				state: readString(address.state),
				zip: readString(address.zip),
				country: readString(address.country)
			},
			company: {
				...defaults.company,
				name: readString(company.name),
				title: readString(company.title),
				department: readString(company.department),
				website: readString(company.website)
			},
			payment: {
				...defaults.payment,
				cardNumber: readString(payment.cardNumber),
				expiry: readString(payment.expiry),
				cvv: readString(payment.cvv),
				cardholderName: readString(payment.cardholderName)
			},
			account: {
				...defaults.account,
				username: readString(account.username),
				password: readString(account.password)
			},
			custom: normalizeStringRecord(data.custom)
		}
	}

	private canonicalValuesToProfileData(values: unknown): ProfileData {
		const defaults = createEmptyProfileData()
		const source = isRecord(values) ? values : {}
		const person = isRecord(source.person) ? source.person : {}
		const contact = isRecord(source.contact) ? source.contact : {}
		const contactEmail = isRecord(contact.email) ? contact.email : {}
		const contactPhone = isRecord(contact.phone) ? contact.phone : {}
		const address = isRecord(source.address) ? source.address : {}
		const company = isRecord(source.company) ? source.company : {}
		const payment = isRecord(source.payment) ? source.payment : {}
		const account = isRecord(source.account) ? source.account : {}
		const identity = isRecord(source.identity) ? source.identity : {}

		return {
			personal: {
				...defaults.personal,
				firstName: readString(person.firstName),
				lastName: readString(person.lastName),
				fullName: readString(person.fullName),
				email: readString(contactEmail.primary),
				phone: readString(contactPhone.primary || contactPhone.mobile || contactPhone.work),
				dateOfBirth: readString(person.dateOfBirth),
				age: readString(person.age),
				gender: readString(person.gender),
				ssn: readString(identity.ssn)
			},
			address: {
				...defaults.address,
				street: readString(address.line1),
				street2: readString(address.line2),
				city: readString(address.city),
				state: readString(address.stateOrProvince),
				zip: readString(address.postalCode),
				country: readString(address.country)
			},
			company: {
				...defaults.company,
				name: readString(company.name),
				title: readString(company.title),
				department: readString(company.department),
				website: readString(company.website)
			},
			payment: {
				...defaults.payment,
				cardNumber: readString(payment.cardNumber),
				expiry: readString(payment.expiry),
				cvv: readString(payment.cvv),
				cardholderName: readString(payment.cardholderName)
			},
			account: {
				...defaults.account,
				username: readString(account.username),
				password: readString(account.password)
			},
			custom: normalizeStringRecord(source.custom)
		}
	}

	private profileDataToCanonicalValues(data: ProfileData): StoredProfileRecord['values'] {
		return {
			person: {
				firstName: data.personal.firstName || undefined,
				lastName: data.personal.lastName || undefined,
				fullName: data.personal.fullName || undefined,
				dateOfBirth: data.personal.dateOfBirth || undefined,
				age: data.personal.age || undefined,
				gender: data.personal.gender || undefined
			},
			contact: {
				email: {
					primary: data.personal.email || undefined
				},
				phone: {
					primary: data.personal.phone || undefined
				}
			},
			address: {
				line1: data.address.street || undefined,
				line2: data.address.street2 || undefined,
				city: data.address.city || undefined,
				stateOrProvince: data.address.state || undefined,
				postalCode: data.address.zip || undefined,
				country: data.address.country || undefined
			},
			company: {
				name: data.company.name || undefined,
				title: data.company.title || undefined,
				department: data.company.department || undefined,
				website: data.company.website || undefined
			},
			account: {
				username: data.account.username || undefined,
				password: data.account.password || undefined
			},
			payment: {
				cardNumber: data.payment.cardNumber || undefined,
				expiry: data.payment.expiry || undefined,
				cvv: data.payment.cvv || undefined,
				cardholderName: data.payment.cardholderName || undefined
			},
			identity: {
				ssn: data.personal.ssn || undefined
			},
			employment: {},
			business: {},
			custom: { ...data.custom }
		}
	}

	private migrateStoredProfile(rawProfile: unknown): StoredProfileRecord | null {
		if (!isRecord(rawProfile)) return null

		const now = Date.now()
		const createdAt = readNumber(rawProfile.createdAt, now)
		const normalizedData = isRecord(rawProfile.data)
			? this.normalizeProfileData(rawProfile.data)
			: this.canonicalValuesToProfileData(rawProfile.values)

		return {
			id: readString(rawProfile.id) || `profile_${createdAt}_${Math.random().toString(36).slice(2, 11)}`,
			name: readString(rawProfile.name) || 'Imported Profile',
			isDefault: Boolean(rawProfile.isDefault),
			schemaVersion: PROFILE_SCHEMA_VERSION,
			locale: readOptionalString(rawProfile.locale),
			country: readOptionalString(rawProfile.country),
			language: readOptionalString(rawProfile.language),
			tags: normalizeStringList(rawProfile.tags),
			notes: readOptionalString(rawProfile.notes),
			values: this.profileDataToCanonicalValues(normalizedData),
			generators: isRecord(rawProfile.generators)
				? rawProfile.generators as StoredProfileRecord['generators']
				: undefined,
			createdAt,
			updatedAt: readNumber(rawProfile.updatedAt, createdAt),
			data: normalizedData
		}
	}

	private migrateStoredProfiles(rawProfiles: unknown): { profiles: StoredProfileRecord[]; changed: boolean } {
		if (!Array.isArray(rawProfiles)) {
			return { profiles: [], changed: false }
		}

		let changed = false

		const profiles = rawProfiles.flatMap(rawProfile => {
			const migrated = this.migrateStoredProfile(rawProfile)
			if (!migrated) {
				changed = true
				return []
			}

			if (!isRecord(rawProfile) || rawProfile.schemaVersion !== PROFILE_SCHEMA_VERSION || !isRecord(rawProfile.values)) {
				changed = true
			}

			return [migrated]
		})

		return { profiles, changed }
	}

	private toCompatProfile(profile: StoredProfileRecord): Profile {
		return {
			id: profile.id,
			name: profile.name,
			isDefault: profile.isDefault,
			data: profile.data,
			schemaVersion: profile.schemaVersion,
			createdAt: profile.createdAt,
			updatedAt: profile.updatedAt
		}
	}

	private async persistProfiles(profiles: StoredProfileRecord[]): Promise<void> {
		const encryptedData = await this.encryptSensitiveData(profiles)
		await chrome.storage.local.set({
			profiles: encryptedData,
			[PROFILE_STORAGE_VERSION_KEY]: PROFILE_SCHEMA_VERSION
		})
	}

	private async encryptSensitiveData<T extends { data: ProfileData }>(profiles: T[]): Promise<string> {
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

	private async decryptSensitiveData<T extends { data: ProfileData }>(encryptedData: string): Promise<T[]> {
		const key = await this.getEncryptionKey()

		try {
			const profiles = JSON.parse(encryptedData) as T[]
			if (!Array.isArray(profiles)) return []

			// Decrypt sensitive fields
			return profiles.map(profile => {
				if (!isRecord(profile) || !isRecord(profile.data)) {
					return profile
				}

				const normalizedData = this.normalizeProfileData(profile.data)
				const decryptedProfile = {
					...profile,
					data: normalizedData
				}

				// Decrypt SSN if encrypted
				if (normalizedData.personal.ssn) {
					try {
						const decrypted = simpleDecrypt(normalizedData.personal.ssn, key)
						if (decrypted) {
							decryptedProfile.data.personal.ssn = decrypted
						}
					} catch {
						// If decryption fails, keep original (might not be encrypted)
					}
				}

				// Decrypt payment data if present
				if (normalizedData.payment.cardNumber) {
					try {
						const decrypted = simpleDecrypt(normalizedData.payment.cardNumber, key)
						if (decrypted) {
							decryptedProfile.data.payment.cardNumber = decrypted
						}
					} catch {
						// Keep original if decryption fails
					}
				}

				if (normalizedData.payment.cvv) {
					try {
						const decrypted = simpleDecrypt(normalizedData.payment.cvv, key)
						if (decrypted) {
							decryptedProfile.data.payment.cvv = decrypted
						}
					} catch {
						// Keep original if decryption fails
					}
				}

				// Decrypt account password if present
				if (normalizedData.account.password) {
					try {
						const decrypted = simpleDecrypt(normalizedData.account.password, key)
						if (decrypted) {
							decryptedProfile.data.account.password = decrypted
						}
					} catch {
						// Keep original if decryption fails
					}
				}

				return decryptedProfile as T
			})
		} catch (error) {
			console.error('FormFilla: Failed to decrypt profile data', error)
			return []
		}
	}

	// Use storage.local for large data, storage.sync for settings
	async saveProfiles(profiles: Profile[]): Promise<void> {
		const migratedProfiles = profiles.map(profile => this.migrateStoredProfile(profile)).filter((profile): profile is StoredProfileRecord => Boolean(profile))

		// Validate profile data before saving
		for (const profile of migratedProfiles) {
			const validation = validateProfileData(profile.data)
			if (!validation.isValid) {
				throw new Error(`Invalid profile data: ${validation.errors.join(', ')}`)
			}
		}

		await this.persistProfiles(migratedProfiles)
	}

	async getProfiles(): Promise<Profile[]> {
		const result = await chrome.storage.local.get(['profiles', PROFILE_STORAGE_VERSION_KEY])
		if (!result.profiles) return []

		// Handle both old (object array) and new (encrypted string) formats
		let rawProfiles: unknown
		if (typeof result.profiles === 'string') {
			rawProfiles = await this.decryptSensitiveData<StoredProfileRecord>(result.profiles)
		} else {
			rawProfiles = result.profiles || []
		}

		const migratedProfiles = this.migrateStoredProfiles(rawProfiles)
		const storageVersion = readNumber(result[PROFILE_STORAGE_VERSION_KEY], 0)

		if (typeof result.profiles !== 'string' || migratedProfiles.changed || storageVersion !== PROFILE_SCHEMA_VERSION) {
			await this.persistProfiles(migratedProfiles.profiles)
		}

		return migratedProfiles.profiles.map(profile => this.toCompatProfile(profile))
	}

	async saveSettings(settings: Partial<StorageData['settings']>): Promise<void> {
		const current = await this.getSettings()
		await chrome.storage.sync.set({
			settings: normalizeSettings({ ...current, ...settings })
		})
	}

	async getSettings(): Promise<StorageData['settings']> {
		const result = await chrome.storage.sync.get('settings')
		return normalizeSettings(result.settings)
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
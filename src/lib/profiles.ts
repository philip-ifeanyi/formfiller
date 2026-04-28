import { PROFILE_SCHEMA_VERSION, Profile, ProfileData } from '@/types'
import { StorageService } from './storage'

export class ProfileManager {
	constructor(private storage: StorageService) { }

	private ensureSchemaVersion(profile: Profile): Profile {
		return {
			...profile,
			schemaVersion: profile.schemaVersion ?? PROFILE_SCHEMA_VERSION
		}
	}

	async createProfile(profileData: Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>): Promise<Profile> {
		const profile = this.ensureSchemaVersion({
			...profileData,
			id: this.generateId(),
			createdAt: Date.now(),
			updatedAt: Date.now()
		})

		const profiles = await this.storage.getProfiles()

		// If this profile is set as default, unset other defaults
		if (profile.isDefault) {
			profiles.forEach(p => p.isDefault = false)
		}

		profiles.push(profile)
		await this.storage.saveProfiles(profiles)

		// Update settings if this is the new default
		if (profile.isDefault) {
			await this.storage.saveSettings({ defaultProfile: profile.id })
		}

		return profile
	}

	async updateProfile(id: string, updates: Partial<Profile>): Promise<Profile | null> {
		const profiles = await this.storage.getProfiles()
		const profileIndex = profiles.findIndex(p => p.id === id)

		if (profileIndex === -1) return null

		profiles[profileIndex] = {
			...profiles[profileIndex],
			...updates,
			schemaVersion: updates.schemaVersion ?? profiles[profileIndex].schemaVersion ?? PROFILE_SCHEMA_VERSION,
			updatedAt: Date.now()
		}

		await this.storage.saveProfiles(profiles)
		return this.ensureSchemaVersion(profiles[profileIndex])
	}

	async updateProfileData(id: string, updates: Partial<ProfileData>): Promise<Profile | null> {
		const profiles = await this.storage.getProfiles()
		const profileIndex = profiles.findIndex(p => p.id === id)

		if (profileIndex === -1) return null

		profiles[profileIndex] = {
			...profiles[profileIndex],
			data: {
				...profiles[profileIndex].data,
				personal: { ...profiles[profileIndex].data.personal, ...updates.personal },
				address: { ...profiles[profileIndex].data.address, ...updates.address },
				company: { ...profiles[profileIndex].data.company, ...updates.company },
				payment: { ...profiles[profileIndex].data.payment, ...updates.payment },
				account: { ...profiles[profileIndex].data.account, ...updates.account },
				custom: { ...profiles[profileIndex].data.custom, ...updates.custom }
			},
			schemaVersion: profiles[profileIndex].schemaVersion ?? PROFILE_SCHEMA_VERSION,
			updatedAt: Date.now()
		}

		await this.storage.saveProfiles(profiles)
		return this.ensureSchemaVersion(profiles[profileIndex])
	}

	async deleteProfile(id: string): Promise<boolean> {
		const profiles = await this.storage.getProfiles()
		const profileToDelete = profiles.find(p => p.id === id)
		const filteredProfiles = profiles.filter(p => p.id !== id)

		if (filteredProfiles.length === profiles.length) return false

		await this.storage.saveProfiles(filteredProfiles)

		// If we deleted the default profile and other profiles exist, set a new default
		if (profileToDelete?.isDefault && filteredProfiles.length > 0) {
			await this.setDefaultProfile(filteredProfiles[0].id)
		}

		return true
	}

	async setDefaultProfile(id: string): Promise<void> {
		const profiles = await this.storage.getProfiles()

		profiles.forEach(profile => {
			profile.isDefault = profile.id === id
		})

		await this.storage.saveProfiles(profiles)
		await this.storage.saveSettings({ defaultProfile: id })
	}

	async getDefaultProfile(): Promise<Profile | null> {
		const profiles = await this.storage.getProfiles()
		const defaultProfile = profiles.find(p => p.isDefault)

		if (defaultProfile) return defaultProfile

		// If no default is set but profiles exist, set first profile as default
		if (profiles.length > 0) {
			await this.setDefaultProfile(profiles[0].id)
			return this.ensureSchemaVersion({ ...profiles[0], isDefault: true })
		}

		return null
	}

	async getProfile(id: string): Promise<Profile | null> {
		const profiles = await this.storage.getProfiles()
		const profile = profiles.find(p => p.id === id)
		return profile ? this.ensureSchemaVersion(profile) : null
	}

	async getAllProfiles(): Promise<Profile[]> {
		const profiles = await this.storage.getProfiles()
		return profiles.map(profile => this.ensureSchemaVersion(profile))
	}

	async duplicateProfile(id: string, newName?: string): Promise<Profile | null> {
		const original = await this.getProfile(id)
		if (!original) return null

		const duplicate = this.ensureSchemaVersion({
			...original,
			id: this.generateId(),
			name: newName || `${original.name} (Copy)`,
			isDefault: false,
			createdAt: Date.now(),
			updatedAt: Date.now()
		})

		const profiles = await this.storage.getProfiles()
		profiles.push(duplicate)
		await this.storage.saveProfiles(profiles)

		return duplicate
	}

	// Export profiles to JSON
	async exportProfiles(): Promise<string> {
		const profiles = await this.storage.getProfiles()
		return JSON.stringify(profiles, null, 2)
	}

	// Import profiles from JSON
	async importProfiles(jsonData: string, replaceExisting = false): Promise<void> {
		try {
			const importedProfiles: Profile[] = JSON.parse(jsonData)

			// Validate imported data
			if (!Array.isArray(importedProfiles)) {
				throw new Error('Invalid profile data format')
			}

			// Generate new IDs for imported profiles to avoid conflicts
			const profilesWithNewIds = importedProfiles.map(profile => ({
				...this.ensureSchemaVersion(profile),
				...profile,
				id: this.generateId(),
				schemaVersion: profile.schemaVersion ?? PROFILE_SCHEMA_VERSION,
				isDefault: false,
				createdAt: Date.now(),
				updatedAt: Date.now()
			}))

			if (replaceExisting) {
				await this.storage.saveProfiles(profilesWithNewIds)
			} else {
				const existingProfiles = await this.storage.getProfiles()
				await this.storage.saveProfiles([...existingProfiles, ...profilesWithNewIds])
			}
		} catch (error) {
			throw new Error(`Failed to import profiles: ${error instanceof Error ? error.message : 'Unknown error'}`)
		}
	}

	private generateId(): string {
		return `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
	}
}
import { simpleEncrypt } from '@/lib/security'
import { StorageService } from '@/lib/storage'
import { PROFILE_SCHEMA_VERSION, type Profile, type ProfileData } from '@/types'

type ScenarioCheck = {
	message: string
	passed: boolean
}

type ScenarioResult = {
	name: string
	passed: boolean
	checks: ScenarioCheck[]
	persistedSnapshot: unknown
}

type MockStorageChangeListener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void

type MockStorageArea = {
	state: Record<string, unknown>
	get(keys?: string | string[] | Record<string, unknown>): Promise<Record<string, unknown>>
	set(items: Record<string, unknown>): Promise<void>
	clear(): Promise<void>
	remove(keys: string | string[]): Promise<void>
}

type MockChrome = {
	storage: {
		local: MockStorageArea
		sync: MockStorageArea
		onChanged: {
			addListener(listener: MockStorageChangeListener): void
			removeListener(listener: MockStorageChangeListener): void
		}
	}
}

const runButton = document.getElementById('run-fixture') as HTMLButtonElement
const resetButton = document.getElementById('reset-fixture') as HTMLButtonElement
const statusElement = document.getElementById('fixture-status') as HTMLDivElement
const resultsElement = document.getElementById('fixture-results') as HTMLDivElement

const storageService = StorageService.getInstance()
const mockChrome = createMockChrome()

	; (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome = mockChrome as unknown as typeof chrome

runButton.addEventListener('click', () => {
	void runFixture()
})

resetButton.addEventListener('click', () => {
	resetFixtureState()
	renderIdleState()
})

renderIdleState()

async function runFixture(): Promise<void> {
	runButton.disabled = true
	statusElement.dataset.state = 'idle'
	statusElement.textContent = 'Running migration scenarios...'

	const results = await Promise.all([
		runLegacyArrayScenario(),
		runLegacyStringScenario()
	])

	const passed = results.every(result => result.passed)
	statusElement.dataset.state = passed ? 'pass' : 'fail'
	statusElement.textContent = passed
		? 'All migration scenarios passed.'
		: 'One or more migration scenarios failed.'

	renderResults(results)
	runButton.disabled = false
}

function resetFixtureState(): void {
	mockChrome.storage.local.state = {}
	mockChrome.storage.sync.state = {}
		; (storageService as unknown as { encryptionKey: string | null }).encryptionKey = null
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function renderIdleState(): void {
	statusElement.dataset.state = 'idle'
	statusElement.textContent = 'Ready.'
	resultsElement.innerHTML = ''
}

function createLegacyProfile(profileId: string): Profile {
	const profileData: ProfileData = {
		personal: {
			firstName: 'Legacy',
			lastName: 'Tester',
			fullName: 'Legacy Tester',
			email: 'legacy.tester@example.test',
			phone: '+1-555-0100',
			dateOfBirth: '1991-06-15',
			age: '34',
			gender: 'male',
			ssn: '123-45-6789'
		},
		address: {
			street: '100 Migration Way',
			street2: 'Suite 12',
			city: 'Fixture City',
			state: 'CA',
			zip: '94105',
			country: 'United States'
		},
		company: {
			name: 'Fixture Labs',
			title: 'QA Engineer',
			department: 'engineering',
			website: 'https://fixture.example.test'
		},
		payment: {
			cardNumber: '4242424242424242',
			expiry: '12/28',
			cvv: '123',
			cardholderName: 'Legacy Tester'
		},
		account: {
			username: 'legacytester',
			password: 'LegacyPassword123!'
		},
		custom: {
			bio: 'Legacy fixture profile for migration verification.'
		}
	}

	return {
		id: profileId,
		name: 'Legacy Fixture Profile',
		isDefault: true,
		data: profileData,
		createdAt: 1_714_296_000_000,
		updatedAt: 1_714_296_000_000
	}
}

async function runLegacyArrayScenario(): Promise<ScenarioResult> {
	resetFixtureState()

	const legacyProfile = createLegacyProfile('legacy-array-profile')
	await mockChrome.storage.local.set({ profiles: [legacyProfile] })

	const migratedProfiles = await storageService.getProfiles()
	const persisted = await mockChrome.storage.local.get(['profiles', 'profileStorageVersion', 'encryptionKey'])
	const persistedProfiles = typeof persisted.profiles === 'string'
		? JSON.parse(persisted.profiles) as Array<Record<string, unknown>>
		: []
	const rerunProfiles = await storageService.getProfiles()

	const checks: ScenarioCheck[] = [
		{
			message: 'returns a migrated compatibility profile',
			passed: migratedProfiles.length === 1 && migratedProfiles[0].schemaVersion === PROFILE_SCHEMA_VERSION
		},
		{
			message: 'preserves legacy contact data for existing callers',
			passed: migratedProfiles[0]?.data.personal.email === legacyProfile.data.personal.email
		},
		{
			message: 'rewrites storage into the string-backed format',
			passed: typeof persisted.profiles === 'string'
		},
		{
			message: 'writes the storage schema version marker',
			passed: persisted.profileStorageVersion === PROFILE_SCHEMA_VERSION
		},
		{
			message: 'persists canonical values alongside compatibility data',
			passed: Boolean(
				persistedProfiles[0]?.schemaVersion === PROFILE_SCHEMA_VERSION &&
				persistedProfiles[0]?.values &&
				persistedProfiles[0]?.data
			)
		},
		{
			message: 'remains idempotent on a second read',
			passed: rerunProfiles.length === 1 && rerunProfiles[0].schemaVersion === PROFILE_SCHEMA_VERSION
		}
	]

	return {
		name: 'Legacy array payload migration',
		passed: checks.every(check => check.passed),
		checks,
		persistedSnapshot: persistedProfiles[0] ?? null
	}
}

async function runLegacyStringScenario(): Promise<ScenarioResult> {
	resetFixtureState()

	const encryptionKey = 'fixture-key'
	const legacyProfile = createLegacyProfile('legacy-string-profile')
	const encryptedLegacyProfile: Profile = {
		...legacyProfile,
		data: {
			...legacyProfile.data,
			personal: {
				...legacyProfile.data.personal,
				ssn: simpleEncrypt(legacyProfile.data.personal.ssn, encryptionKey)
			},
			payment: {
				...legacyProfile.data.payment,
				cardNumber: simpleEncrypt(legacyProfile.data.payment.cardNumber, encryptionKey),
				cvv: simpleEncrypt(legacyProfile.data.payment.cvv, encryptionKey)
			},
			account: {
				...legacyProfile.data.account,
				password: simpleEncrypt(legacyProfile.data.account.password, encryptionKey)
			}
		}
	}

	await mockChrome.storage.local.set({
		encryptionKey,
		profiles: JSON.stringify([encryptedLegacyProfile])
	})

	const migratedProfiles = await storageService.getProfiles()
	const persisted = await mockChrome.storage.local.get(['profiles', 'profileStorageVersion'])
	const persistedProfiles = typeof persisted.profiles === 'string'
		? JSON.parse(persisted.profiles) as Array<Record<string, unknown>>
		: []
	const persistedData = isRecord(persistedProfiles[0]?.data) ? persistedProfiles[0].data : null
	const persistedPersonal = persistedData && isRecord(persistedData.personal) ? persistedData.personal : null

	const checks: ScenarioCheck[] = [
		{
			message: 'decrypts legacy sensitive values during migration',
			passed:
				migratedProfiles[0]?.data.personal.ssn === legacyProfile.data.personal.ssn &&
				migratedProfiles[0]?.data.payment.cardNumber === legacyProfile.data.payment.cardNumber &&
				migratedProfiles[0]?.data.account.password === legacyProfile.data.account.password
		},
		{
			message: 'rewrites the version marker after string-backed migration',
			passed: persisted.profileStorageVersion === PROFILE_SCHEMA_VERSION
		},
		{
			message: 'persists canonical values on the rewritten record',
			passed: Boolean(persistedProfiles[0]?.values && persistedProfiles[0]?.schemaVersion === PROFILE_SCHEMA_VERSION)
		},
		{
			message: 'keeps compatibility data for current callers',
			passed: persistedPersonal?.email === legacyProfile.data.personal.email
		}
	]

	return {
		name: 'Legacy string payload migration',
		passed: checks.every(check => check.passed),
		checks,
		persistedSnapshot: persistedProfiles[0] ?? null
	}
}

function renderResults(results: ScenarioResult[]): void {
	resultsElement.innerHTML = ''

	for (const result of results) {
		const card = document.createElement('article')
		card.className = `result-card ${result.passed ? 'pass' : 'fail'}`

		const heading = document.createElement('h2')
		heading.textContent = `${result.passed ? 'PASS' : 'FAIL'} · ${result.name}`
		card.appendChild(heading)

		const list = document.createElement('ul')
		for (const check of result.checks) {
			const item = document.createElement('li')
			item.textContent = `${check.passed ? 'OK' : 'ERR'} · ${check.message}`
			list.appendChild(item)
		}
		card.appendChild(list)

		const snapshot = document.createElement('pre')
		snapshot.textContent = JSON.stringify(result.persistedSnapshot, null, 2)
		card.appendChild(snapshot)

		resultsElement.appendChild(card)
	}
}

function createMockChrome(): MockChrome {
	const listeners = new Set<MockStorageChangeListener>()

	function emitChanges(areaName: string, changes: Record<string, chrome.storage.StorageChange>): void {
		listeners.forEach(listener => listener(changes, areaName))
	}

	function createStorageArea(areaName: string): MockStorageArea {
		const area: MockStorageArea = {
			state: {},
			async get(keys) {
				if (typeof keys === 'string') {
					return { [keys]: area.state[keys] }
				}

				if (Array.isArray(keys)) {
					return keys.reduce<Record<string, unknown>>((accumulator, key) => {
						accumulator[key] = area.state[key]
						return accumulator
					}, {})
				}

				if (keys && typeof keys === 'object') {
					return Object.entries(keys).reduce<Record<string, unknown>>((accumulator, [key, fallback]) => {
						accumulator[key] = key in area.state ? area.state[key] : fallback
						return accumulator
					}, {})
				}

				return { ...area.state }
			},
			async set(items) {
				const changes = Object.entries(items).reduce<Record<string, chrome.storage.StorageChange>>((accumulator, [key, value]) => {
					accumulator[key] = {
						oldValue: area.state[key],
						newValue: value
					}
					return accumulator
				}, {})

				area.state = { ...area.state, ...items }
				emitChanges(areaName, changes)
			},
			async clear() {
				const changes = Object.entries(area.state).reduce<Record<string, chrome.storage.StorageChange>>((accumulator, [key, value]) => {
					accumulator[key] = {
						oldValue: value,
						newValue: undefined
					}
					return accumulator
				}, {})

				area.state = {}
				emitChanges(areaName, changes)
			},
			async remove(keys) {
				const keyList = Array.isArray(keys) ? keys : [keys]
				const changes = keyList.reduce<Record<string, chrome.storage.StorageChange>>((accumulator, key) => {
					accumulator[key] = {
						oldValue: area.state[key],
						newValue: undefined
					}
					delete area.state[key]
					return accumulator
				}, {})

				emitChanges(areaName, changes)
			}
		}

		return area
	}

	return {
		storage: {
			local: createStorageArea('local'),
			sync: createStorageArea('sync'),
			onChanged: {
				addListener(listener) {
					listeners.add(listener)
				},
				removeListener(listener) {
					listeners.delete(listener)
				}
			}
		}
	}
}
export const PROFILE_SCHEMA_VERSION = 1 as const

export type ProfileSchemaVersion = typeof PROFILE_SCHEMA_VERSION
export type FormControlElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
export type FieldControlKind =
	| 'text'
	| 'textarea'
	| 'select'
	| 'checkbox'
	| 'radio'
	| 'date'
	| 'datetime'
	| 'number'
	| 'email'
	| 'tel'
	| 'password'
	| 'hidden'
	| 'custom'
	| 'unknown'
export type FieldPrivacyLevel = 'public' | 'sensitive' | 'secret'
export type FieldInferenceStatus = 'high-confidence' | 'review' | 'skip'
export type FillResultStatus = 'filled' | 'skipped' | 'review' | 'failed'
export type FieldValidationRule = RegExp | Record<string, RegExp>
export type ProfilePrimitive = string | number | boolean | null
export type ProfileValue =
	| ProfilePrimitive
	| ProfileValue[]
	| { [key: string]: ProfileValue | undefined }

export interface ExtensionSettings {
	autoFillEnabled: boolean
	defaultProfile: string
	fillDelay: number
	highlightFields: boolean
	showButtons: boolean
	buttonPosition: 'inside-right' | 'outside-right' | 'above'
	contextMenuEnabled: boolean
	autoHideButtons: boolean
	buttonStyle: 'minimal' | 'full'
	debugMode?: boolean
	featureFlags?: Record<string, boolean>
}

export interface StorageData {
	profiles: Profile[]
	settings: ExtensionSettings
	fieldMappings: Record<string, string>
}

export interface ProfileGeneratorConfig {
	kind: 'literal' | 'derived' | 'sequence' | 'locale-template'
	source?: string
	template?: string
	options?: Record<string, string | number | boolean>
}

export interface CanonicalPersonValues {
	firstName?: string
	middleName?: string
	lastName?: string
	fullName?: string
	preferredName?: string
	honorific?: string
	dateOfBirth?: string
	age?: string
	gender?: string
}

export interface CanonicalContactValues {
	email?: {
		primary?: string
		secondary?: string
	}
	phone?: {
		primary?: string
		mobile?: string
		work?: string
	}
	website?: string
}

export interface CanonicalAddressValues {
	line1?: string
	line2?: string
	city?: string
	stateOrProvince?: string
	postalCode?: string
	country?: string
}

export interface CanonicalCompanyValues {
	name?: string
	title?: string
	department?: string
	website?: string
}

export interface CanonicalAccountValues {
	username?: string
	password?: string
	confirmPassword?: string
}

export interface CanonicalPaymentValues {
	cardNumber?: string
	expiry?: string
	cvv?: string
	cardholderName?: string
}

export interface CanonicalIdentityValues {
	ssn?: string
	nationalId?: string
	passportNumber?: string
}

export interface CanonicalProfileValues {
	person: CanonicalPersonValues
	contact: CanonicalContactValues
	address: CanonicalAddressValues
	company: CanonicalCompanyValues
	account: CanonicalAccountValues
	payment: CanonicalPaymentValues
	identity: CanonicalIdentityValues
	employment: Record<string, ProfileValue | undefined>
	business: Record<string, ProfileValue | undefined>
	custom: Record<string, ProfileValue | undefined>
}

export interface ProfileDefinition {
	id: string
	name: string
	isDefault: boolean
	schemaVersion: ProfileSchemaVersion
	locale?: string
	country?: string
	language?: string
	tags?: string[]
	notes?: string
	values: CanonicalProfileValues
	generators?: Record<string, ProfileGeneratorConfig>
	createdAt: number
	updatedAt: number
}

export type CanonicalFieldNamespace =
	| 'person'
	| 'contact'
	| 'address'
	| 'company'
	| 'account'
	| 'payment'
	| 'identity'
	| 'employment'
	| 'business'
	| 'custom'
export type CanonicalFieldKey = `${CanonicalFieldNamespace}.${string}`

export type FieldEvidenceSource =
	| 'label'
	| 'placeholder'
	| 'aria-label'
	| 'aria-labelledby'
	| 'aria-describedby'
	| 'autocomplete'
	| 'name'
	| 'id'
	| 'class'
	| 'data-attribute'
	| 'option-text'
	| 'surrounding-text'
	| 'fieldset'
	| 'peer-context'
	| 'input-type'
	| 'role'

export interface FieldEvidence {
	source: FieldEvidenceSource
	raw: string
	normalized?: string
	weight?: number
}

export interface FieldRegistryEntry {
	key: CanonicalFieldKey
	legacyType?: string
	legacySubtype?: string
	aliases?: string[]
	positiveTokens?: string[]
	negativeTokens?: string[]
	supportedControlKinds?: FieldControlKind[]
	privacyLevel?: FieldPrivacyLevel
	generator?: string
	validation?: FieldValidationRule
}

export interface FieldCandidate {
	id: string
	element: FormControlElement
	formId: string
	sectionId?: string
	controlKind: FieldControlKind
	htmlType?: string
	role?: string
	labelText?: string
	placeholder?: string
	autocomplete?: string
	attributes: Record<string, string>
	optionText: string[]
	nearbyText: string[]
	evidence: FieldEvidence[]
	peerIds?: string[]
	domSignature: string
	visibility: 'visible' | 'hidden' | 'offscreen'
	isDisabled: boolean
	isReadonly: boolean
}

export interface FieldInferenceAlternative {
	fieldKey: CanonicalFieldKey
	confidence: number
	reasons: string[]
}

export interface FieldInference {
	fieldKey: CanonicalFieldKey | null
	legacyType?: string
	legacySubtype?: string
	confidence: number
	status: FieldInferenceStatus
	reasons: string[]
	alternatives: FieldInferenceAlternative[]
}

export interface FillRetryPolicy {
	maxAttempts: number
	backoffMs: number
	strategy: 'none' | 'fixed' | 'progressive'
}

export interface FillInstruction {
	candidateId: string
	fieldKey: CanonicalFieldKey
	profilePath: string
	rawValue: ProfileValue
	normalizedValue: string
	adapterId: string
	eventStrategy: string[]
	retryPolicy: FillRetryPolicy
}

export interface FillResult {
	candidateId: string
	fieldKey: CanonicalFieldKey
	status: FillResultStatus
	adapterId: string
	appliedValue?: string
	verified: boolean
	message?: string
}

/**
 * @deprecated Use ProfileDefinition for new work.
 */
export interface Profile {
	id: string
	name: string
	isDefault: boolean
	data: ProfileData
	schemaVersion?: ProfileSchemaVersion
	createdAt: number
	updatedAt: number
}

/**
 * @deprecated Use CanonicalProfileValues for new work.
 */
export interface ProfileData {
	personal: {
		firstName: string
		lastName: string
		fullName: string
		email: string
		phone: string
		dateOfBirth: string
		age: string
		gender: string
		ssn: string
	}
	address: {
		street: string
		street2: string
		city: string
		state: string
		zip: string
		country: string
	}
	company: {
		name: string
		title: string
		department: string
		website: string
	}
	payment: {
		cardNumber: string
		expiry: string
		cvv: string
		cardholderName: string
	}
	account: {
		username: string
		password: string
	}
	custom: Record<string, string>
}

/**
 * @deprecated Use FieldCandidate and FieldInference for new work.
 */
export interface FieldInfo {
	element: FormControlElement
	type: string
	subtype: string
	confidence: number
	suggestions: string[]
}

/**
 * @deprecated Use FieldRegistryEntry for new work.
 */
export interface FieldPattern {
	selectors: string[]
	patterns: RegExp[]
	autocomplete: string[]
	validation?: FieldValidationRule
}
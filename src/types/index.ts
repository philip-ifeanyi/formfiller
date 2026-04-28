export interface Profile {
	id: string
	name: string
	isDefault: boolean
	data: ProfileData
	createdAt: number
	updatedAt: number
}

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

export interface StorageData {
	profiles: Profile[]
	settings: {
		autoFillEnabled: boolean
		defaultProfile: string
		fillDelay: number
		highlightFields: boolean
		showButtons: boolean
		buttonPosition: 'inside-right' | 'outside-right' | 'above'
		contextMenuEnabled: boolean
		autoHideButtons: boolean
		buttonStyle: 'minimal' | 'full'
	}
	fieldMappings: Record<string, string>
}

export interface FieldInfo {
	element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
	type: string
	subtype: string
	confidence: number
	suggestions: string[]
}

export interface FieldPattern {
	selectors: string[]
	patterns: RegExp[]
	autocomplete: string[]
	validation?: RegExp | Record<string, RegExp>
}
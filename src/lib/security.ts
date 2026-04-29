/**
 * Security utilities for FormFilla extension
 * Provides input sanitization, validation, and security helpers
 */

/**
 * Sanitizes text content to prevent XSS attacks
 * Removes HTML tags and encodes special characters
 */
export function sanitizeText(input: string): string {
	if (typeof input !== 'string') return ''

	// Remove HTML tags
	const withoutTags = input.replace(/<[^>]*>/g, '')

	// Encode special characters
	return withoutTags
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#x27;')
		.replace(/\//g, '&#x2F;')
}

/**
 * Sanitizes HTML attributes to prevent attribute injection
 */
export function sanitizeAttribute(input: string): string {
	if (typeof input !== 'string') return ''

	return input
		.replace(/[<>"'&]/g, '')
		.trim()
}

/**
 * Validates email format
 */
export function isValidEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
	return emailRegex.test(email)
}

/**
 * Validates phone number format (basic validation)
 */
export function isValidPhone(phone: string): boolean {
	const phoneRegex = /^[\+]?[\s\d\(\)\-\.]{7,20}$/
	return phoneRegex.test(phone)
}

/**
 * Validates that input doesn't contain malicious patterns
 */
export function containsMaliciousPatterns(input: string): boolean {
	const maliciousPatterns = [
		/<script[^>]*>/i,
		/javascript:/i,
		/vbscript:/i,
		/on\w+\s*=/i,
		/eval\s*\(/i,
		/expression\s*\(/i,
		/url\s*\(/i,
		/import\s*\(/i
	]

	return maliciousPatterns.some(pattern => pattern.test(input))
}

/**
 * Sanitizes form field values before setting
 */
export function sanitizeFieldValue(value: string, fieldType?: string): string {
	if (typeof value !== 'string') return ''

	// Check for malicious patterns
	if (containsMaliciousPatterns(value)) {
		console.warn('FormFilla: Malicious pattern detected in field value, sanitizing')
		return sanitizeText(value)
	}

	// Basic sanitization based on field type
	switch (fieldType) {
		case 'email':
			return value.trim().toLowerCase()
		case 'phone':
			return value.replace(/[^\d\+\-\(\)\s\.]/g, '')
		case 'number':
			return value.replace(/[^\d\.\-]/g, '')
		case 'url':
			return value.trim().toLowerCase()
		default:
			return value.trim()
	}
}

function normalizeDebugFieldKey(fieldKey?: string): string {
	return typeof fieldKey === 'string'
		? fieldKey.replace(/[^a-z]/gi, '').toLowerCase()
		: ''
}

function maskVisibleSuffix(value: string, visibleCount: number): string {
	if (value.length <= visibleCount) {
		return '•'.repeat(Math.max(value.length, 2))
	}

	return `${'•'.repeat(Math.max(value.length - visibleCount, 2))}${value.slice(-visibleCount)}`
}

export function createDebugValuePreview(value: string, fieldKey?: string, maxLength: number = 36): string {
	if (typeof value !== 'string') return ''

	const trimmedValue = value.trim()
	if (!trimmedValue) return ''

	const normalizedFieldKey = normalizeDebugFieldKey(fieldKey)

	if (normalizedFieldKey.includes('password') || normalizedFieldKey.includes('cvv')) {
		return 'Hidden for safety'
	}

	if (normalizedFieldKey.includes('cardnumber')) {
		return trimmedValue.length > 4
			? `•••• ${trimmedValue.slice(-4)}`
			: 'Card value available'
	}

	if (
		normalizedFieldKey.includes('ssn') ||
		normalizedFieldKey.includes('nationalid') ||
		normalizedFieldKey.includes('passport')
	) {
		return maskVisibleSuffix(trimmedValue, 2)
	}

	if (normalizedFieldKey.includes('email')) {
		const [localPart, domain = ''] = trimmedValue.split('@')
		if (!domain) {
			return maskVisibleSuffix(trimmedValue, 2)
		}

		const visibleLocal = localPart.slice(0, 1)
		return `${visibleLocal || '•'}•••@${domain}`
	}

	if (normalizedFieldKey.includes('phone')) {
		const digitsOnly = trimmedValue.replace(/\D/g, '')
		if (digitsOnly.length >= 4) {
			return `•••${digitsOnly.slice(-4)}`
		}

		return maskVisibleSuffix(trimmedValue, 2)
	}

	if (normalizedFieldKey.includes('dateofbirth')) {
		return 'Birth date available'
	}

	const sanitizedValue = sanitizeFieldValue(trimmedValue)
	return sanitizedValue.length > maxLength
		? `${sanitizedValue.slice(0, Math.max(maxLength - 3, 1))}...`
		: sanitizedValue
}

export function summarizeDebugText(input: string, maxLength: number = 44): string {
	const sanitized = sanitizeText(input || '').replace(/\s+/g, ' ').trim()
	if (!sanitized) {
		return ''
	}

	return sanitized.length > maxLength
		? `${sanitized.slice(0, Math.max(maxLength - 3, 1))}...`
		: sanitized
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeString(value: unknown): string {
	return typeof value === 'string' ? value : ''
}

/**
 * Validates profile data structure
 */
export function validateProfileData(data: unknown): { isValid: boolean; errors: string[] } {
	const errors: string[] = []

	if (!isRecord(data)) {
		errors.push('Profile data must be an object')
		return { isValid: false, errors }
	}

	const personal = isRecord(data.personal) ? data.personal : null
	const company = isRecord(data.company) ? data.company : null
	const address = isRecord(data.address) ? data.address : null
	const payment = isRecord(data.payment) ? data.payment : null
	const account = isRecord(data.account) ? data.account : null
	const custom = isRecord(data.custom) ? data.custom : null

	// Validate personal data
	if (personal) {
		const email = safeString(personal.email)
		const phone = safeString(personal.phone)

		if (email && !isValidEmail(email)) {
			errors.push('Invalid email format')
		}

		if (phone && !isValidPhone(phone)) {
			errors.push('Invalid phone format')
		}

		// Check for malicious content in text fields
		const textFields = ['firstName', 'lastName', 'fullName', 'dateOfBirth', 'age', 'gender', 'ssn']
		textFields.forEach(field => {
			const value = safeString(personal[field])
			if (value && containsMaliciousPatterns(value)) {
				errors.push(`Malicious content detected in ${field}`)
			}
		})
	}

	// Validate company data
	if (company) {
		const companyFields = ['name', 'title', 'department', 'website']
		companyFields.forEach(field => {
			const value = safeString(company[field])
			if (value && containsMaliciousPatterns(value)) {
				errors.push(`Malicious content detected in company ${field}`)
			}
		})
	}

	// Validate address data
	if (address) {
		const addressFields = ['street', 'street2', 'city', 'state', 'zip', 'country']
		addressFields.forEach(field => {
			const value = safeString(address[field])
			if (value && containsMaliciousPatterns(value)) {
				errors.push(`Malicious content detected in address ${field}`)
			}
		})
	}

	if (payment) {
		const paymentFields = ['cardNumber', 'expiry', 'cvv', 'cardholderName']
		paymentFields.forEach(field => {
			const value = safeString(payment[field])
			if (value && containsMaliciousPatterns(value)) {
				errors.push(`Malicious content detected in payment ${field}`)
			}
		})
	}

	if (account) {
		const accountFields = ['username', 'password']
		accountFields.forEach(field => {
			const value = safeString(account[field])
			if (value && containsMaliciousPatterns(value)) {
				errors.push(`Malicious content detected in account ${field}`)
			}
		})
	}

	if (custom) {
		Object.entries(custom).forEach(([field, value]) => {
			const normalizedValue = safeString(value)
			if (normalizedValue && containsMaliciousPatterns(normalizedValue)) {
				errors.push(`Malicious content detected in custom ${field}`)
			}
		})
	}

	return { isValid: errors.length === 0, errors }
}

/**
 * Safely sets text content on DOM elements
 */
export function safeSetTextContent(element: HTMLElement, text: string): void {
	element.textContent = sanitizeText(text)
}

/**
 * Safely sets attribute values on DOM elements
 */
export function safeSetAttribute(element: HTMLElement, name: string, value: string): void {
	element.setAttribute(name, sanitizeAttribute(value))
}

/**
 * Creates a safe DOM element with sanitized content
 */
export function createSafeElement(tagName: string, textContent?: string, className?: string): HTMLElement {
	const element = document.createElement(tagName)

	if (textContent) {
		element.textContent = sanitizeText(textContent)
	}

	if (className) {
		element.className = sanitizeAttribute(className)
	}

	return element
}

/**
 * Validates message objects for inter-script communication
 */
export function validateMessage(message: unknown, expectedTypes: readonly string[]): { isValid: boolean; error?: string } {
	if (!message || typeof message !== 'object') {
		return { isValid: false, error: 'Message must be an object' }
	}

	const candidate = message as { type?: unknown }

	if (!candidate.type || typeof candidate.type !== 'string') {
		return { isValid: false, error: 'Message must have a string type' }
	}

	if (!expectedTypes.includes(candidate.type)) {
		return { isValid: false, error: `Unknown message type: ${candidate.type}` }
	}

	// Check for malicious patterns in message content
	const messageStr = JSON.stringify(message)
	if (containsMaliciousPatterns(messageStr)) {
		return { isValid: false, error: 'Malicious content detected in message' }
	}

	return { isValid: true }
}

/**
 * Simple encryption for sensitive data (basic XOR cipher)
 * Note: This is for basic obfuscation only, not cryptographic security
 */
export function simpleEncrypt(text: string, key: string = 'formfilla-key'): string {
	let result = ''
	for (let i = 0; i < text.length; i++) {
		result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length))
	}
	return btoa(result) // Base64 encode
}

/**
 * Simple decryption for sensitive data
 */
export function simpleDecrypt(encrypted: string, key: string = 'formfilla-key'): string {
	try {
		const text = atob(encrypted) // Base64 decode
		let result = ''
		for (let i = 0; i < text.length; i++) {
			result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length))
		}
		return result
	} catch (error) {
		console.error('FormFilla: Failed to decrypt data', error)
		return ''
	}
}

/**
 * Generates a random key for encryption
 */
export function generateEncryptionKey(): string {
	const array = new Uint8Array(32)
	crypto.getRandomValues(array)
	return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}
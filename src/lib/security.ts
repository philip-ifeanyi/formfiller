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

/**
 * Validates profile data structure
 */
export function validateProfileData(data: any): { isValid: boolean; errors: string[] } {
	const errors: string[] = []

	if (!data || typeof data !== 'object') {
		errors.push('Profile data must be an object')
		return { isValid: false, errors }
	}

	// Validate personal data
	if (data.personal) {
		if (data.personal.email && !isValidEmail(data.personal.email)) {
			errors.push('Invalid email format')
		}

		if (data.personal.phone && !isValidPhone(data.personal.phone)) {
			errors.push('Invalid phone format')
		}

		// Check for malicious content in text fields
		const textFields = ['firstName', 'lastName', 'fullName', 'dateOfBirth', 'age', 'gender', 'ssn']
		textFields.forEach(field => {
			if (data.personal[field] && containsMaliciousPatterns(data.personal[field])) {
				errors.push(`Malicious content detected in ${field}`)
			}
		})
	}

	// Validate company data
	if (data.company) {
		const companyFields = ['name', 'title', 'department', 'website']
		companyFields.forEach(field => {
			if (data.company[field] && containsMaliciousPatterns(data.company[field])) {
				errors.push(`Malicious content detected in company ${field}`)
			}
		})
	}

	// Validate address data
	if (data.address) {
		const addressFields = ['street', 'street2', 'city', 'state', 'zip', 'country']
		addressFields.forEach(field => {
			if (data.address[field] && containsMaliciousPatterns(data.address[field])) {
				errors.push(`Malicious content detected in address ${field}`)
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
export function validateMessage(message: any, expectedTypes: string[]): { isValid: boolean; error?: string } {
	if (!message || typeof message !== 'object') {
		return { isValid: false, error: 'Message must be an object' }
	}

	if (!message.type || typeof message.type !== 'string') {
		return { isValid: false, error: 'Message must have a string type' }
	}

	if (!expectedTypes.includes(message.type)) {
		return { isValid: false, error: `Unknown message type: ${message.type}` }
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
import { FieldInfo, FieldPattern } from '@/types'

export class FieldDetector {
	private patterns: Record<string, Record<string, FieldPattern>> = {
		payment: {
			cardNumber: {
				selectors: ['[name*="card"]', '[id*="card"]', '[placeholder*="card"]', '[name*="ccnumber"]'],
				patterns: [/card.*number/i, /number.*card/i, /ccnumber/i, /creditcard/i],
				autocomplete: ['cc-number'],
				validation: /^\d{13,19}$/
			},
			expiry: {
				selectors: ['[name*="exp"]', '[name*="expir"]', '[placeholder*="exp"]'],
				patterns: [/exp.*date/i, /expir/i, /valid.*thru/i, /exp.*month/i, /exp.*year/i],
				autocomplete: ['cc-exp', 'cc-exp-month', 'cc-exp-year'],
				validation: /^(0[1-9]|1[0-2])\/\d{2,4}$/
			},
			cvv: {
				selectors: ['[name*="cvv"]', '[name*="cvc"]', '[name*="security"]'],
				patterns: [/cvv|cvc|security.*code/i],
				autocomplete: ['cc-csc'],
				validation: /^\d{3,4}$/
			},
			cardholderName: {
				selectors: ['[name*="cardholder"]', '[name*="name.*card"]'],
				patterns: [/cardholder|name.*card|card.*name/i],
				autocomplete: ['cc-name']
			}
		},

		address: {
			street: {
				selectors: ['[name*="address"]', '[name*="street"]', '[name*="addr1"]'],
				patterns: [/address.*line.*1|street|addr1|address1/i],
				autocomplete: ['address-line1']
			},
			street2: {
				selectors: ['[name*="address2"]', '[name*="apt"]', '[name*="unit"]'],
				patterns: [/address.*line.*2|apt|apartment|unit|suite/i],
				autocomplete: ['address-line2']
			},
			city: {
				selectors: ['[name*="city"]', '[name*="town"]'],
				patterns: [/city|town/i],
				autocomplete: ['address-level2']
			},
			state: {
				selectors: ['[name*="state"]', '[name*="province"]', '[name*="region"]'],
				patterns: [/state|province|region/i],
				autocomplete: ['address-level1']
			},
			zip: {
				selectors: ['[name*="zip"]', '[name*="postal"]', '[name*="postcode"]'],
				patterns: [/zip|postal.*code|postcode/i],
				autocomplete: ['postal-code'],
				validation: {
					US: /^\d{5}(-\d{4})?$/,
					CA: /^[A-Z]\d[A-Z] \d[A-Z]\d$/,
					UK: /^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/
				}
			},
			country: {
				selectors: ['[name*="country"]'],
				patterns: [/country/i],
				autocomplete: ['country', 'country-name']
			}
		},

		company: {
			name: {
				selectors: ['[name*="company"]', '[name*="organization"]', '[name*="employer"]'],
				patterns: [/company|organization|employer/i],
				autocomplete: ['organization']
			},
			title: {
				selectors: ['[name*="title"]', '[name*="position"]', '[name*="job"]'],
				patterns: [/job.*title|position|role|title/i],
				autocomplete: ['organization-title']
			},
			department: {
				selectors: ['[name*="department"]', '[name*="dept"]', '[name*="division"]'],
				patterns: [/department|dept|division/i],
				autocomplete: []
			},
			website: {
				selectors: ['[name*="website"]', '[name*="url"]', '[name*="homepage"]'],
				patterns: [/website|url|homepage/i],
				autocomplete: ['url']
			}
		},

		personal: {
			firstName: {
				selectors: ['[name*="first"]', '[name*="fname"]', '[name*="given"]'],
				patterns: [/first.*name|fname|given.*name/i],
				autocomplete: ['given-name']
			},
			lastName: {
				selectors: ['[name*="last"]', '[name*="lname"]', '[name*="family"]', '[name*="surname"]'],
				patterns: [/last.*name|lname|family.*name|surname/i],
				autocomplete: ['family-name']
			},
			fullName: {
				selectors: ['[name="name"]', '[name="fullname"]', '[name="full_name"]'],
				patterns: [/^name$|full.*name|complete.*name/i],
				autocomplete: ['name']
			},
			email: {
				selectors: ['[name*="email"]', '[type="email"]', '[name*="mail"]'],
				patterns: [/email|e-mail|mail/i],
				autocomplete: ['email'],
				validation: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
			},
			phone: {
				selectors: ['[name*="phone"]', '[type="tel"]', '[name*="mobile"]'],
				patterns: [/phone|telephone|mobile|cell/i],
				autocomplete: ['tel'],
				validation: /^[\+]?[\d\s\-\(\)]+$/
			},
			dateOfBirth: {
				selectors: ['[name*="birth"]', '[name*="dob"]', '[name*="birthday"]'],
				patterns: [/birth.*date|date.*birth|dob|birthday/i],
				autocomplete: ['bday']
			},
			age: {
				selectors: ['[name*="age"]'],
				patterns: [/age/i],
				validation: /^\d{1,3}$/,
				autocomplete: []
			},
			gender: {
				selectors: ['[name*="gender"]', '[name*="sex"]'],
				patterns: [/gender|sex/i],
				autocomplete: []
			},
			ssn: {
				selectors: ['[name*="ssn"]', '[name*="social"]'],
				patterns: [/ssn|social.*security/i],
				validation: /^\d{3}-?\d{2}-?\d{4}$/,
				autocomplete: []
			},
			bio: {
				selectors: ['[name*="bio"]', '[name*="about"]', '[name*="description"]', '[name*="profile"]'],
				patterns: [/bio|biography|about.*me|about.*you|about.*yourself|description|profile.*desc|tell.*about|personal.*info/i],
				autocomplete: []
			}
		},

		account: {
			username: {
				selectors: ['[name*="user"]', '[name*="login"]'],
				patterns: [/username|user.*name|login/i],
				autocomplete: ['username']
			},
			password: {
				selectors: ['[type="password"]', '[name*="pass"]'],
				patterns: [/password|pass/i],
				autocomplete: ['current-password', 'new-password']
			},
			confirmPassword: {
				selectors: ['[name*="confirm"]', '[name*="repeat"]'],
				patterns: [/confirm.*pass|repeat.*pass|pass.*confirm/i],
				autocomplete: ['new-password']
			}
		}
	}

	detectField(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): FieldInfo | null {
		const fieldInfo: FieldInfo = {
			element,
			type: '',
			subtype: '',
			confidence: 0,
			suggestions: []
		}

		// Check each category and field type
		for (const [category, fields] of Object.entries(this.patterns)) {
			for (const [fieldType, config] of Object.entries(fields)) {
				const confidence = this.calculateConfidence(element, config)

				if (confidence > fieldInfo.confidence) {
					fieldInfo.type = category
					fieldInfo.subtype = fieldType
					fieldInfo.confidence = confidence
				}
			}
		}

		return fieldInfo.confidence > 0.5 ? fieldInfo : null
	}

	detectFields(form: HTMLFormElement): Map<HTMLElement, FieldInfo> {
		const fieldMap = new Map<HTMLElement, FieldInfo>()
		const inputs = form.querySelectorAll('input, select, textarea') as NodeListOf<
			HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
		>

		inputs.forEach(input => {
			const detectedField = this.detectField(input)
			if (detectedField) {
				fieldMap.set(input, detectedField)
			}
		})

		return fieldMap
	}

	private calculateConfidence(
		element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
		config: FieldPattern
	): number {
		let confidence = 0
		const weights = { selector: 0.4, pattern: 0.3, autocomplete: 0.2, type: 0.1 }

		// Check selectors
		if (config.selectors?.some(sel => element.matches(sel))) {
			confidence += weights.selector
		}

		// Check patterns against various attributes
		const textToCheck = [
			element.getAttribute('name') || '',
			element.id || '',
			element.getAttribute('placeholder') || '',
			element.getAttribute('aria-label') || '',
			this.getAssociatedLabelText(element)
		].join(' ').toLowerCase()

		if (config.patterns?.some(pattern => pattern.test(textToCheck))) {
			confidence += weights.pattern
		}

		// Check autocomplete attribute
		const autocomplete = element.getAttribute('autocomplete') || ''
		if (config.autocomplete?.includes(autocomplete)) {
			confidence += weights.autocomplete
		}

		// Check input type for specific matches
		if (element instanceof HTMLInputElement) {
			if (element.type === 'email' && config.autocomplete?.includes('email')) {
				confidence += weights.type
			}
			if (element.type === 'tel' && config.autocomplete?.includes('tel')) {
				confidence += weights.type
			}
			if (element.type === 'password' && config.patterns?.some(p => /password/i.test(p.source))) {
				confidence += weights.type
			}
		}

		return confidence
	}

	private getAssociatedLabelText(element: HTMLElement): string {
		// Check for label element
		const label = element.id ? document.querySelector(`label[for="${element.id}"]`) : null
		if (label) return label.textContent || ''

		// Check for closest label parent
		const parentLabel = element.closest('label')
		if (parentLabel) return parentLabel.textContent || ''

		// Check for surrounding text content
		const parent = element.closest('div, td, li, fieldset')
		if (parent) {
			const textContent = parent.textContent || ''
			return textContent.slice(0, 100) // Limit to prevent excessive text
		}

		return ''
	}

	getFieldTypeDisplayName(type: string, subtype: string): string {
		const displayNames: Record<string, string> = {
			'personal.email': 'Email',
			'personal.firstName': 'First Name',
			'personal.lastName': 'Last Name',
			'personal.fullName': 'Full Name',
			'personal.name': 'Full Name',
			'personal.phone': 'Phone',
			'personal.dateOfBirth': 'Date of Birth',
			'personal.age': 'Age',
			'personal.gender': 'Gender',
			'personal.ssn': 'SSN',
			'personal.bio': 'Bio',
			'address.street': 'Street Address',
			'address.street2': 'Address Line 2',
			'address.city': 'City',
			'address.state': 'State/Province',
			'address.zip': 'ZIP/Postal Code',
			'address.country': 'Country',
			'company.name': 'Company Name',
			'company.title': 'Job Title',
			'company.department': 'Department',
			'company.website': 'Website',
			'payment.cardNumber': 'Card Number',
			'payment.expiry': 'Expiry Date',
			'payment.cvv': 'CVV',
			'payment.cardholderName': 'Cardholder Name',
			'account.username': 'Username',
			'account.password': 'Password',
			'account.confirmPassword': 'Confirm Password'
		}

		return displayNames[`${type}.${subtype}`] || 'Field'
	}
}
import {
	type FieldEvidence,
	type FieldEvidenceSource,
	type FieldCandidate,
	type FieldControlKind,
	FieldInfo,
	FieldPattern,
	type FormControlElement,
	type FormSectionSnapshot,
	type FormSnapshot
} from '@/types'

const CONTROL_SELECTOR = 'input, select, textarea'
const SECTION_SELECTOR = 'fieldset, section, article, [role="group"], [data-form-section]'
const EVIDENCE_WEIGHT_BY_SOURCE: Record<FieldEvidenceSource, number> = {
	label: 1,
	placeholder: 0.6,
	'aria-label': 0.9,
	'aria-labelledby': 0.95,
	'aria-describedby': 0.5,
	autocomplete: 1,
	name: 0.95,
	id: 0.75,
	class: 0.35,
	'data-attribute': 0.5,
	'option-text': 0.45,
	'surrounding-text': 0.4,
	fieldset: 0.55,
	'peer-context': 0.3,
	'input-type': 0.8,
	role: 0.4
}

type SearchRoot = Document | ShadowRoot | HTMLElement

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

	collectFormSnapshots(root: SearchRoot = document): FormSnapshot[] {
		const searchRoots = this.getSearchRoots(root)
		const forms = this.collectForms(searchRoots)

		return forms.map(form => this.createFormSnapshot(form, searchRoots))
	}

	collectFormSnapshot(form: HTMLFormElement, root: SearchRoot = document): FormSnapshot {
		return this.createFormSnapshot(form, this.getSearchRoots(root))
	}

	detectField(element: FormControlElement): FieldInfo | null {
		const ownerForm = element.form || element.closest('form')
		const formId = ownerForm ? this.getFormIdentifier(ownerForm) : `detached:${this.buildDomSignature(element)}`
		const sectionElement = ownerForm
			? this.getSectionContainer(element, ownerForm)
			: (element.closest(SECTION_SELECTOR) as HTMLElement | null) || element.parentElement || element
		const sectionId = ownerForm
			? this.getSectionIdentifier(sectionElement, formId)
			: `${formId}::section:${this.buildDomSignature(sectionElement)}`
		const sectionTitle = ownerForm ? this.getSectionTitle(sectionElement, ownerForm) : undefined
		const candidate = this.createFieldCandidate(element, formId, sectionId, sectionElement, sectionTitle)

		return this.detectFieldCandidate(candidate)
	}

	detectFieldCandidate(candidate: FieldCandidate): FieldInfo | null {
		const fieldInfo: FieldInfo = {
			element: candidate.element,
			type: '',
			subtype: '',
			confidence: 0,
			suggestions: []
		}

		// Check each category and field type
		for (const [category, fields] of Object.entries(this.patterns)) {
			for (const [fieldType, config] of Object.entries(fields)) {
				const confidence = this.calculateConfidence(candidate, config)

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
		return this.detectFieldsFromSnapshot(this.collectFormSnapshot(form))
	}

	detectFieldsFromSnapshot(snapshot: FormSnapshot): Map<HTMLElement, FieldInfo> {
		const fieldMap = new Map<HTMLElement, FieldInfo>()

		snapshot.candidates.forEach(candidate => {
			const detectedField = this.detectFieldCandidate(candidate)
			if (detectedField) {
				fieldMap.set(candidate.element, detectedField)
			}
		})

		return fieldMap
	}

	private createFormSnapshot(form: HTMLFormElement, searchRoots: SearchRoot[]): FormSnapshot {
		const formId = this.getFormIdentifier(form)
		const controls = this.collectFormControls(form, searchRoots)
		const sectionBuckets = new Map<string, {
			element: HTMLElement | HTMLFormElement
			title?: string
			domSignature: string
			candidateIds: string[]
		}>()

		const candidates = controls.map(control => {
			const sectionElement = this.getSectionContainer(control, form)
			const sectionId = this.getSectionIdentifier(sectionElement, formId)
			const sectionTitle = this.getSectionTitle(sectionElement, form)
			const candidate = this.createFieldCandidate(control, formId, sectionId, sectionElement, sectionTitle)
			const existingSection = sectionBuckets.get(sectionId)

			if (existingSection) {
				existingSection.candidateIds.push(candidate.id)
			} else {
				sectionBuckets.set(sectionId, {
					element: sectionElement,
					title: sectionTitle,
					domSignature: this.buildDomSignature(sectionElement, form),
					candidateIds: [candidate.id]
				})
			}

			return candidate
		})

		this.assignPeerIds(candidates)
		this.appendPeerEvidence(candidates)

		const sections: FormSectionSnapshot[] = Array.from(sectionBuckets.entries()).map(([id, bucket]) => ({
			id,
			element: bucket.element,
			title: bucket.title,
			domSignature: bucket.domSignature,
			candidateIds: bucket.candidateIds
		}))

		return {
			id: formId,
			form,
			name: form.getAttribute('name') || undefined,
			method: (form.getAttribute('method') || 'get').toLowerCase(),
			action: form.getAttribute('action') || undefined,
			domSignature: this.buildDomSignature(form),
			candidateIds: candidates.map(candidate => candidate.id),
			candidates,
			sections
		}
	}

	private collectForms(searchRoots: SearchRoot[]): HTMLFormElement[] {
		const forms = new Set<HTMLFormElement>()

		searchRoots.forEach(root => {
			if (root instanceof HTMLFormElement) {
				forms.add(root)
			}

			root.querySelectorAll('form').forEach(form => {
				forms.add(form)
			})
		})

		return Array.from(forms)
	}

	private collectFormControls(form: HTMLFormElement, searchRoots: SearchRoot[]): FormControlElement[] {
		const controls = new Set<FormControlElement>()

		searchRoots.forEach(root => {
			root.querySelectorAll(CONTROL_SELECTOR).forEach(controlNode => {
				if (!(controlNode instanceof HTMLInputElement || controlNode instanceof HTMLTextAreaElement || controlNode instanceof HTMLSelectElement)) {
					return
				}

				if (this.belongsToForm(controlNode, form)) {
					controls.add(controlNode)
				}
			})
		})

		return Array.from(controls)
	}

	private createFieldCandidate(
		element: FormControlElement,
		formId: string,
		sectionId: string,
		sectionElement: HTMLElement | HTMLFormElement,
		sectionTitle?: string
	): FieldCandidate {
		const labelText = this.getAssociatedLabelText(element) || undefined
		const placeholder = element.getAttribute('placeholder') || undefined
		const autocomplete = element.getAttribute('autocomplete') || undefined
		const attributes = this.collectAttributes(element)
		const optionText = this.getOptionText(element)
		const nearbyText = this.getNearbyText(element, sectionElement, sectionTitle)
		const htmlType = element instanceof HTMLInputElement ? element.type : undefined
		const role = element.getAttribute('role') || undefined

		return {
			id: `${formId}::${this.buildDomSignature(element)}`,
			element,
			formId,
			sectionId,
			controlKind: this.getControlKind(element),
			htmlType,
			role,
			labelText,
			placeholder,
			autocomplete,
			attributes,
			optionText,
			nearbyText,
			evidence: this.extractFieldEvidence({
				element,
				labelText,
				placeholder,
				autocomplete,
				attributes,
				optionText,
				nearbyText,
				sectionTitle,
				htmlType,
				role
			}),
			peerIds: [],
			domSignature: this.buildDomSignature(element),
			visibility: this.getVisibilityState(element),
			isDisabled: element.matches(':disabled'),
			isReadonly: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
				? element.readOnly
				: element.hasAttribute('readonly')
		}
	}

	private assignPeerIds(candidates: FieldCandidate[]): void {
		const groupedCandidates = new Map<string, string[]>()

		candidates.forEach(candidate => {
			const key = candidate.sectionId || candidate.formId
			const existing = groupedCandidates.get(key) || []
			existing.push(candidate.id)
			groupedCandidates.set(key, existing)
		})

		candidates.forEach(candidate => {
			const key = candidate.sectionId || candidate.formId
			candidate.peerIds = (groupedCandidates.get(key) || []).filter(id => id !== candidate.id)
		})
	}

	private appendPeerEvidence(candidates: FieldCandidate[]): void {
		const candidateMap = new Map(candidates.map(candidate => [candidate.id, candidate]))

		candidates.forEach(candidate => {
			const peerTexts = (candidate.peerIds || [])
				.map(peerId => candidateMap.get(peerId))
				.flatMap(peer => {
					if (!peer) return []

					return [
						peer.labelText,
						peer.attributes.name,
						peer.attributes.id,
						...peer.optionText
					].filter((value): value is string => Boolean(value))
				})

			candidate.evidence = this.mergeEvidence(
				candidate.evidence,
				this.createEvidenceEntries('peer-context', peerTexts)
			)
		})
	}

	private calculateConfidence(
		candidate: FieldCandidate,
		config: FieldPattern
	): number {
		let confidence = 0
		const weights = { selector: 0.4, pattern: 0.3, autocomplete: 0.2, type: 0.1 }

		// Check selectors
		if (config.selectors?.some(sel => candidate.element.matches(sel))) {
			confidence += weights.selector
		}

		const textToCheck = this.buildEvidenceSearchText(candidate.evidence)

		if (config.patterns?.some(pattern => pattern.test(textToCheck))) {
			confidence += weights.pattern
		}

		// Check autocomplete attribute
		const autocomplete = candidate.autocomplete || ''
		if (config.autocomplete?.includes(autocomplete)) {
			confidence += weights.autocomplete
		}

		// Check input type for specific matches
		if (candidate.element instanceof HTMLInputElement) {
			if (candidate.element.type === 'email' && config.autocomplete?.includes('email')) {
				confidence += weights.type
			}
			if (candidate.element.type === 'tel' && config.autocomplete?.includes('tel')) {
				confidence += weights.type
			}
			if (candidate.element.type === 'password' && config.patterns?.some(p => /password/i.test(p.source))) {
				confidence += weights.type
			}
		}

		return confidence
	}

	private extractFieldEvidence(input: {
		element: FormControlElement
		labelText?: string
		placeholder?: string
		autocomplete?: string
		attributes: Record<string, string>
		optionText: string[]
		nearbyText: string[]
		sectionTitle?: string
		htmlType?: string
		role?: string
	}): FieldEvidence[] {
		const evidence = this.mergeEvidence(
			this.createEvidenceEntries('label', [input.labelText]),
			this.createEvidenceEntries('placeholder', [input.placeholder]),
			this.createEvidenceEntries('aria-label', [input.attributes['aria-label']]),
			this.createEvidenceEntries('aria-labelledby', this.getReferencedText(input.element, 'aria-labelledby')),
			this.createEvidenceEntries('aria-describedby', this.getReferencedText(input.element, 'aria-describedby')),
			this.createEvidenceEntries('autocomplete', [input.autocomplete]),
			this.createEvidenceEntries('name', [input.attributes.name]),
			this.createEvidenceEntries('id', [input.attributes.id || input.element.id]),
			this.createEvidenceEntries('class', [input.attributes.class]),
			this.createEvidenceEntries(
				'data-attribute',
				Object.entries(input.attributes)
					.filter(([name]) => name.startsWith('data-'))
					.map(([name, value]) => `${name} ${value}`)
			),
			this.createEvidenceEntries('option-text', input.optionText),
			this.createEvidenceEntries('surrounding-text', input.nearbyText),
			this.createEvidenceEntries('fieldset', [input.sectionTitle]),
			this.createEvidenceEntries('input-type', [input.htmlType]),
			this.createEvidenceEntries('role', [input.role])
		)

		return evidence
	}

	private createEvidenceEntries(source: FieldEvidenceSource, values: Array<string | undefined>): FieldEvidence[] {
		const entries = new Map<string, FieldEvidence>()

		values.forEach(value => {
			if (!value) return

			const raw = value.trim()
			if (!raw) return

			const normalized = this.normalizeEvidenceText(raw)
			const key = `${source}:${normalized || raw.toLowerCase()}`
			if (!entries.has(key)) {
				entries.set(key, {
					source,
					raw,
					normalized,
					tokens: this.tokenizeEvidenceText(raw),
					weight: EVIDENCE_WEIGHT_BY_SOURCE[source]
				})
			}
		})

		return Array.from(entries.values())
	}

	private mergeEvidence(...groups: FieldEvidence[][]): FieldEvidence[] {
		const entries = new Map<string, FieldEvidence>()

		groups.flat().forEach(entry => {
			const key = `${entry.source}:${entry.normalized || entry.raw.toLowerCase()}`
			if (!entries.has(key)) {
				entries.set(key, entry)
			}
		})

		return Array.from(entries.values())
	}

	private buildEvidenceSearchText(evidence: FieldEvidence[]): string {
		return evidence
			.flatMap(entry => [entry.raw, entry.normalized || '', ...(entry.tokens || [])])
			.filter(Boolean)
			.join(' ')
			.toLowerCase()
	}

	private normalizeEvidenceText(value: string): string {
		return value
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/([a-z\d])([A-Z])/g, '$1 $2')
			.replace(/[_./:-]+/g, ' ')
			.replace(/[^a-zA-Z\d\s]/g, ' ')
			.toLowerCase()
			.replace(/\s+/g, ' ')
			.trim()
	}

	private tokenizeEvidenceText(value: string): string[] {
		const normalized = this.normalizeEvidenceText(value)
		return normalized ? normalized.split(' ').filter(Boolean) : []
	}

	private getSearchRoots(root: SearchRoot): SearchRoot[] {
		const roots: SearchRoot[] = []
		const queue: SearchRoot[] = [root]
		const seen = new Set<Node>()

		while (queue.length > 0) {
			const currentRoot = queue.shift()
			if (!currentRoot || seen.has(currentRoot)) continue

			seen.add(currentRoot)
			roots.push(currentRoot)

			const elements = currentRoot.querySelectorAll('*')
			elements.forEach(element => {
				if (element instanceof HTMLElement && element.shadowRoot && !seen.has(element.shadowRoot)) {
					queue.push(element.shadowRoot)
				}
			})
		}

		return roots
	}

	private getFormIdentifier(form: HTMLFormElement): string {
		if (form.id) {
			return `form:${form.id}`
		}

		return `form:${this.buildDomSignature(form)}`
	}

	private belongsToForm(control: FormControlElement, form: HTMLFormElement): boolean {
		if (control.form === form) return true
		if (form.id && control.getAttribute('form') === form.id) return true

		return this.isNodeWithinFormTree(control, form)
	}

	private isNodeWithinFormTree(node: Node, form: HTMLFormElement): boolean {
		let current: Node | null = node

		while (current) {
			if (current === form) {
				return true
			}

			current = this.getComposedParent(current)
		}

		return false
	}

	private getComposedParent(node: Node): Node | null {
		if (node.parentNode) {
			return node.parentNode
		}

		const root = node.getRootNode()
		if (root instanceof ShadowRoot) {
			return root.host
		}

		return null
	}

	private getSectionContainer(element: FormControlElement, form: HTMLFormElement): HTMLElement | HTMLFormElement {
		let current: Node | null = element

		while (current) {
			if (current instanceof HTMLElement && current !== form && current.matches(SECTION_SELECTOR)) {
				return current
			}

			if (current === form) {
				return form
			}

			current = this.getComposedParent(current)
		}

		return form
	}

	private getSectionIdentifier(section: HTMLElement | HTMLFormElement, formId: string): string {
		if (section instanceof HTMLFormElement) {
			return `${formId}::section:root`
		}

		return `${formId}::section:${this.buildDomSignature(section)}`
	}

	private getSectionTitle(section: HTMLElement | HTMLFormElement, form: HTMLFormElement): string | undefined {
		if (section === form) {
			return form.getAttribute('aria-label') || form.getAttribute('name') || undefined
		}

		if (section instanceof HTMLFieldSetElement) {
			const legend = section.querySelector('legend')
			if (legend?.textContent?.trim()) return legend.textContent.trim()
		}

		const heading = section.querySelector('h1, h2, h3, h4, h5, h6')
		if (heading?.textContent?.trim()) return heading.textContent.trim()

		return section.getAttribute('aria-label') || undefined
	}

	private getControlKind(element: FormControlElement): FieldControlKind {
		if (element instanceof HTMLTextAreaElement) return 'textarea'
		if (element instanceof HTMLSelectElement) return 'select'
		if (!(element instanceof HTMLInputElement)) return 'unknown'

		switch (element.type) {
			case 'checkbox':
				return 'checkbox'
			case 'radio':
				return 'radio'
			case 'date':
				return 'date'
			case 'datetime-local':
				return 'datetime'
			case 'number':
				return 'number'
			case 'email':
				return 'email'
			case 'tel':
				return 'tel'
			case 'password':
				return 'password'
			case 'hidden':
				return 'hidden'
			case 'text':
				return 'text'
			default:
				return element.getAttribute('role') ? 'custom' : 'text'
		}
	}

	private collectAttributes(element: FormControlElement): Record<string, string> {
		return Array.from(element.attributes).reduce<Record<string, string>>((attributes, attribute) => {
			attributes[attribute.name] = attribute.value
			return attributes
		}, {})
	}

	private getOptionText(element: FormControlElement): string[] {
		if (!(element instanceof HTMLSelectElement)) {
			return []
		}

		return Array.from(element.options)
			.map(option => option.textContent?.trim() || '')
			.filter(Boolean)
	}

	private getNearbyText(
		element: FormControlElement,
		section: HTMLElement | HTMLFormElement,
		sectionTitle?: string
	): string[] {
		const nearby = new Set<string>()
		const labelText = this.getAssociatedLabelText(element)
		const describedBy = this.getReferencedText(element, 'aria-describedby')

		if (labelText) nearby.add(labelText)
		if (element.getAttribute('placeholder')) nearby.add(element.getAttribute('placeholder') || '')
		describedBy.forEach(text => nearby.add(text))

		if (sectionTitle) {
			nearby.add(sectionTitle)
		}

		if (section instanceof HTMLElement) {
			const sectionText = section.textContent?.replace(/\s+/g, ' ').trim()
			if (sectionText) {
				nearby.add(sectionText.slice(0, 120))
			}
		}

		return Array.from(nearby).filter(Boolean)
	}

	private getAssociatedLabelText(element: HTMLElement): string {
		const associatedTexts = new Set<string>()

		if (element.id) {
			element.ownerDocument.querySelectorAll(`label[for="${element.id}"]`).forEach(label => {
				if (label.textContent?.trim()) {
					associatedTexts.add(label.textContent.trim())
				}
			})
		}

		// Check for closest label parent
		const parentLabel = element.closest('label')
		if (parentLabel?.textContent?.trim()) {
			associatedTexts.add(parentLabel.textContent.trim())
		}

		this.getReferencedText(element, 'aria-labelledby').forEach(text => associatedTexts.add(text))

		if (associatedTexts.size > 0) {
			return Array.from(associatedTexts).join(' ')
		}

		// Check for surrounding text content
		const parent = element.closest('div, td, li, fieldset, section, article')
		if (parent) {
			const textContent = parent.textContent || ''
			return textContent.slice(0, 100) // Limit to prevent excessive text
		}

		return ''
	}

	private getReferencedText(element: HTMLElement, attributeName: 'aria-labelledby' | 'aria-describedby'): string[] {
		const attributeValue = element.getAttribute(attributeName)
		if (!attributeValue) return []

		return attributeValue
			.split(/\s+/)
			.map(referenceId => element.ownerDocument.getElementById(referenceId)?.textContent?.trim() || '')
			.filter(Boolean)
	}

	private getVisibilityState(element: FormControlElement): 'visible' | 'hidden' | 'offscreen' {
		if (element instanceof HTMLInputElement && element.type === 'hidden') {
			return 'hidden'
		}

		const computedStyle = window.getComputedStyle(element)
		if (
			computedStyle.display === 'none' ||
			computedStyle.visibility === 'hidden' ||
			computedStyle.opacity === '0' ||
			element.getAttribute('aria-hidden') === 'true'
		) {
			return 'hidden'
		}

		const rect = element.getBoundingClientRect()
		if (rect.width === 0 || rect.height === 0) {
			return 'hidden'
		}

		if (
			rect.bottom < 0 ||
			rect.right < 0 ||
			rect.top > window.innerHeight ||
			rect.left > window.innerWidth
		) {
			return 'offscreen'
		}

		return 'visible'
	}

	private buildDomSignature(element: Element, stopAt?: Element): string {
		const segments: string[] = []
		let current: Node | null = element

		while (current) {
			if (current instanceof Element) {
				segments.unshift(this.getSignatureSegment(current))
				if (stopAt && current === stopAt) {
					break
				}
			}

			current = this.getComposedParent(current)
		}

		return segments.join(' > ')
	}

	private getSignatureSegment(element: Element): string {
		const tagName = element.tagName.toLowerCase()
		const idSegment = element.id ? `#${element.id}` : ''
		const nameSegment = element.getAttribute('name') ? `[name="${element.getAttribute('name')}"]` : ''
		const roleSegment = element.getAttribute('role') ? `[role="${element.getAttribute('role')}"]` : ''
		const typeSegment = element instanceof HTMLInputElement ? `[type="${element.type}"]` : ''

		if (!element.parentElement) {
			return `${tagName}${idSegment}${nameSegment}${typeSegment}${roleSegment}`
		}

		const siblingIndex = Array.from(element.parentElement.children)
			.filter(sibling => sibling.tagName === element.tagName)
			.indexOf(element) + 1

		return `${tagName}${idSegment}${nameSegment}${typeSegment}${roleSegment}:nth-of-type(${siblingIndex})`
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
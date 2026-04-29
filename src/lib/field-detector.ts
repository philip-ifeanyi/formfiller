import {
	type CanonicalFieldKey,
	type FieldEvidence,
	type FieldEvidenceSource,
	type FieldCandidate,
	type FieldControlKind,
	type FieldInference,
	type FieldInferenceAlternative,
	type FieldInferenceStatus,
	type FieldRegistryEntry,
	FieldInfo,
	FieldPattern,
	type FormControlElement,
	type FormSectionSnapshot,
	type FormSnapshot
} from '@/types'

const ARIA_CONTROL_SELECTOR = [
	'[role="combobox"]',
	'[role="listbox"]',
	'[role="switch"]',
	'[role="radiogroup"]',
	'[role="spinbutton"]'
].join(', ')
const CONTROL_SELECTOR = `input, select, textarea, ${ARIA_CONTROL_SELECTOR}`
const SECTION_SELECTOR = 'fieldset, section, article, [role="group"], [data-form-section]'
const FIELD_INFERENCE_LIMITS = {
	highConfidence: 0.72,
	review: 0.45,
	ambiguityDelta: 0.12,
	alternative: 0.2
} as const
const CLASSIFIER_WEIGHTS = {
	selector: 0.28,
	pattern: 0.3,
	patternCoverage: 0.08,
	autocomplete: 0.2,
	controlKindBonus: 0.08,
	positiveTokenBonus: 0.08,
	negativeTokenPenalty: 0.12,
	controlKindPenalty: 0.18
} as const
const MAX_INFERENCE_ALTERNATIVES = 3
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
const LEGACY_TO_CANONICAL_FIELD_KEY: Record<string, CanonicalFieldKey> = {
	'personal.firstName': 'person.firstName',
	'personal.lastName': 'person.lastName',
	'personal.fullName': 'person.fullName',
	'personal.email': 'contact.email.primary',
	'personal.phone': 'contact.phone.primary',
	'personal.dateOfBirth': 'person.dateOfBirth',
	'personal.age': 'person.age',
	'personal.gender': 'person.gender',
	'personal.ssn': 'identity.ssn',
	'personal.bio': 'person.bio',
	'address.street': 'address.line1',
	'address.street2': 'address.line2',
	'address.city': 'address.city',
	'address.state': 'address.stateOrProvince',
	'address.zip': 'address.postalCode',
	'address.country': 'address.country',
	'company.name': 'company.name',
	'company.title': 'company.title',
	'company.department': 'company.department',
	'company.website': 'company.website',
	'payment.cardNumber': 'payment.cardNumber',
	'payment.expiry': 'payment.expiry',
	'payment.cvv': 'payment.cvv',
	'payment.cardholderName': 'payment.cardholderName',
	'account.username': 'account.username',
	'account.password': 'account.password',
	'account.confirmPassword': 'account.confirmPassword'
}
const SUPPORTED_CONTROL_KINDS_BY_LEGACY: Partial<Record<string, FieldControlKind[]>> = {
	'personal.firstName': ['text'],
	'personal.lastName': ['text'],
	'personal.fullName': ['text'],
	'personal.email': ['email', 'text'],
	'personal.phone': ['tel', 'text'],
	'personal.dateOfBirth': ['date', 'datetime', 'text'],
	'personal.age': ['number', 'text'],
	'personal.gender': ['select', 'radio', 'text'],
	'personal.ssn': ['text', 'number', 'password'],
	'personal.bio': ['textarea', 'text'],
	'address.street': ['text', 'textarea'],
	'address.street2': ['text', 'textarea'],
	'address.city': ['text'],
	'address.state': ['text', 'select'],
	'address.zip': ['text', 'number'],
	'address.country': ['select', 'text'],
	'company.name': ['text'],
	'company.title': ['text'],
	'company.department': ['text', 'select', 'checkbox'],
	'company.website': ['text'],
	'payment.cardNumber': ['text', 'number'],
	'payment.expiry': ['text', 'date', 'datetime'],
	'payment.cvv': ['text', 'number', 'password'],
	'payment.cardholderName': ['text'],
	'account.username': ['text'],
	'account.password': ['password'],
	'account.confirmPassword': ['password']
}
const POSITIVE_TOKENS_BY_LEGACY: Partial<Record<string, string[]>> = {
	'personal.firstName': ['first name', 'given name'],
	'personal.lastName': ['last name', 'family name', 'surname'],
	'personal.fullName': ['full name', 'complete name'],
	'personal.email': ['email', 'e mail'],
	'personal.phone': ['phone', 'telephone', 'mobile'],
	'personal.dateOfBirth': ['date of birth', 'birth date', 'dob'],
	'personal.gender': ['gender', 'sex'],
	'personal.ssn': ['ssn', 'social security'],
	'address.street2': ['address line 2', 'line 2', 'apt', 'suite', 'unit', 'apartment'],
	'address.zip': ['zip', 'postal code', 'postcode'],
	'payment.cardNumber': ['card number', 'credit card', 'cc number'],
	'payment.expiry': ['expiry', 'expiration', 'valid thru'],
	'payment.cvv': ['cvv', 'cvc', 'security code'],
	'payment.cardholderName': ['cardholder', 'name on card'],
	'account.username': ['username', 'login'],
	'account.password': ['password'],
	'account.confirmPassword': ['confirm password', 'repeat password']
}
const NEGATIVE_TOKENS_BY_LEGACY: Partial<Record<string, string[]>> = {
	'personal.firstName': ['last name', 'surname', 'family name'],
	'personal.lastName': ['first name', 'given name'],
	'personal.fullName': ['first name', 'last name', 'given name', 'family name'],
	'address.street': ['address line 2', 'line 2', 'apt', 'suite', 'unit', 'apartment'],
	'payment.expiry': ['cvv', 'security code'],
	'payment.cvv': ['expiry', 'expiration', 'valid thru'],
	'account.password': ['confirm', 'repeat'],
	'account.confirmPassword': ['current password']
}

type SearchRoot = Document | ShadowRoot | HTMLElement
type HeuristicClassifierTarget = {
	entry: FieldRegistryEntry
	pattern: FieldPattern
}
type HeuristicEvaluation = FieldInferenceAlternative & {
	legacyType?: string
	legacySubtype?: string
}

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

	private classifierTargets: HeuristicClassifierTarget[] = this.buildClassifierTargets()

	collectFormSnapshots(root: SearchRoot = document): FormSnapshot[] {
		const searchRoots = this.getSearchRoots(root)
		const forms = this.collectForms(searchRoots)

		return forms.map(form => this.createFormSnapshot(form, searchRoots))
	}

	collectFormSnapshot(form: HTMLFormElement, root: SearchRoot = document): FormSnapshot {
		return this.createFormSnapshot(form, this.getSearchRoots(root))
	}

	detectField(element: FormControlElement): FieldInfo | null {
		return this.toFieldInfoFromElement(element)
	}

	inferField(element: FormControlElement): FieldInference {
		const ownerForm = this.getOwnerForm(element)
		const formId = ownerForm ? this.getFormIdentifier(ownerForm) : `detached:${this.buildDomSignature(element)}`
		const sectionElement = ownerForm
			? this.getSectionContainer(element, ownerForm)
			: (element.closest(SECTION_SELECTOR) as HTMLElement | null) || element.parentElement || element
		const sectionId = ownerForm
			? this.getSectionIdentifier(sectionElement, formId)
			: `${formId}::section:${this.buildDomSignature(sectionElement)}`
		const sectionTitle = ownerForm ? this.getSectionTitle(sectionElement, ownerForm) : undefined
		const candidate = this.createFieldCandidate(element, formId, sectionId, sectionElement, sectionTitle)

		return this.inferFieldCandidate(candidate)
	}

	detectFieldCandidate(candidate: FieldCandidate): FieldInfo | null {
		return this.toFieldInfo(candidate, this.inferFieldCandidate(candidate))
	}

	inferFieldCandidate(candidate: FieldCandidate): FieldInference {
		const structuralSkipReasons = this.getStructuralSkipReasons(candidate)
		const evaluations = this.classifierTargets
			.map(target => this.evaluateCandidateAgainstTarget(candidate, target))
			.filter(evaluation => evaluation.confidence > 0)
			.sort((left, right) => right.confidence - left.confidence)

		const bestMatch = evaluations[0]
		const alternatives = evaluations
			.slice(1)
			.filter(alternative => alternative.confidence >= FIELD_INFERENCE_LIMITS.alternative)
			.slice(0, MAX_INFERENCE_ALTERNATIVES)
			.map(alternative => ({
				fieldKey: alternative.fieldKey,
				confidence: alternative.confidence,
				reasons: alternative.reasons
			}))

		if (!bestMatch) {
			return {
				fieldKey: null,
				confidence: 0,
				status: 'skip',
				reasons: this.uniqueReasons([
					...structuralSkipReasons,
					candidate.evidence.length === 0
						? 'skipped because no structured field evidence was extracted'
						: 'skipped because no heuristic rule matched the extracted evidence'
				]),
				alternatives: []
			}
		}

		const runnerUp = evaluations[1]
		const ambiguous = Boolean(
			runnerUp && bestMatch.confidence - runnerUp.confidence < FIELD_INFERENCE_LIMITS.ambiguityDelta
		)
		let status: FieldInferenceStatus
		const reasons = [...bestMatch.reasons]

		if (structuralSkipReasons.length > 0) {
			status = 'skip'
			reasons.push(...structuralSkipReasons)
		} else if (bestMatch.confidence >= FIELD_INFERENCE_LIMITS.highConfidence && !ambiguous) {
			status = 'high-confidence'
			reasons.push(`classified as high-confidence at ${bestMatch.confidence.toFixed(2)}`)
		} else if (bestMatch.confidence >= FIELD_INFERENCE_LIMITS.review) {
			status = 'review'
			reasons.push(`classified for review at ${bestMatch.confidence.toFixed(2)}`)
		} else {
			status = 'skip'
			reasons.push(`skipped because best heuristic score ${bestMatch.confidence.toFixed(2)} is below the review threshold`)
		}

		if (ambiguous && runnerUp) {
			reasons.push(
				`ambiguous with ${runnerUp.fieldKey} at ${runnerUp.confidence.toFixed(2)}`
			)
			if (status === 'high-confidence') {
				status = 'review'
			}
		}

		const keepFieldKey = bestMatch.confidence >= FIELD_INFERENCE_LIMITS.review

		return {
			fieldKey: keepFieldKey ? bestMatch.fieldKey : null,
			legacyType: keepFieldKey ? bestMatch.legacyType : undefined,
			legacySubtype: keepFieldKey ? bestMatch.legacySubtype : undefined,
			confidence: bestMatch.confidence,
			status,
			reasons: this.uniqueReasons(reasons),
			alternatives
		}
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

	private toFieldInfoFromElement(element: FormControlElement): FieldInfo | null {
		return this.toFieldInfo(element, this.inferField(element))
	}

	private toFieldInfo(candidateOrElement: FieldCandidate | FormControlElement, inference: FieldInference): FieldInfo | null {
		if (inference.status !== 'high-confidence' || !inference.legacyType || !inference.legacySubtype) {
			return null
		}

		const element = 'element' in candidateOrElement ? candidateOrElement.element : candidateOrElement

		return {
			element,
			type: inference.legacyType,
			subtype: inference.legacySubtype,
			confidence: inference.confidence,
			suggestions: inference.alternatives.map(alternative => alternative.fieldKey)
		}
	}

	private buildClassifierTargets(): HeuristicClassifierTarget[] {
		return Object.entries(this.patterns).flatMap(([legacyType, fields]) => {
			return Object.entries(fields).map(([legacySubtype, pattern]) => {
				const legacyKey = `${legacyType}.${legacySubtype}`
				const derivedTokens = this.tokenizeEvidenceText(legacySubtype)

				return {
					entry: {
						key: LEGACY_TO_CANONICAL_FIELD_KEY[legacyKey] || `${legacyType}.${legacySubtype}` as CanonicalFieldKey,
						legacyType,
						legacySubtype,
						positiveTokens: this.uniqueReasons([
							...(POSITIVE_TOKENS_BY_LEGACY[legacyKey] || []),
							...derivedTokens
						]),
						negativeTokens: NEGATIVE_TOKENS_BY_LEGACY[legacyKey] || [],
						supportedControlKinds: SUPPORTED_CONTROL_KINDS_BY_LEGACY[legacyKey],
						validation: pattern.validation
					},
					pattern
				}
			})
		})
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
				if (!this.isSupportedControlElement(controlNode)) {
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

	private evaluateCandidateAgainstTarget(
		candidate: FieldCandidate,
		target: HeuristicClassifierTarget
	): HeuristicEvaluation {
		let confidence = 0
		const reasons: string[] = []
		const evidenceText = this.buildEvidenceSearchText(candidate.evidence)
		const directEvidenceText = this.buildTokenEvidenceText(candidate.evidence)
		const selectorMatches = target.pattern.selectors.filter(selector => this.matchesHeuristicSelector(candidate, selector))

		if (selectorMatches.length > 0) {
			confidence += CLASSIFIER_WEIGHTS.selector
			reasons.push(`matched selector ${selectorMatches[0]}`)
		}

		const matchedEvidence = this.getMatchedEvidence(candidate.evidence, target.pattern.patterns)
		if (matchedEvidence.length > 0) {
			const strongestEvidenceWeight = Math.max(...matchedEvidence.map(match => match.weight || 0.4))
			const uniqueSources = new Set(matchedEvidence.map(match => match.source))

			confidence += strongestEvidenceWeight * CLASSIFIER_WEIGHTS.pattern
			confidence += Math.min(
				CLASSIFIER_WEIGHTS.patternCoverage,
				(uniqueSources.size - 1) * 0.04
			)
			reasons.push(`matched ${Array.from(uniqueSources).join(', ')} evidence`)
		}

		if (candidate.autocomplete && target.pattern.autocomplete.includes(candidate.autocomplete)) {
			confidence += CLASSIFIER_WEIGHTS.autocomplete
			reasons.push(`matched autocomplete ${candidate.autocomplete}`)
		}

		const positiveTokens = (target.entry.positiveTokens || []).filter(token => {
			return evidenceText.includes(this.normalizeEvidenceText(token))
		})
		if (positiveTokens.length > 0) {
			confidence += Math.min(
				CLASSIFIER_WEIGHTS.positiveTokenBonus,
				positiveTokens.length * 0.03
			)
			reasons.push(`matched tokens ${positiveTokens.slice(0, 3).join(', ')}`)
		}

		const negativeTokens = (target.entry.negativeTokens || []).filter(token => {
			return directEvidenceText.includes(this.normalizeEvidenceText(token))
		})
		if (negativeTokens.length > 0) {
			confidence -= Math.min(
				CLASSIFIER_WEIGHTS.negativeTokenPenalty,
				negativeTokens.length * 0.06
			)
			reasons.push(`penalized by conflicting tokens ${negativeTokens.slice(0, 3).join(', ')}`)
		}

		const supportedControlKinds = target.entry.supportedControlKinds || []
		const compatibleControlKinds = this.getCompatibleControlKinds(candidate.controlKind)
		if (supportedControlKinds.length > 0) {
			if (supportedControlKinds.some(controlKind => compatibleControlKinds.includes(controlKind))) {
				confidence += CLASSIFIER_WEIGHTS.controlKindBonus
				reasons.push(`control kind ${candidate.controlKind} is supported`)
			} else {
				confidence -= CLASSIFIER_WEIGHTS.controlKindPenalty
				reasons.push(`control kind ${candidate.controlKind} is atypical for ${target.entry.key}`)
			}
		}

		return {
			fieldKey: target.entry.key,
			legacyType: target.entry.legacyType,
			legacySubtype: target.entry.legacySubtype,
			confidence: Math.max(0, Math.min(1, confidence)),
			reasons: this.uniqueReasons(reasons)
		}
	}

	private matchesHeuristicSelector(candidate: FieldCandidate, selector: string): boolean {
		if (candidate.element.matches(selector)) {
			return true
		}

		const attributeSelectorMatch = selector.match(/^\[([a-z-]+)(\*=|=)"([^"]+)"\]$/i)
		if (!attributeSelectorMatch) {
			return false
		}

		const [, attributeName, operator, expectedValue] = attributeSelectorMatch
		const attributeValue = candidate.attributes[attributeName] || candidate.element.getAttribute(attributeName) || ''
		if (!attributeValue) {
			return false
		}

		const actualValue = attributeValue.toLowerCase()
		const normalizedExpectedValue = expectedValue.toLowerCase()

		if (operator === '=') {
			return actualValue === normalizedExpectedValue
		}

		return actualValue.includes(normalizedExpectedValue)
	}

	private getMatchedEvidence(evidence: FieldEvidence[], patterns: RegExp[]): FieldEvidence[] {
		const matches = new Map<string, FieldEvidence>()

		evidence.forEach(entry => {
			const entryText = this.buildEvidenceSearchText([entry])
			if (!entryText) return

			if (patterns.some(pattern => pattern.test(entryText))) {
				const key = `${entry.source}:${entry.normalized || entry.raw.toLowerCase()}`
				matches.set(key, entry)
			}
		})

		return Array.from(matches.values())
	}

	private getStructuralSkipReasons(candidate: FieldCandidate): string[] {
		const reasons: string[] = []

		if (candidate.controlKind === 'hidden' || candidate.visibility === 'hidden') {
			reasons.push('skipped because the field is hidden')
		}

		if (candidate.isDisabled) {
			reasons.push('skipped because the field is disabled')
		}

		if (candidate.isReadonly) {
			reasons.push('skipped because the field is read-only')
		}

		return reasons
	}

	private uniqueReasons(reasons: string[]): string[] {
		return Array.from(new Set(reasons.filter(Boolean)))
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

	private buildTokenEvidenceText(evidence: FieldEvidence[]): string {
		const directEvidence = evidence.filter(entry => {
			return !['surrounding-text', 'peer-context', 'fieldset'].includes(entry.source)
		})

		return this.buildEvidenceSearchText(directEvidence)
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

	private isSupportedControlElement(node: Element): node is FormControlElement {
		if (node instanceof HTMLElement && this.isOwnedPopupControl(node)) {
			return false
		}

		if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
			return true
		}

		return node instanceof HTMLElement && this.getAriaControlKind(node) !== null
	}

	private isOwnedPopupControl(node: HTMLElement): boolean {
		if (!node.id) {
			return false
		}

		return Array.from(node.ownerDocument.querySelectorAll<HTMLElement>('[role="combobox"]')).some(control => {
			const controlledIds = [control.getAttribute('aria-controls'), control.getAttribute('aria-owns')]
				.filter((value): value is string => Boolean(value))
				.flatMap(value => value.split(/\s+/).filter(Boolean))

			return controlledIds.includes(node.id)
		})
	}

	private getCompatibleControlKinds(controlKind: FieldControlKind): FieldControlKind[] {
		switch (controlKind) {
			case 'combobox':
				return ['combobox', 'select', 'text']

			case 'listbox':
				return ['listbox', 'select']

			case 'switch':
				return ['switch', 'checkbox']

			case 'radiogroup':
				return ['radiogroup', 'radio']

			case 'spinbutton':
				return ['spinbutton', 'number', 'text']

			default:
				return [controlKind]
		}
	}

	private getFormIdentifier(form: HTMLFormElement): string {
		if (form.id) {
			return `form:${form.id}`
		}

		return `form:${this.buildDomSignature(form)}`
	}

	private getOwnerForm(element: FormControlElement): HTMLFormElement | null {
		if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
			return element.form || element.closest('form')
		}

		return element.closest('form')
	}

	private belongsToForm(control: FormControlElement, form: HTMLFormElement): boolean {
		if (this.getOwnerForm(control) === form) return true
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
		const ariaControlKind = this.getAriaControlKind(element)
		if (ariaControlKind) return ariaControlKind

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

	private getAriaControlKind(element: Element): FieldControlKind | null {
		switch (element.getAttribute('role')) {
			case 'combobox':
				return 'combobox'

			case 'listbox':
				return 'listbox'

			case 'switch':
				return 'switch'

			case 'radiogroup':
				return 'radiogroup'

			case 'spinbutton':
				return 'spinbutton'

			default:
				return null
		}
	}

	private collectAttributes(element: FormControlElement): Record<string, string> {
		return Array.from(element.attributes).reduce<Record<string, string>>((attributes, attribute) => {
			attributes[attribute.name] = attribute.value
			return attributes
		}, {})
	}

	private getOptionText(element: FormControlElement): string[] {
		if (element instanceof HTMLSelectElement) {
			return Array.from(element.options)
				.map(option => option.textContent?.trim() || '')
				.filter(Boolean)
		}

		if (!(element instanceof HTMLElement)) {
			return []
		}

		const options = [
			...Array.from(element.querySelectorAll<HTMLElement>('[role="option"], [role="radio"]')),
			...this.getControlledPopupOptions(element)
		]

		const uniqueOptions = new Set<string>()
		options.forEach(option => {
			const text = option.textContent?.trim() || option.getAttribute('aria-label')?.trim() || ''
			if (text) {
				uniqueOptions.add(text)
			}
		})

		return Array.from(uniqueOptions)
	}

	private getControlledPopupOptions(element: HTMLElement): HTMLElement[] {
		const popupIds = [element.getAttribute('aria-controls'), element.getAttribute('aria-owns')]
			.filter((value): value is string => Boolean(value))
			.flatMap(value => value.split(/\s+/).filter(Boolean))

		const options: HTMLElement[] = []
		popupIds.forEach(id => {
			const popup = element.ownerDocument.getElementById(id)
			if (!popup) {
				return
			}

			popup.querySelectorAll<HTMLElement>('[role="option"], [role="radio"]').forEach(option => {
				options.push(option)
			})
		})

		return options
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
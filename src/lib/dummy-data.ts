import { Profile, ProfileData } from '@/types'

export class DummyDataProvider {
	private profiles: Record<string, ProfileData> = {
		developer: {
			personal: {
				firstName: 'Alex',
				lastName: 'Developer',
				fullName: 'Alex Developer',
				email: 'alex.dev@testmail.com',
				phone: '+1-555-0123',
				dateOfBirth: '1990-05-15',
				age: '33',
				gender: 'prefer-not-to-say',
				ssn: '123-45-6789'
			},
			address: {
				street: '456 Code Street',
				street2: 'Apt 404',
				city: 'San Francisco',
				state: 'CA',
				zip: '94105',
				country: 'United States'
			},
			company: {
				name: 'Tech Innovations Inc',
				title: 'Senior Developer',
				department: 'engineering',
				website: 'https://tech-innovations.com'
			},
			payment: {
				cardNumber: '4242424242424242', // Safe Stripe test card
				expiry: '12/28',
				cvv: '123',
				cardholderName: 'Alex Developer'
			},
			account: {
				username: 'alexdev',
				password: 'TestPassword123!'
			},
			custom: {
				bio: 'Passionate software developer with 8+ years of experience in full-stack development. Love creating clean, efficient code and learning new technologies.'
			}
		},

		international: {
			personal: {
				firstName: 'Müller',
				lastName: 'Schmidt',
				fullName: 'Müller Schmidt',
				email: 'mueller.schmidt@beispiel.de',
				phone: '+49-30-12345678',
				dateOfBirth: '1985-11-22',
				age: '38',
				gender: 'male',
				ssn: ''
			},
			address: {
				street: 'Münchener Straße 123',
				street2: '',
				city: 'Berlin',
				state: 'Berlin',
				zip: '10825',
				country: 'Germany'
			},
			company: {
				name: 'Deutsche Tech GmbH',
				title: 'Software Engineer',
				department: 'engineering',
				website: 'https://deutschetech.de'
			},
			payment: {
				cardNumber: '4000000000000002', // Safe test card
				expiry: '06/27',
				cvv: '456',
				cardholderName: 'Müller Schmidt'
			},
			account: {
				username: 'mueller.schmidt',
				password: 'SicheresPasswort456!'
			},
			custom: {
				bio: 'Erfahrener Softwareentwickler aus Berlin. Ich arbeite gerne an innovativen Projekten und bin spezialisiert auf moderne Webtechnologien.'
			}
		},

		edgeCases: {
			personal: {
				firstName: 'Jean-Pierre',
				lastName: "O'Connor-Smith",
				fullName: "Jean-Pierre O'Connor-Smith",
				email: 'jean.pierre+test@very-long-domain-name.co.uk',
				phone: '+1 (555) 123-4567 ext. 890',
				dateOfBirth: '1975-02-29', // Leap year
				age: '48',
				gender: 'non-binary',
				ssn: '987-65-4321'
			},
			address: {
				street: '1234567890 Very Long Street Name That Tests Field Length Limits',
				street2: 'Unit #B-123-XYZ',
				city: 'San José',
				state: 'CA',
				zip: '95110-1234',
				country: 'United States'
			},
			company: {
				name: 'Extremely Long Company Name Inc. & Associates LLC',
				title: 'Chief Technology Officer & Senior Vice President',
				department: 'engineering',
				website: 'https://very-long-company-domain-name.example.com'
			},
			payment: {
				cardNumber: '5555555555554444', // Safe test Mastercard
				expiry: '03/29',
				cvv: '789',
				cardholderName: "Jean-Pierre O'Connor-Smith"
			},
			account: {
				username: 'jean.pierre.oconnor.smith',
				password: 'ComplexP@ssw0rd!123'
			},
			custom: {
				bio: 'Senior Research Scientist with extensive experience in edge case analysis and data validation. Specializes in handling complex international scenarios and multilingual systems.'
			}
		},

		tester: {
			personal: {
				firstName: 'Quality',
				lastName: 'Assurance',
				fullName: 'Quality Assurance',
				email: 'qa.tester@testing.org',
				phone: '+1-800-TEST-QA',
				dateOfBirth: '1988-07-04',
				age: '35',
				gender: 'female',
				ssn: '555-12-3456'
			},
			address: {
				street: '789 Testing Boulevard',
				street2: 'Suite QA-101',
				city: 'Test City',
				state: 'TX',
				zip: '75001',
				country: 'United States'
			},
			company: {
				name: 'QA Testing Solutions',
				title: 'Lead Quality Assurance Engineer',
				department: 'engineering',
				website: 'https://qa-testing.com'
			},
			payment: {
				cardNumber: '4000000000000051', // Safe test card that will decline
				expiry: '09/26',
				cvv: '321',
				cardholderName: 'Quality Assurance'
			},
			account: {
				username: 'qatester',
				password: 'Testing123!'
			},
			custom: {
				bio: 'Dedicated QA professional with 10+ years of experience in software testing, automation, and quality assurance. Expert in finding edge cases and ensuring robust applications.'
			}
		},

		accountSignatory: {
			personal: {
				firstName: 'Margaret',
				lastName: 'Richardson',
				fullName: 'Margaret Richardson',
				email: 'margaret.richardson@financialgroup.com',
				phone: '+1-555-0198',
				dateOfBirth: '1978-03-12',
				age: '45',
				gender: 'female',
				ssn: '456-78-9012'
			},
			address: {
				street: '1200 Financial Plaza',
				street2: 'Suite 2400',
				city: 'New York',
				state: 'NY',
				zip: '10019',
				country: 'United States'
			},
			company: {
				name: 'Metropolitan Financial Group',
				title: 'Authorized Account Signatory',
				department: 'finance',
				website: 'https://metrofinancial.com'
			},
			payment: {
				cardNumber: '4000000000003220', // Business credit card
				expiry: '03/29',
				cvv: '587',
				cardholderName: 'Margaret Richardson'
			},
			account: {
				username: 'mrichardson',
				password: 'SecureSign789!'
			},
			custom: {
				taxId: '12-3456789',
				accountingFirm: 'Richardson & Associates CPA',
				signatoryLevel: 'Level 3 - Executive Authorization',
				bio: 'Certified Public Accountant with authorization to sign on behalf of corporate accounts. 15+ years experience in financial management and regulatory compliance.'
			}
		},

		employer: {
			personal: {
				firstName: 'David',
				lastName: 'Mitchell',
				fullName: 'David Mitchell',
				email: 'david.mitchell@globaltech.com',
				phone: '+1-555-0287',
				dateOfBirth: '1972-09-08',
				age: '51',
				gender: 'male',
				ssn: '789-01-2345'
			},
			address: {
				street: '5600 Corporate Drive',
				street2: 'Executive Floor',
				city: 'Austin',
				state: 'TX',
				zip: '78731',
				country: 'United States'
			},
			company: {
				name: 'Global Technology Solutions',
				title: 'Chief Executive Officer',
				department: 'executive',
				website: 'https://globaltechsolutions.com'
			},
			payment: {
				cardNumber: '4000000000005548', // Corporate card
				expiry: '08/30',
				cvv: '123',
				cardholderName: 'David Mitchell'
			},
			account: {
				username: 'dmitchell',
				password: 'ExecutivePass2024!'
			},
			custom: {
				taxId: '74-9876543',
				employeeCount: '1,247',
				industry: 'Technology Services',
				ein: '74-9876543',
				bio: 'CEO of Global Technology Solutions with over 20 years of experience leading technology companies. Responsible for strategic direction and overall business operations.'
			}
		},

		businessOwner: {
			personal: {
				firstName: 'Sarah',
				lastName: 'Chen',
				fullName: 'Sarah Chen',
				email: 'sarah.chen@chenconsulting.com',
				phone: '+1-555-0341',
				dateOfBirth: '1980-12-03',
				age: '43',
				gender: 'female',
				ssn: '321-65-4987'
			},
			address: {
				street: '890 Business Park Way',
				street2: 'Building C, Suite 150',
				city: 'Seattle',
				state: 'WA',
				zip: '98101',
				country: 'United States'
			},
			company: {
				name: 'Chen Business Consulting LLC',
				title: 'Founder & Managing Partner',
				department: 'executive',
				website: 'https://chenconsulting.com'
			},
			payment: {
				cardNumber: '4000000000004121', // Business owner card
				expiry: '11/28',
				cvv: '456',
				cardholderName: 'Sarah Chen'
			},
			account: {
				username: 'sarahchen',
				password: 'BusinessOwner123!'
			},
			custom: {
				taxId: '91-2345678',
				businessLicense: 'WA-BL-2018-0054321',
				businessType: 'Limited Liability Company',
				industryCode: 'NAICS 541611',
				ein: '91-2345678',
				bio: 'Entrepreneur and business consultant specializing in helping startups and small businesses achieve sustainable growth. Founded Chen Consulting in 2018.'
			}
		},

		shareholder: {
			personal: {
				firstName: 'Robert',
				lastName: 'Hamilton',
				fullName: 'Robert Hamilton',
				email: 'robert.hamilton@hamiltoninvest.com',
				phone: '+1-555-0456',
				dateOfBirth: '1965-06-18',
				age: '58',
				gender: 'male',
				ssn: '654-32-1098'
			},
			address: {
				street: '2500 Investment Boulevard',
				street2: 'Penthouse Suite',
				city: 'Chicago',
				state: 'IL',
				zip: '60601',
				country: 'United States'
			},
			company: {
				name: 'Hamilton Investment Holdings',
				title: 'Principal Shareholder',
				department: 'investment',
				website: 'https://hamiltoninvestments.com'
			},
			payment: {
				cardNumber: '4000000000006655', // Premium shareholder card
				expiry: '07/29',
				cvv: '789',
				cardholderName: 'Robert Hamilton'
			},
			account: {
				username: 'rhamilton',
				password: 'Investor2024!'
			},
			custom: {
				taxId: '36-7890123',
				shareholderClass: 'Class A Preferred',
				portfolioValue: '$2,847,000',
				investmentFirm: 'Hamilton Investment Holdings LLC',
				ein: '36-7890123',
				bio: 'Experienced investor and principal shareholder with diversified portfolio across technology, healthcare, and renewable energy sectors. 25+ years in investment management.'
			}
		},

		director: {
			personal: {
				firstName: 'Elizabeth',
				lastName: 'Ward',
				fullName: 'Elizabeth Ward',
				email: 'elizabeth.ward@corporateboard.com',
				phone: '+1-555-0567',
				dateOfBirth: '1970-04-25',
				age: '53',
				gender: 'female',
				ssn: '987-54-3210'
			},
			address: {
				street: '3300 Corporate Center',
				street2: 'Director\'s Level',
				city: 'Denver',
				state: 'CO',
				zip: '80202',
				country: 'United States'
			},
			company: {
				name: 'Summit Enterprises Inc',
				title: 'Board of Directors',
				department: 'governance',
				website: 'https://summitenterprises.com'
			},
			payment: {
				cardNumber: '4000000000007766', // Corporate director card
				expiry: '12/27',
				cvv: '234',
				cardholderName: 'Elizabeth Ward'
			},
			account: {
				username: 'eward',
				password: 'DirectorAccess789!'
			},
			custom: {
				taxId: '84-5678901',
				boardPosition: 'Independent Director',
				committees: 'Audit, Compensation, Governance',
				directorSince: '2019',
				ein: '84-5678901',
				bio: 'Independent board director with expertise in corporate governance, risk management, and strategic planning. Serves on multiple public company boards.'
			}
		}
	}

	private firstNames = [
		'John', 'Jane', 'Alex', 'Sam', 'Taylor', 'Morgan', 'Casey', 'Jordan',
		'Chris', 'Pat', 'Robin', 'Dana', 'Jesse', 'Avery', 'Riley', 'Quinn'
	]

	private lastNames = [
		'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Milla', 'Davis',
		'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas'
	]

	private companies = [
		'Tech Solutions Inc', 'Digital Innovations LLC', 'Software Systems Corp',
		'Data Analytics Group', 'Cloud Computing Co', 'AI Research Labs',
		'Mobile Development Studio', 'Web Design Agency', 'Cybersecurity Experts'
	]

	private streets = [
		'Main St', 'Oak Ave', 'First St', 'Second Ave', 'Park Rd', 'Elm St',
		'Cedar Ln', 'Pine Dr', 'Maple Way', 'Birch Blvd', 'Willow Ct'
	]

	private cities = [
		'Springfield', 'Franklin', 'Georgetown', 'Madison', 'Oakland', 'Salem',
		'Bristol', 'Clinton', 'Fairview', 'Highland', 'Midway', 'Riverside'
	]

	private domains = [
		'example.com', 'test.org', 'demo.net', 'sample.co', 'testing.dev', 'yopmail.com'
	]

	getProfile(profileName: string): ProfileData | null {
		return this.profiles[profileName] || null
	}

	getRandomProfile(): ProfileData {
		const keys = Object.keys(this.profiles)
		const randomKey = keys[Math.floor(Math.random() * keys.length)]
		return this.profiles[randomKey]
	}

	getAllProfiles(): Record<string, ProfileData> {
		return { ...this.profiles }
	}

	getProfileNames(): string[] {
		return Object.keys(this.profiles)
	}

	generateRandomData(fieldType: string, subtype: string): string {
		const key = `${fieldType}.${subtype}`

		const generators: Record<string, () => string> = {
			'personal.firstName': () => this.randomChoice(this.firstNames),
			'personal.lastName': () => this.randomChoice(this.lastNames),
			'personal.fullName': () => {
				const first = this.randomChoice(this.firstNames)
				const last = this.randomChoice(this.lastNames)
				return `${first} ${last}`
			},
			'personal.email': () => {
				const name = this.randomChoice(['test', 'demo', 'user', 'sample'])
				const domain = this.randomChoice(this.domains)
				return `${name}${Math.floor(Math.random() * 1000)}@${domain}`
			},
			'personal.phone': () => {
				const area = Math.floor(Math.random() * 900) + 100
				const exchange = Math.floor(Math.random() * 900) + 100
				const number = Math.floor(Math.random() * 9000) + 1000
				return `+1 (${area}) ${exchange}-${number}`
			},
			'personal.dateOfBirth': () => {
				const year = 1950 + Math.floor(Math.random() * 50)
				const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')
				const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')
				return `${year}-${month}-${day}`
			},
			'personal.age': () => String(18 + Math.floor(Math.random() * 60)),
			'personal.gender': () => this.randomChoice(['male', 'female', 'non-binary', 'prefer-not-to-say']),
			'personal.ssn': () => {
				const area = String(Math.floor(Math.random() * 900) + 100)
				const group = String(Math.floor(Math.random() * 90) + 10)
				const serial = String(Math.floor(Math.random() * 9000) + 1000)
				return `${area}-${group}-${serial}`
			},
			'address.street': () => {
				const number = Math.floor(Math.random() * 9999) + 1
				const street = this.randomChoice(this.streets)
				return `${number} ${street}`
			},
			'address.street2': () => {
				const options = ['', 'Apt A', 'Unit 1', 'Suite 100', '#2B']
				return this.randomChoice(options)
			},
			'address.city': () => this.randomChoice(this.cities),
			'address.state': () => this.randomChoice(['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH']),
			'address.zip': () => {
				const zip = Math.floor(Math.random() * 90000) + 10000
				return String(zip)
			},
			'address.country': () => this.randomChoice(['United States', 'Canada', 'United Kingdom']),
			'company.name': () => this.randomChoice(this.companies),
			'company.title': () => this.randomChoice([
				'Software Engineer', 'Product Manager', 'UX Designer', 'Data Analyst',
				'DevOps Engineer', 'QA Engineer', 'Technical Writer', 'Project Manager'
			]),
			'company.department': () => this.randomChoice([
				'engineering', 'marketing', 'sales', 'hr', 'finance', 'operations'
			]),
			'company.website': () => {
				const name = this.randomChoice(['tech', 'digital', 'software', 'data', 'cloud'])
				const tld = this.randomChoice(['com', 'org', 'net', 'io'])
				return `https://${name}-company.${tld}`
			},
			'payment.cardNumber': () => {
				// Always return safe test cards
				const testCards = [
					'4242424242424242', // Visa
					'4000000000000002', // Visa (declined)
					'5555555555554444', // Mastercard
					'378282246310005'   // American Express
				]
				return this.randomChoice(testCards)
			},
			'payment.expiry': () => {
				const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')
				const year = String(new Date().getFullYear() + Math.floor(Math.random() * 5)).slice(-2)
				return `${month}/${year}`
			},
			'payment.cvv': () => String(Math.floor(Math.random() * 900) + 100),
			'payment.cardholderName': () => {
				const first = this.randomChoice(this.firstNames)
				const last = this.randomChoice(this.lastNames)
				return `${first} ${last}`
			},
			'account.username': () => {
				const name = this.randomChoice(['user', 'test', 'demo', 'sample'])
				const number = Math.floor(Math.random() * 1000)
				return `${name}${number}`
			},
			'account.password': () => {
				const passwords = [
					'TestPassword123!', 'SecurePass456!', 'DemoPassword789!',
					'SamplePass123!', 'TestingPwd456!', 'DevPassword789!'
				]
				return this.randomChoice(passwords)
			}
		}

		return generators[key] ? generators[key]() : 'Test Data'
	}

	private randomChoice<T>(array: T[]): T {
		return array[Math.floor(Math.random() * array.length)]
	}

	// Create a profile from dummy data with customizations
	createProfileFromDummy(dummyProfileName: string, customizations: Partial<ProfileData> = {}): Profile {
		const dummyProfile = this.getProfile(dummyProfileName)
		if (!dummyProfile) {
			throw new Error(`Dummy profile '${dummyProfileName}' not found`)
		}

		return {
			id: this.generateId(),
			name: customizations.personal?.firstName
				? `${customizations.personal.firstName}'s Profile`
				: `Custom Profile`,
			isDefault: false,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			data: {
				personal: { ...dummyProfile.personal, ...customizations.personal },
				address: { ...dummyProfile.address, ...customizations.address },
				company: { ...dummyProfile.company, ...customizations.company },
				payment: { ...dummyProfile.payment, ...customizations.payment },
				account: { ...dummyProfile.account, ...customizations.account },
				custom: { ...dummyProfile.custom, ...customizations.custom }
			}
		}
	}

	generateRandomProfile(name?: string): Profile {
		return {
			id: this.generateId(),
			name: name || `Random Profile ${Date.now()}`,
			isDefault: false,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			data: {
				personal: {
					firstName: this.generateRandomData('personal', 'firstName'),
					lastName: this.generateRandomData('personal', 'lastName'),
					fullName: this.generateRandomData('personal', 'fullName'),
					email: this.generateRandomData('personal', 'email'),
					phone: this.generateRandomData('personal', 'phone'),
					dateOfBirth: this.generateRandomData('personal', 'dateOfBirth'),
					age: this.generateRandomData('personal', 'age'),
					gender: this.generateRandomData('personal', 'gender'),
					ssn: this.generateRandomData('personal', 'ssn')
				},
				address: {
					street: this.generateRandomData('address', 'street'),
					street2: this.generateRandomData('address', 'street2'),
					city: this.generateRandomData('address', 'city'),
					state: this.generateRandomData('address', 'state'),
					zip: this.generateRandomData('address', 'zip'),
					country: this.generateRandomData('address', 'country')
				},
				company: {
					name: this.generateRandomData('company', 'name'),
					title: this.generateRandomData('company', 'title'),
					department: this.generateRandomData('company', 'department'),
					website: this.generateRandomData('company', 'website')
				},
				payment: {
					cardNumber: this.generateRandomData('payment', 'cardNumber'),
					expiry: this.generateRandomData('payment', 'expiry'),
					cvv: this.generateRandomData('payment', 'cvv'),
					cardholderName: this.generateRandomData('payment', 'cardholderName')
				},
				account: {
					username: this.generateRandomData('account', 'username'),
					password: this.generateRandomData('account', 'password')
				},
				custom: {}
			}
		}
	}

	private generateId(): string {
		return `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
	}
}
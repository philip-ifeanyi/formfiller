import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { JSDOM } from 'jsdom'

const scriptFilePath = fileURLToPath(import.meta.url)
const scriptDir = dirname(scriptFilePath)
const rootDir = resolve(scriptDir, '..')

const developerProfile = {
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
		cardNumber: '4242424242424242',
		expiry: '12/28',
		cvv: '123',
		cardholderName: 'Alex Developer'
	},
	account: {
		username: 'alexdev',
		password: 'TestPassword123!'
	},
	custom: {}
}

const ariaProfile = {
	personal: {
		firstName: 'Avery',
		lastName: 'Quinn',
		fullName: 'Avery Quinn',
		email: 'avery.quinn@example.test',
		phone: '+1-555-0199',
		dateOfBirth: '1993-06-18',
		age: '33',
		gender: 'Non-binary',
		ssn: '111-22-3333'
	},
	address: {
		street: '100 Demo Lane',
		street2: '',
		city: 'Portland',
		state: 'OR',
		zip: '97205',
		country: 'United States'
	},
	company: {
		name: 'Widget Labs',
		title: 'Engineer',
		department: 'QA',
		website: 'https://widget-labs.example.test'
	},
	payment: {
		cardNumber: '4242424242424242',
		expiry: '11/30',
		cvv: '123',
		cardholderName: 'Avery Quinn'
	},
	account: {
		username: 'averyq',
		password: 'SafePassword123!'
	},
	custom: {}
}

const libraryProfile = {
	personal: {
		firstName: 'Taylor',
		lastName: 'Tester',
		fullName: 'Taylor Tester',
		email: 'qa@example.com',
		phone: '5551234567',
		dateOfBirth: '1992-01-01',
		age: '34',
		gender: 'Female',
		ssn: '222-33-4444'
	},
	address: {
		street: '88 Orchard View',
		street2: '',
		city: 'Portland',
		state: 'OR',
		zip: '97205',
		country: 'Canada'
	},
	company: {
		name: 'Northwind Labs',
		title: 'Engineer',
		department: 'QA',
		website: 'https://northwind.example.test'
	},
	payment: {
		cardNumber: '4242424242424242',
		expiry: '12/30',
		cvv: '123',
		cardholderName: 'Taylor Tester'
	},
	account: {
		username: 'ttester',
		password: 'SafePassword123!'
	},
	custom: {}
}

const multiStepProfile = {
	personal: {
		firstName: 'Taylor',
		lastName: 'Rivera',
		fullName: 'Taylor Rivera',
		email: 'taylor.rivera@example.test',
		phone: '+1-555-0112',
		dateOfBirth: '1992-09-14',
		age: '33',
		gender: 'Female',
		ssn: '111-22-3333'
	},
	address: {
		street: '88 Orchard View',
		street2: 'Suite 12',
		city: 'Portland',
		state: 'OR',
		zip: '97205',
		country: 'United States'
	},
	company: {
		name: 'Northwind Labs',
		title: 'QA Engineer',
		department: 'quality',
		website: 'https://northwind.example.test'
	},
	payment: {
		cardNumber: '4242424242424242',
		expiry: '12/30',
		cvv: '123',
		cardholderName: 'Taylor Rivera'
	},
	account: {
		username: 'trivera',
		password: 'SafePassword123!'
	},
	custom: {}
}

const failureProfile = {
	personal: {
		firstName: 'Morgan',
		lastName: 'Casey',
		fullName: 'Morgan Casey',
		email: 'morgan.casey@example.test',
		phone: '5551234567',
		dateOfBirth: '1994-07-11',
		age: '33',
		gender: 'Female',
		ssn: '333-44-5555'
	},
	address: {
		street: '15 Signal Way',
		street2: '',
		city: 'Austin',
		state: 'TX',
		zip: '73301',
		country: 'Canada'
	},
	company: {
		name: 'Regression Labs',
		title: 'Engineer',
		department: 'QA',
		website: 'https://regression.example.test'
	},
	payment: {
		cardNumber: '4242424242424242',
		expiry: '10/30',
		cvv: '123',
		cardholderName: 'Morgan Casey'
	},
	account: {
		username: 'mcasey',
		password: 'SafePassword123!'
	},
	custom: {}
}

const scenarios = {
	'native-smoke': {
		fixturePath: 'test-page.html',
		profileData: developerProfile,
		assertions: async ({ response, window }) => {
			const results = getResults(response)
			expectInputValue(window, 'firstName', 'Alex')
			expectInputValue(window, 'email', 'alex.dev@testmail.com')
			expectInputValue(window, 'age', '33')
			expectInputValue(window, 'birthDateTime', '1990-05-15T00:00')
			expectValue(window, '#gender', 'prefer-not-to-say')
			expectValue(window, '#department', 'engineering')
			expectValue(window, '#country', 'US')
			expectSelectedValues(window, '#departmentMulti', ['engineering'])
			expectFieldResult(results, {
				labelIncludes: 'Confirm Password',
				status: 'review'
			})
			expectFieldResult(results, {
				labelIncludes: 'product updates',
				status: 'skipped'
			})
			expectFilledCountAtLeast(results, 15)
		}
	},
	'dynamic-smoke': {
		fixturePath: 'ff08-dynamic-test.html',
		profileData: developerProfile,
		assertions: async ({ response, window }) => {
			getResults(response)
			expectInputValue(window, 'dynamicReplaceEmail', 'alex.dev@testmail.com')
			expectInputValue(window, 'delayedPhone', '+1-555-0123')
		}
	},
	'aria-positive': {
		fixturePath: 'ff14-aria-test.html',
		profileData: ariaProfile,
		assertions: async ({ response, window }) => {
			const results = getResults(response)
			const state = parseFixtureState(window)
			expectEqual(state.title, 'Engineer', 'Expected ARIA combobox title to fill')
			expectEqual(state.department, 'QA', 'Expected ARIA listbox department to fill')
			expectEqual(state.switchDepartment, 'QA', 'Expected ARIA switch to resolve QA')
			expectEqual(state.gender, 'Non-binary', 'Expected ARIA radiogroup to resolve Non-binary')
			expectEqual(state.age, '33', 'Expected ARIA spinbutton age to fill')
			expectFilledCountAtLeast(results, 5)
		}
	},
	'library-positive': {
		fixturePath: 'ff15-library-test.html',
		profileData: libraryProfile,
		assertions: async ({ response, window }) => {
			const results = getResults(response)
			const state = parseFixtureState(window)
			expectEqual(state.reactSelectCountry, 'Canada', 'Expected React Select-like control to fill')
			expectEqual(state.headlessDepartment, 'QA', 'Expected Headless UI-like control to fill')
			expectEqual(state.muiTitle, 'Engineer', 'Expected MUI-like autocomplete to fill')
			expectEqual(state.maskedPhone, '(555) 123-4567', 'Expected masked input to format the phone value')
			expectEqual(state.shadowEmail, 'qa@example.com', 'Expected shadow-root email to fill')
			expectEqual(results.length, 5, 'Expected exactly 5 FF-15 results')
		}
	},
	'multistep-positive': {
		fixturePath: 'ff16-multistep-test.html',
		profileData: multiStepProfile,
		assertions: async ({ response, window }) => {
			const results = getResults(response)
			const state = parseFixtureState(window)
			expectEqual(state.stepOnePresent, false, 'Expected step one to be removed after continuation')
			expectEqual(state.stepTwoVisible, true, 'Expected step two to become visible')
			expectEqual(state.values.addressLine1, '88 Orchard View', 'Expected step-two address to fill')
			expectEqual(state.values.city, 'Portland', 'Expected step-two city to fill')
			expectEqual(state.values.primaryEmail, 'taylor.rivera@example.test', 'Expected step-two primary email to fill')
			expectEqual(state.values.duplicateEmail, '', 'Expected weaker duplicate email to remain blank')
			expectFieldResult(results, {
				labelIncludes: 'Best Email For Updates',
				status: 'review'
			})
			expectFilledCountAtLeast(results, 6)
		}
	},
	'safe-failure-net': {
		fixturePath: 'ff17-safe-failure-test.html',
		profileData: failureProfile,
		assertions: async ({ response, window }) => {
			const results = getResults(response)
			const state = parseFixtureState(window)
			expectEqual(results.length, 11, 'Expected 11 safe-failure results and no hidden proxy noise')
			expectFieldResult(results, {
				labelIncludes: 'Country Select Mismatch',
				status: 'skipped',
				adapterId: 'native.select',
				messageIncludes: 'No select option matched Canada'
			})
			expectFieldResult(results, {
				labelIncludes: 'Job Title Combobox',
				status: 'skipped',
				adapterId: 'aria.combobox',
				messageIncludes: 'No combobox option matched Engineer'
			})
			expectFieldResult(results, {
				labelIncludes: 'Department Listbox',
				status: 'skipped',
				adapterId: 'aria.listbox',
				messageIncludes: 'No listbox option matched QA'
			})
			expectFieldResult(results, {
				labelIncludes: 'Department Toggle',
				status: 'skipped',
				adapterId: 'aria.switch',
				messageIncludes: 'did not match an available state'
			})
			expectFieldResult(results, {
				labelIncludes: 'Gender Group',
				status: 'skipped',
				adapterId: 'aria.radiogroup',
				messageIncludes: 'No radio option matched Female'
			})
			expectFieldResult(results, {
				labelIncludes: 'Age Spinbutton',
				status: 'skipped',
				adapterId: 'aria.spinbutton',
				messageIncludes: 'missing a usable current numeric value'
			})
			expectFieldResult(results, {
				labelIncludes: 'Country React Select',
				status: 'skipped',
				adapterId: 'react-select.combobox',
				messageIncludes: 'No combobox option matched Canada'
			})
			expectFieldResult(results, {
				labelIncludes: 'Department Headless',
				status: 'skipped',
				adapterId: 'headlessui.listbox',
				messageIncludes: 'No listbox option matched QA'
			})
			expectFieldResult(results, {
				labelIncludes: 'Job Title Autocomplete',
				status: 'skipped',
				adapterId: 'mui.autocomplete',
				messageIncludes: 'No combobox option matched Engineer'
			})
			expectFieldResult(results, {
				labelIncludes: 'Phone Mask Reset',
				status: 'failed',
				adapterId: 'masked.input',
				messageIncludes: 'Post-fill value did not persist'
			})
			expectFieldResult(results, {
				labelIncludes: 'Shadow Country',
				status: 'skipped',
				adapterId: 'shadow.native',
				messageIncludes: 'No select option matched Canada'
			})
			expectEqual(state.maskedResetValue, '', 'Expected masked failure fixture to reset its value')
		}
	}
}

async function main() {
	const scenarioFlagIndex = process.argv.indexOf('--scenario')
	const scenarioId = scenarioFlagIndex >= 0
		? process.argv[scenarioFlagIndex + 1]
		: process.argv[2]

	if (!scenarioId) {
		const scenarioIds = Object.keys(scenarios)
		let hasFailure = false

		console.log(`Running ${scenarioIds.length} fixture scenarios against dist/content.js`)
		for (const id of scenarioIds) {
			const result = spawnSync(process.execPath, [scriptFilePath, id], {
				cwd: rootDir,
				stdio: 'inherit'
			})

			if (result.status !== 0) {
				hasFailure = true
			}
		}

		if (hasFailure) {
			process.exit(1)
		}

		console.log('Fixture verification passed for all scenarios.')
		return
	}

	await runScenario(scenarioId)
}

async function runScenario(scenarioId) {
	const scenario = scenarios[scenarioId]
	if (!scenario) {
		throw new Error(`Unknown scenario ${scenarioId}`)
	}

	const fixturePath = resolve(rootDir, scenario.fixturePath)
	const html = await readFile(fixturePath, 'utf8')
	const dom = new JSDOM(html, {
		pretendToBeVisual: true,
		runScripts: 'dangerously',
		resources: 'usable',
		url: pathToFileURL(fixturePath).href,
		beforeParse(window) {
			window.alert = () => {}
			window.matchMedia = () => ({
				matches: false,
				media: '',
				onchange: null,
				addListener() {},
				removeListener() {},
				addEventListener() {},
				removeEventListener() {},
				dispatchEvent() { return false }
			})
			window.requestAnimationFrame = callback => window.setTimeout(() => callback(Date.now()), 16)
			window.cancelAnimationFrame = handle => window.clearTimeout(handle)
			window.ResizeObserver = class {
				observe() {}
				unobserve() {}
				disconnect() {}
			}
			window.innerWidth = 1440
			window.innerHeight = 1024

			const rect = {
				x: 0,
				y: 0,
				top: 0,
				left: 0,
				right: 240,
				bottom: 32,
				width: 240,
				height: 32,
				toJSON() {
					return this
				}
			}

			window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
				return rect
			}
		}
	})

	await waitForWindowLoad(dom.window)
	installChromeStub(dom.window, scenario.profileData)
	installDomGlobals(dom.window)

	const contentBundleUrl = `${pathToFileURL(resolve(rootDir, 'dist/content.js')).href}?scenario=${encodeURIComponent(scenarioId)}`
	await import(contentBundleUrl)
	await delay(60)

	const listener = dom.window.__formfillaListener
	if (typeof listener !== 'function') {
		throw new Error(`Scenario ${scenarioId} did not register a content message listener`)
	}

	const response = await new Promise(resolve => {
		listener(
			{ type: 'fillForm', profileData: scenario.profileData },
			{ id: dom.window.chrome.runtime.id },
			resolve
		)
	})

	await delay(260)
	await scenario.assertions({ response, window: dom.window })
	console.log(`PASS ${scenarioId}`)
	if (typeof dom.window.close === 'function') {
		dom.window.close()
	}
}

function installChromeStub(window, profileData) {
	const settings = {
		autoFillEnabled: true,
		defaultProfile: 'fixture-profile',
		fillDelay: 0,
		highlightFields: false,
		showButtons: false,
		buttonPosition: 'inside-right',
		contextMenuEnabled: true,
		autoHideButtons: true,
		buttonStyle: 'minimal',
		debugMode: false,
		featureFlags: {}
	}

	const storageAreas = {
		sync: { settings },
		local: {}
	}

	const createStorageArea = areaName => ({
		async get(keys) {
			if (!keys) {
				return { ...storageAreas[areaName] }
			}

			if (typeof keys === 'string') {
				return { [keys]: storageAreas[areaName][keys] }
			}

			if (Array.isArray(keys)) {
				return keys.reduce((result, key) => {
					result[key] = storageAreas[areaName][key]
					return result
				}, {})
			}

			return Object.entries(keys).reduce((result, [key, fallbackValue]) => {
				result[key] = storageAreas[areaName][key] ?? fallbackValue
				return result
			}, {})
		},
		async set(values) {
			storageAreas[areaName] = {
				...storageAreas[areaName],
				...values
			}
		},
		async remove(keys) {
			const keysToRemove = Array.isArray(keys) ? keys : [keys]
			keysToRemove.forEach(key => {
				delete storageAreas[areaName][key]
			})
		}
	})

	window.chrome = {
		runtime: {
			id: 'formfilla-fixture-runner',
			lastError: undefined,
			onMessage: {
				addListener(listener) {
					window.__formfillaListener = listener
				}
			},
			sendMessage(message, callback) {
				if (message?.type === 'getSettings') {
					callback?.({ settings })
					return
				}

				if (message?.type === 'getDefaultProfileData') {
					callback?.({ profileData })
					return
				}

				callback?.({ success: true })
			}
		},
		storage: {
			sync: createStorageArea('sync'),
			local: createStorageArea('local')
		}
	}
}

function installDomGlobals(window) {
	const constructors = [
		'window',
		'document',
		'Node',
		'Element',
		'HTMLElement',
		'HTMLInputElement',
		'HTMLTextAreaElement',
		'HTMLSelectElement',
		'HTMLButtonElement',
		'HTMLFormElement',
		'HTMLFieldSetElement',
		'HTMLOptionElement',
		'ShadowRoot',
		'MutationObserver',
		'Event',
		'CustomEvent',
		'KeyboardEvent',
		'MouseEvent',
		'FocusEvent',
		'SubmitEvent',
		'customElements',
		'navigator',
		'self'
	]

	constructors.forEach(name => {
		globalThis[name] = name === 'self' ? window : window[name]
	})

	globalThis.chrome = window.chrome
	globalThis.getComputedStyle = window.getComputedStyle.bind(window)
	globalThis.alert = window.alert
}

function getResults(response) {
	if (!response || response.success !== true || !Array.isArray(response.results)) {
		throw new Error(`Expected a successful fill response, received ${JSON.stringify(response)}`)
	}

	return response.results
}

function expectFilledCountAtLeast(results, minimum) {
	const filledCount = results.filter(result => result.status === 'filled').length
	if (filledCount < minimum) {
		throw new Error(`Expected at least ${minimum} filled results, received ${filledCount}`)
	}
}

function expectFieldResult(results, expectation) {
	const match = results.find(result => {
		const label = result.review?.label || result.debug?.label || ''
		if (expectation.labelIncludes && !label.includes(expectation.labelIncludes)) {
			return false
		}

		if (expectation.adapterId && result.adapterId !== expectation.adapterId) {
			return false
		}

		return true
	})

	if (!match) {
		throw new Error(`Expected to find a result for ${expectation.labelIncludes || expectation.adapterId}`)
	}

	if (match.status !== expectation.status) {
		throw new Error(`Expected ${expectation.labelIncludes} to be ${expectation.status}, received ${match.status}`)
	}

	if (expectation.messageIncludes && !(match.message || '').includes(expectation.messageIncludes)) {
		throw new Error(`Expected ${expectation.labelIncludes} message to include "${expectation.messageIncludes}", received "${match.message}"`)
	}
}

function expectInputValue(window, id, expectedValue) {
	const element = window.document.getElementById(id)
	if (!element) {
		throw new Error(`Expected element #${id} to exist`)
	}

	expectEqual(element.value, expectedValue, `Expected #${id} to equal ${expectedValue}`)
}

function expectValue(window, selector, expectedValue) {
	const element = window.document.querySelector(selector)
	if (!element) {
		throw new Error(`Expected selector ${selector} to exist`)
	}

	expectEqual(element.value, expectedValue, `Expected ${selector} to equal ${expectedValue}`)
}

function expectSelectedValues(window, selector, expectedValues) {
	const element = window.document.querySelector(selector)
	if (!(element instanceof window.HTMLSelectElement)) {
		throw new Error(`Expected ${selector} to be a select element`)
	}

	const selectedValues = Array.from(element.selectedOptions).map(option => option.value)
	expectEqual(
		JSON.stringify(selectedValues.sort()),
		JSON.stringify([...expectedValues].sort()),
		`Expected ${selector} to select ${expectedValues.join(', ')}`
	)
}

function parseFixtureState(window) {
	const stateNode = window.document.getElementById('fixture-state')
	if (!stateNode) {
		throw new Error('Expected #fixture-state to exist')
	}

	return JSON.parse(stateNode.textContent || '{}')
}

function expectEqual(actual, expected, message) {
	if (actual !== expected) {
		throw new Error(`${message}. Received ${JSON.stringify(actual)}`)
	}
}

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

function waitForWindowLoad(window) {
	if (window.document.readyState === 'complete') {
		return Promise.resolve()
	}

	return new Promise(resolve => {
		window.addEventListener('load', () => resolve(), { once: true })
	})
}

main().catch(error => {
	console.error(error instanceof Error ? error.stack || error.message : error)
	process.exit(1)
})
import { ProfileManager } from '@/lib/profiles'
import { DEFAULT_FEATURE_FLAGS, StorageService } from '@/lib/storage'
import {
	type ContentCommandMessage,
	type ContentResponseMessage,
	type FieldDebugTrace,
	type FieldReviewItem,
	type FillFormResponseMessage,
	type FillResult,
	type GetFormFieldsResponseMessage,
	type Profile,
	type ProfileData,
	type ReviewFieldsResponseMessage,
	type RuntimeErrorResponse
} from '@/types'

type PageReadiness = 'loading' | 'ready' | 'empty' | 'unavailable'
type ReleaseGateTone = 'pass' | 'warning' | 'danger'
type EnvironmentAssessmentKind = 'no-tab' | 'allowed-host' | 'local-fixture' | 'blocked-host' | 'unsupported-scheme'

type ReleaseGateItem = {
	label: string
	detail: string
	tone: ReleaseGateTone
}

type EnvironmentAssessment = {
	kind: EnvironmentAssessmentKind
	detail: string
	tone: ReleaseGateTone
	blocksAutofill: boolean
}

const RELEASE_ALLOWED_HOST_SUFFIXES = ['.local', '.test', '.dev', '.staging', '.uat'] as const
const RELEASE_BOUNDARY_LABEL = 'localhost, 127.0.0.1, *.local, *.test, *.dev, *.staging, *.uat, and local file fixtures'

type PopupElements = {
	releaseGatePanel: HTMLElement
	releaseGateSummary: HTMLElement
	releaseGateList: HTMLElement
	pageStatusPill: HTMLElement
	pageStatusDetail: HTMLElement
	formCount: HTMLElement
	fieldCount: HTMLElement
	profileSelect: HTMLSelectElement
	activeProfileName: HTMLElement
	activeProfileMeta: HTMLElement
	autofillButton: HTMLButtonElement
	reviewButton: HTMLButtonElement
	debugToggleButton: HTMLButtonElement
	refreshButton: HTMLButtonElement
	openOptionsButton: HTMLButtonElement
	summaryPanel: HTMLElement
	summaryTitle: HTMLElement
	summaryHeadline: HTMLElement
	summaryStats: HTMLElement
	summaryIssues: HTMLElement
	debugPanel: HTMLElement
	debugTitle: HTMLElement
	debugStatus: HTMLElement
	debugList: HTMLElement
	toast: HTMLElement
}

function isErrorResponse(response: ContentResponseMessage | null): response is RuntimeErrorResponse {
	return Boolean(response && 'error' in response)
}

function isGetFormFieldsResponse(response: ContentResponseMessage | null): response is GetFormFieldsResponseMessage {
	return Boolean(response && 'formCount' in response && 'fieldCount' in response)
}

function isFillFormResponse(response: ContentResponseMessage | null): response is FillFormResponseMessage {
	return Boolean(response && 'results' in response)
}

function isReviewFieldsResponse(response: ContentResponseMessage | null): response is ReviewFieldsResponseMessage {
	return Boolean(response && 'items' in response)
}

class PopupUI {
	private storage: StorageService
	private profileManager: ProfileManager
	private elements: PopupElements
	private profiles: Profile[] = []
	private activeProfileId = ''
	private activeTabId: number | null = null
	private activeTabUrl = ''
	private pageReadiness: PageReadiness = 'loading'
	private featureFlags: Record<string, boolean> = { ...DEFAULT_FEATURE_FLAGS }
	private debugModeEnabled = false
	private lastDebugTitle = 'Debug Trace'
	private lastDebugTraces: FieldDebugTrace[] = []

	constructor() {
		const storage = StorageService.getInstance()
		this.storage = storage
		this.profileManager = new ProfileManager(storage)
		this.elements = this.getElements()
		void this.initialize()
	}

	private async initialize(): Promise<void> {
		this.renderPageStatus('loading', 'Checking the active page for injectable forms.', 0, 0)
		await this.loadSettings()
		await this.loadProfiles()
		await this.refreshPageStatus()
		this.setupEventListeners()
	}

	private getElements(): PopupElements {
		return {
			releaseGatePanel: document.getElementById('release-gate-panel')!,
			releaseGateSummary: document.getElementById('release-gate-summary')!,
			releaseGateList: document.getElementById('release-gate-list')!,
			pageStatusPill: document.getElementById('page-status-pill')!,
			pageStatusDetail: document.getElementById('page-status-detail')!,
			formCount: document.getElementById('form-count')!,
			fieldCount: document.getElementById('field-count')!,
			profileSelect: document.getElementById('profile-select') as HTMLSelectElement,
			activeProfileName: document.getElementById('active-profile-name')!,
			activeProfileMeta: document.getElementById('active-profile-meta')!,
			autofillButton: document.getElementById('autofill-page') as HTMLButtonElement,
			reviewButton: document.getElementById('review-fields') as HTMLButtonElement,
			debugToggleButton: document.getElementById('toggle-debug') as HTMLButtonElement,
			refreshButton: document.getElementById('refresh-status') as HTMLButtonElement,
			openOptionsButton: document.getElementById('open-options') as HTMLButtonElement,
			summaryPanel: document.getElementById('summary-panel')!,
			summaryTitle: document.getElementById('summary-title')!,
			summaryHeadline: document.getElementById('summary-headline')!,
			summaryStats: document.getElementById('summary-stats')!,
			summaryIssues: document.getElementById('summary-issues')!,
			debugPanel: document.getElementById('debug-panel')!,
			debugTitle: document.getElementById('debug-title')!,
			debugStatus: document.getElementById('debug-status')!,
			debugList: document.getElementById('debug-list')!,
			toast: document.getElementById('toast')!
		}
	}

	private async loadSettings(): Promise<void> {
		const settings = await this.storage.getSettings()
		this.featureFlags = { ...DEFAULT_FEATURE_FLAGS, ...settings.featureFlags }
		this.debugModeEnabled = settings.debugMode && this.featureFlags.allowDebugTools
		this.renderReleaseGatePanel()
		this.renderDebugToggle()
		this.renderDebugPanel()
	}

	private async loadProfiles(): Promise<void> {
		this.profiles = await this.profileManager.getAllProfiles()
		const defaultProfile = await this.profileManager.getDefaultProfile()
		this.activeProfileId = defaultProfile?.id || this.profiles[0]?.id || ''
		this.renderProfiles()
	}

	private renderProfiles(): void {
		const { profileSelect, activeProfileName, activeProfileMeta } = this.elements
		profileSelect.innerHTML = ''

		if (this.profiles.length === 0) {
			const option = document.createElement('option')
			option.value = ''
			option.textContent = 'No profiles available'
			profileSelect.appendChild(option)
			profileSelect.disabled = true
			activeProfileName.textContent = 'No active profile'
			activeProfileMeta.textContent = 'Open the profile manager to create or import a profile before autofilling.'
			this.updateActionAvailability()
			return
		}

		profileSelect.disabled = false
		this.profiles.forEach(profile => {
			const option = document.createElement('option')
			option.value = profile.id
			option.textContent = profile.isDefault ? `${profile.name} · active` : profile.name
			option.selected = profile.id === this.activeProfileId
			profileSelect.appendChild(option)
		})

		const activeProfile = this.getActiveProfile()
		activeProfileName.textContent = activeProfile?.name || 'No active profile'
		activeProfileMeta.textContent = activeProfile
			? `${this.profiles.length} saved profiles available. Autofill uses this profile unless you switch it below.`
			: 'Open the profile manager to create or import a profile before autofilling.'
		this.updateActionAvailability()
	}

	private setupEventListeners(): void {
		this.elements.autofillButton.addEventListener('click', () => {
			void this.fillPageForms()
		})
		this.elements.reviewButton.addEventListener('click', () => {
			void this.reviewPageFields()
		})
		this.elements.debugToggleButton.addEventListener('click', () => {
			void this.toggleDebugMode()
		})
		this.elements.refreshButton.addEventListener('click', () => {
			void this.refreshPageStatus()
		})
		this.elements.openOptionsButton.addEventListener('click', this.openSettings.bind(this))
		this.elements.profileSelect.addEventListener('change', () => {
			void this.handleProfileSelectionChange()
		})
	}

	private getActiveProfile(): Profile | undefined {
		return this.profiles.find(profile => profile.id === this.activeProfileId)
	}

	private async getActiveTabId(): Promise<number | null> {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
		this.activeTabId = tab?.id ?? null
		this.activeTabUrl = tab?.url ?? ''
		return this.activeTabId
	}

	private isAllowedTestHost(hostname: string): boolean {
		return hostname === 'localhost'
			|| hostname === '127.0.0.1'
			|| RELEASE_ALLOWED_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix))
	}

	private assessActiveEnvironment(): EnvironmentAssessment {
		if (!this.activeTabId) {
			return {
				kind: 'no-tab',
				detail: 'No active tab is available for release-gate checks.',
				tone: 'danger',
				blocksAutofill: true
			}
		}

		if (!this.activeTabUrl) {
			return {
				kind: 'unsupported-scheme',
				detail: `This page does not expose a supported URL. FormFilla only runs on ${RELEASE_BOUNDARY_LABEL}.`,
				tone: 'danger',
				blocksAutofill: true
			}
		}

		let parsedUrl: URL
		try {
			parsedUrl = new URL(this.activeTabUrl)
		} catch {
			return {
				kind: 'unsupported-scheme',
				detail: `This page uses an unsupported URL format. FormFilla only runs on ${RELEASE_BOUNDARY_LABEL}.`,
				tone: 'danger',
				blocksAutofill: true
			}
		}

		if (parsedUrl.protocol === 'file:') {
			if (!this.featureFlags.allowFileFixtures) {
				return {
					kind: 'local-fixture',
					detail: 'Local file fixtures are disabled by rollout settings. Re-enable file fixtures in Options before testing local HTML pages.',
					tone: 'danger',
					blocksAutofill: true
				}
			}

			return {
				kind: 'local-fixture',
				detail: 'Local file fixture mode is enabled. Keep Chrome file URL access limited to disposable fixture pages.',
				tone: 'warning',
				blocksAutofill: false
			}
		}

		if ((parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') && this.isAllowedTestHost(parsedUrl.hostname)) {
			return {
				kind: 'allowed-host',
				detail: `Host ${parsedUrl.hostname} is inside the dev/test allowlist.`,
				tone: 'pass',
				blocksAutofill: false
			}
		}

		if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
			return {
				kind: 'blocked-host',
				detail: `Host ${parsedUrl.hostname} is outside the dev/test allowlist. FormFilla will not inject here.`,
				tone: 'danger',
				blocksAutofill: true
			}
		}

		return {
			kind: 'unsupported-scheme',
			detail: `Scheme ${parsedUrl.protocol} is unsupported. FormFilla only runs on ${RELEASE_BOUNDARY_LABEL}.`,
			tone: 'danger',
			blocksAutofill: true
		}
	}

	private buildReleaseGateState(): { summary: string; items: ReleaseGateItem[]; blocksAutofill: boolean } {
		const environmentGate = this.assessActiveEnvironment()
		const items: ReleaseGateItem[] = [
			{
				label: 'Environment boundary',
				detail: environmentGate.detail,
				tone: environmentGate.tone
			},
			{
				label: 'Debug traces',
				detail: !this.featureFlags.allowDebugTools
					? 'Debug traces are locked off by rollout settings.'
					: this.debugModeEnabled
						? 'Debug mode is on. Traces stay redacted, but leave this off outside active diagnosis.'
						: 'Debug mode is off by default.',
				tone: !this.featureFlags.allowDebugTools || !this.debugModeEnabled ? 'pass' : 'warning'
			},
			{
				label: 'Unsupported widgets',
				detail: 'Low-confidence, mismatched, or unsupported controls stay skipped or move to review instead of being guessed.',
				tone: 'pass'
			}
		]

		const summary = items.some(item => item.tone === 'danger')
			? 'Autofill stays blocked until the failing release gate is cleared.'
			: items.some(item => item.tone === 'warning')
				? 'Autofill is available with caution notes for this page.'
				: 'All release gates are clear for the active page.'

		return {
			summary,
			items,
			blocksAutofill: environmentGate.blocksAutofill
		}
	}

	private renderReleaseGatePanel(): void {
		const gateState = this.buildReleaseGateState()

		if (!this.featureFlags.showReleaseGateChecks) {
			this.elements.releaseGatePanel.hidden = true
			return
		}

		this.elements.releaseGatePanel.hidden = false
		this.elements.releaseGateSummary.textContent = gateState.summary
		this.elements.releaseGateList.innerHTML = ''

		gateState.items.forEach(item => {
			const gate = document.createElement('li')
			gate.className = `gate-item ${item.tone}`

			const heading = document.createElement('strong')
			heading.textContent = item.label

			const detail = document.createElement('span')
			detail.textContent = item.detail

			gate.append(heading, detail)
			this.elements.releaseGateList.appendChild(gate)
		})
	}

	private updateActionAvailability(): void {
		const { blocksAutofill } = this.buildReleaseGateState()
		const canRun = this.pageReadiness === 'ready' && Boolean(this.activeProfileId) && !blocksAutofill
		this.elements.autofillButton.disabled = !canRun
		this.elements.reviewButton.disabled = !canRun
	}

	private getUnavailablePageDetail(environmentGate: EnvironmentAssessment): string {
		switch (environmentGate.kind) {
			case 'no-tab':
				return 'No active tab is available for autofill.'
			case 'blocked-host':
			case 'unsupported-scheme':
				return `FormFilla only runs on ${RELEASE_BOUNDARY_LABEL}.`
			case 'local-fixture':
				return environmentGate.blocksAutofill
					? environmentGate.detail
					: 'Enable file URL access for FormFilla and reload the fixture page if local HTML fixtures are not detected.'
			default:
				return 'FormFilla cannot inspect this page yet. Reload the tab or make sure the content script can run here.'
		}
	}

	private sendFillFormMessage(tabId: number, profileData: ProfileData): Promise<ContentResponseMessage | null> {
		const message: ContentCommandMessage = {
			type: 'fillForm',
			profileData
		}

		return this.sendContentMessage(tabId, message)
	}

	private sendReviewFieldsMessage(tabId: number, profileData: ProfileData): Promise<ContentResponseMessage | null> {
		const message: ContentCommandMessage = {
			type: 'reviewFields',
			profileData
		}

		return this.sendContentMessage(tabId, message)
	}

	private async sendContentMessage(tabId: number, message: ContentCommandMessage): Promise<ContentResponseMessage | null> {
		return new Promise((resolve) => {
			try {
				chrome.tabs.sendMessage(tabId, message, response => {
					if (chrome.runtime.lastError) {
						resolve({ error: chrome.runtime.lastError.message || 'Unable to contact the page' })
						return
					}

					resolve((response ?? null) as ContentResponseMessage | null)
				})
			} catch (error) {
				resolve({ error: error instanceof Error ? error.message : 'Unable to contact the page' })
			}
		})
	}

	private async refreshPageStatus(): Promise<void> {
		const tabId = await this.getActiveTabId()
		const environmentGate = this.assessActiveEnvironment()
		this.renderReleaseGatePanel()

		if (!tabId) {
			this.renderPageStatus('unavailable', this.getUnavailablePageDetail(environmentGate), 0, 0)
			return
		}

		if (environmentGate.blocksAutofill) {
			this.renderPageStatus('unavailable', this.getUnavailablePageDetail(environmentGate), 0, 0)
			return
		}

		const response = await this.sendContentMessage(tabId, { type: 'getFormFields' })
		if (!response || isErrorResponse(response)) {
			this.renderPageStatus(
				'unavailable',
				this.getUnavailablePageDetail(environmentGate),
				0,
				0
			)
			return
		}

		if (!isGetFormFieldsResponse(response)) {
			this.renderPageStatus('unavailable', 'Unexpected page status response.', 0, 0)
			return
		}

		const readiness: PageReadiness = response.formCount > 0 ? 'ready' : 'empty'
		const detail = readiness === 'ready'
			? 'The current page is ready for a one-click autofill run.'
			: 'The current page has no detectable forms yet.'

		this.renderPageStatus(readiness, detail, response.formCount, response.fieldCount)
	}

	private renderPageStatus(readiness: PageReadiness, detail: string, formCount: number, fieldCount: number): void {
		this.pageReadiness = readiness
		this.elements.pageStatusPill.textContent = {
			loading: 'Checking page',
			ready: 'Ready to fill',
			empty: 'No forms detected',
			unavailable: 'Page unavailable'
		}[readiness]
		this.elements.pageStatusPill.className = `status-pill ${readiness}`
		this.elements.pageStatusDetail.textContent = detail
		this.elements.formCount.textContent = String(formCount)
		this.elements.fieldCount.textContent = String(fieldCount)
		this.renderReleaseGatePanel()
		this.updateActionAvailability()
	}

	private async handleProfileSelectionChange(): Promise<void> {
		const selectedProfileId = this.elements.profileSelect.value
		if (!selectedProfileId || selectedProfileId === this.activeProfileId) {
			return
		}

		await this.profileManager.setDefaultProfile(selectedProfileId)
		this.activeProfileId = selectedProfileId
		this.profiles = await this.profileManager.getAllProfiles()
		this.renderProfiles()
		this.showToast('Active profile updated')
	}

	private async fillPageForms(): Promise<void> {
		const activeProfile = this.getActiveProfile()
		if (!activeProfile) {
			this.showToast('Select or create a profile before autofilling.', 'error')
			return
		}

		const tabId = this.activeTabId ?? await this.getActiveTabId()
		if (!tabId) {
			this.showToast('No active tab is available for autofill.', 'error')
			return
		}

		this.elements.autofillButton.disabled = true
		this.elements.reviewButton.disabled = true
		this.elements.autofillButton.textContent = 'Running autofill...'

		const response = await this.sendFillFormMessage(tabId, activeProfile.data)
		this.elements.autofillButton.textContent = 'Autofill Current Page'
		this.updateActionAvailability()

		if (!response || isErrorResponse(response)) {
			this.renderRunSummary([])
			this.showToast(response?.error || 'Autofill could not reach the current page.', 'error')
			return
		}

		if (isFillFormResponse(response)) {
			this.captureDebugTraces('Autofill Trace', this.extractDebugTracesFromResults(response.results))
			this.renderRunSummary(response.results)
			this.showToast('Autofill run completed')
			await this.refreshPageStatus()
		}
	}

	private async reviewPageFields(): Promise<void> {
		const activeProfile = this.getActiveProfile()
		if (!activeProfile) {
			this.showToast('Select or create a profile before reviewing fields.', 'error')
			return
		}

		const tabId = this.activeTabId ?? await this.getActiveTabId()
		if (!tabId) {
			this.showToast('No active tab is available for review.', 'error')
			return
		}

		this.elements.reviewButton.disabled = true
		this.elements.autofillButton.disabled = true
		this.elements.reviewButton.textContent = 'Scanning fields...'

		const response = await this.sendReviewFieldsMessage(tabId, activeProfile.data)
		this.elements.reviewButton.textContent = 'Review Unresolved'
		this.updateActionAvailability()

		if (!response || isErrorResponse(response)) {
			this.showToast(response?.error || 'Field review could not reach the current page.', 'error')
			return
		}

		if (isReviewFieldsResponse(response)) {
			this.captureDebugTraces('Review Trace', this.extractDebugTracesFromReviewItems(response.items))
			this.renderReviewItems(response.items)
			this.showToast(response.items.length > 0 ? 'Review surface updated' : 'No unresolved fields detected')
		}
	}

	private async toggleDebugMode(): Promise<void> {
		if (!this.featureFlags.allowDebugTools) {
			this.showToast('Debug tools are disabled by rollout settings.', 'error')
			return
		}

		const nextState = !this.debugModeEnabled
		await this.storage.saveSettings({ debugMode: nextState })
		this.debugModeEnabled = nextState
		this.renderReleaseGatePanel()
		this.renderDebugToggle()
		this.renderDebugPanel()
		this.showToast(nextState ? 'Debug mode enabled' : 'Debug mode disabled')
	}

	private openSettings(): void {
		chrome.tabs.create({ url: chrome.runtime.getURL('src/options/index.html') })
	}

	private renderRunSummary(results: FillResult[]): void {
		this.elements.summaryPanel.hidden = false
		this.elements.summaryTitle.textContent = 'Last Run'
		const counts = {
			filled: results.filter(result => result.status === 'filled').length,
			review: results.filter(result => result.status === 'review').length,
			skipped: results.filter(result => result.status === 'skipped').length,
			failed: results.filter(result => result.status === 'failed').length
		}

		const total = results.length
		this.elements.summaryHeadline.textContent = total > 0
			? `${counts.filled} of ${total} fields filled`
			: 'No fields were filled'

		this.elements.summaryStats.innerHTML = ''
		;
		[
			['Filled', counts.filled],
			['Review', counts.review],
			['Skipped', counts.skipped],
			['Failed', counts.failed]
		].forEach(([label, value]) => {
			const stat = document.createElement('div')
			stat.className = 'summary-stat'
			stat.innerHTML = `<strong>${value}</strong><span>${label}</span>`
			this.elements.summaryStats.appendChild(stat)
		})

		const unresolved = results.filter(result => result.status !== 'filled')
		this.elements.summaryIssues.innerHTML = ''

		if (unresolved.length === 0 && total > 0) {
			const item = document.createElement('li')
			item.className = 'issue-item success'
			item.textContent = 'All actionable fields filled successfully.'
			this.elements.summaryIssues.appendChild(item)
			return
		}

		if (unresolved.length === 0) {
			const item = document.createElement('li')
			item.className = 'issue-item neutral'
			item.textContent = 'The page responded, but there were no actionable fields in this run.'
			this.elements.summaryIssues.appendChild(item)
			return
		}

		this.renderIssueItems(
			unresolved
				.map(result => result.review)
				.filter((item): item is FieldReviewItem => Boolean(item))
		)

		if (counts.skipped > 0 || counts.failed > 0) {
			this.prependPolicyNotice('Skipped and failed widgets were left untouched. FormFilla does not guess on unsupported controls.')
		}
	}

	private renderReviewItems(items: FieldReviewItem[]): void {
		this.elements.summaryPanel.hidden = false
		this.elements.summaryTitle.textContent = 'Review Surface'
		this.elements.summaryHeadline.textContent = items.length > 0
			? `${items.length} fields need review before autofill`
			: 'No unresolved fields detected in the current scan'

		this.elements.summaryStats.innerHTML = ''
		const counts = {
			review: items.filter(item => item.status === 'review').length,
			skipped: items.filter(item => item.status === 'skipped').length,
			failed: items.filter(item => item.status === 'failed').length,
			previewed: items.filter(item => Boolean(item.selectedValuePreview)).length
		}

		;[
			['Review', counts.review],
			['Skipped', counts.skipped],
			['Failed', counts.failed],
			['Previewed', counts.previewed]
		].forEach(([label, value]) => {
			const stat = document.createElement('div')
			stat.className = 'summary-stat'
			stat.innerHTML = `<strong>${value}</strong><span>${label}</span>`
			this.elements.summaryStats.appendChild(stat)
		})

		this.renderIssueItems(items)

		if (counts.skipped > 0 || counts.failed > 0) {
			this.prependPolicyNotice('Skipped and failed widgets stay visible here so unsupported controls are never filled by guesswork.')
		}
	}

	private prependPolicyNotice(message: string): void {
		const item = document.createElement('li')
		item.className = 'issue-item neutral'
		item.textContent = message
		this.elements.summaryIssues.prepend(item)
	}

	private captureDebugTraces(title: string, traces: FieldDebugTrace[]): void {
		this.lastDebugTitle = title
		this.lastDebugTraces = traces
		this.renderDebugPanel()
	}

	private renderDebugToggle(): void {
		this.elements.debugToggleButton.textContent = !this.featureFlags.allowDebugTools
			? 'Debug Locked'
			: this.debugModeEnabled
				? 'Debug Mode On'
				: 'Debug Mode Off'
		this.elements.debugToggleButton.disabled = !this.featureFlags.allowDebugTools
		this.elements.debugToggleButton.classList.toggle('is-active', this.debugModeEnabled)
	}

	private renderDebugPanel(): void {
		if (!this.featureFlags.allowDebugTools || !this.debugModeEnabled) {
			this.elements.debugPanel.hidden = true
			return
		}

		this.elements.debugPanel.hidden = false
		this.elements.debugTitle.textContent = this.lastDebugTitle
		this.elements.debugList.innerHTML = ''

		if (this.lastDebugTraces.length === 0) {
			this.elements.debugStatus.textContent = 'Run autofill or review unresolved fields to inspect redacted traces.'
			return
		}

		const visibleTraces = this.lastDebugTraces.slice(0, 6)
		this.elements.debugStatus.textContent = visibleTraces.length < this.lastDebugTraces.length
			? `Showing ${visibleTraces.length} of ${this.lastDebugTraces.length} traces.`
			: `${visibleTraces.length} redacted traces captured.`

		visibleTraces.forEach(trace => {
			const card = document.createElement('article')
			card.className = 'trace-card'

			const header = document.createElement('div')
			header.className = 'trace-header'

			const label = document.createElement('strong')
			label.textContent = trace.label

			const badge = document.createElement('span')
			badge.className = 'trace-badge'
			badge.textContent = `${this.formatStatusLabel(trace.status)} · ${trace.confidence.toFixed(2)}`

			header.append(label, badge)

			const meta = document.createElement('div')
			meta.className = 'trace-meta'
			meta.textContent = `Adapter ${trace.adapterId} · ${this.formatConfidenceBand(trace.confidenceBand)} · Retry ${trace.retryAttemptsUsed}/${trace.retryMaxAttempts} ${trace.retryStrategy}`

			const outcome = document.createElement('p')
			outcome.className = 'trace-copy'
			outcome.textContent = trace.outcomeMessage

			card.append(header, meta, outcome)

			const valueRow = document.createElement('div')
			valueRow.className = 'trace-row'
			valueRow.append(
				this.createTracePill(`Planned ${trace.selectedValuePreview || 'n/a'}`),
				this.createTracePill(`Applied ${trace.appliedValuePreview || 'n/a'}`)
			)
			card.appendChild(valueRow)

			if (trace.reasons.length > 0) {
				const reasonsRow = document.createElement('div')
				reasonsRow.className = 'trace-row'
				trace.reasons.slice(0, 4).forEach(reason => {
					reasonsRow.appendChild(this.createTracePill(reason))
				})
				card.appendChild(reasonsRow)
			}

			if (trace.alternatives.length > 0) {
				const alternativesRow = document.createElement('div')
				alternativesRow.className = 'trace-row'
				trace.alternatives.slice(0, 3).forEach(alternative => {
					alternativesRow.appendChild(
						this.createTracePill(`Alt ${this.formatReviewFieldKey(alternative.fieldKey)} ${alternative.confidence.toFixed(2)}`)
					)
				})
				card.appendChild(alternativesRow)
			}

			if (trace.evidence.length > 0) {
				const evidenceRow = document.createElement('div')
				evidenceRow.className = 'trace-row'
				trace.evidence.slice(0, 4).forEach(evidence => {
					evidenceRow.appendChild(
						this.createTracePill(`${this.formatEvidenceSource(evidence.source)}: ${evidence.sample}`)
					)
				})
				card.appendChild(evidenceRow)
			}

			this.elements.debugList.appendChild(card)
		})
	}

	private createTracePill(text: string): HTMLElement {
		const pill = document.createElement('span')
		pill.className = 'trace-pill'
		pill.textContent = text
		return pill
	}

	private extractDebugTracesFromResults(results: FillResult[]): FieldDebugTrace[] {
		return results
			.map(result => result.debug)
			.filter((trace): trace is FieldDebugTrace => Boolean(trace))
	}

	private extractDebugTracesFromReviewItems(items: FieldReviewItem[]): FieldDebugTrace[] {
		return items
			.map(item => item.debug)
			.filter((trace): trace is FieldDebugTrace => Boolean(trace))
	}

	private renderIssueItems(items: FieldReviewItem[]): void {
		this.elements.summaryIssues.innerHTML = ''

		if (items.length === 0) {
			const item = document.createElement('li')
			item.className = 'issue-item success'
			item.textContent = 'All unresolved-field checks came back clear.'
			this.elements.summaryIssues.appendChild(item)
			return
		}

		items.slice(0, 6).forEach(reviewItem => {
			const item = document.createElement('li')
			item.className = `issue-item ${reviewItem.status}`

			const heading = document.createElement('div')
			heading.className = 'issue-heading'

			const label = document.createElement('strong')
			label.textContent = reviewItem.label

			const badge = document.createElement('span')
			badge.className = 'issue-badge'
			badge.textContent = `${this.formatConfidenceBand(reviewItem.confidenceBand)} · ${reviewItem.confidence.toFixed(2)}`

			heading.append(label, badge)

			const inference = document.createElement('span')
			inference.className = 'issue-meta'
			inference.textContent = `Inferred: ${this.formatReviewFieldKey(reviewItem.fieldKey)}`

			const preview = document.createElement('span')
			preview.className = 'issue-meta'
			preview.textContent = reviewItem.selectedValuePreview
				? `Value preview: ${reviewItem.selectedValuePreview}`
				: 'Value preview unavailable for the active profile'

			const message = document.createElement('span')
			message.textContent = reviewItem.message

			item.append(heading, inference, preview, message)
			this.elements.summaryIssues.appendChild(item)
		})
	}

	private formatFieldKey(fieldKey: string): string {
		const segments = fieldKey.split('.')
		const label = segments[segments.length - 1] || fieldKey
		return label
			.replace(/([a-z\d])([A-Z])/g, '$1 $2')
			.replace(/[-_]+/g, ' ')
			.replace(/\b\w/g, character => character.toUpperCase())
	}

	private formatReviewFieldKey(fieldKey: string): string {
		if (fieldKey.startsWith('custom.unresolved')) {
			return 'Unresolved'
		}

		return this.formatFieldKey(fieldKey)
	}

	private formatConfidenceBand(confidenceBand: string): string {
		return confidenceBand
			.replace(/-/g, ' ')
			.replace(/\b\w/g, character => character.toUpperCase())
	}

	private formatStatusLabel(status: string): string {
		return status.replace(/\b\w/g, character => character.toUpperCase())
	}

	private formatEvidenceSource(source: string): string {
		return source
			.replace(/-/g, ' ')
			.replace(/\b\w/g, character => character.toUpperCase())
	}

	private showToast(message: string, type: 'success' | 'error' = 'success'): void {
		this.elements.toast.textContent = message
		this.elements.toast.className = `toast ${type}`
		this.elements.toast.hidden = false

		window.setTimeout(() => {
			this.elements.toast.hidden = true
		}, 2500)
	}
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
	new PopupUI()
})
import { ProfileManager } from '@/lib/profiles'
import { StorageService } from '@/lib/storage'
import {
	type ContentCommandMessage,
	type ContentResponseMessage,
	type FillFormResponseMessage,
	type FillResult,
	type GetFormFieldsResponseMessage,
	type Profile,
	type ProfileData,
	type RuntimeErrorResponse
} from '@/types'

type PageReadiness = 'loading' | 'ready' | 'empty' | 'unavailable'

type PopupElements = {
	pageStatusPill: HTMLElement
	pageStatusDetail: HTMLElement
	formCount: HTMLElement
	fieldCount: HTMLElement
	profileSelect: HTMLSelectElement
	activeProfileName: HTMLElement
	activeProfileMeta: HTMLElement
	autofillButton: HTMLButtonElement
	refreshButton: HTMLButtonElement
	openOptionsButton: HTMLButtonElement
	summaryPanel: HTMLElement
	summaryHeadline: HTMLElement
	summaryStats: HTMLElement
	summaryIssues: HTMLElement
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

class PopupUI {
	private profileManager: ProfileManager
	private elements: PopupElements
	private profiles: Profile[] = []
	private activeProfileId = ''
	private activeTabId: number | null = null
	private pageReadiness: PageReadiness = 'loading'

	constructor() {
		const storage = StorageService.getInstance()
		this.profileManager = new ProfileManager(storage)
		this.elements = this.getElements()
		void this.initialize()
	}

	private async initialize(): Promise<void> {
		this.renderPageStatus('loading', 'Checking the active page for injectable forms.', 0, 0)
		await this.loadProfiles()
		await this.refreshPageStatus()
		this.setupEventListeners()
	}

	private getElements(): PopupElements {
		return {
			pageStatusPill: document.getElementById('page-status-pill')!,
			pageStatusDetail: document.getElementById('page-status-detail')!,
			formCount: document.getElementById('form-count')!,
			fieldCount: document.getElementById('field-count')!,
			profileSelect: document.getElementById('profile-select') as HTMLSelectElement,
			activeProfileName: document.getElementById('active-profile-name')!,
			activeProfileMeta: document.getElementById('active-profile-meta')!,
			autofillButton: document.getElementById('autofill-page') as HTMLButtonElement,
			refreshButton: document.getElementById('refresh-status') as HTMLButtonElement,
			openOptionsButton: document.getElementById('open-options') as HTMLButtonElement,
			summaryPanel: document.getElementById('summary-panel')!,
			summaryHeadline: document.getElementById('summary-headline')!,
			summaryStats: document.getElementById('summary-stats')!,
			summaryIssues: document.getElementById('summary-issues')!,
			toast: document.getElementById('toast')!
		}
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
			this.elements.autofillButton.disabled = true
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
	}

	private setupEventListeners(): void {
		this.elements.autofillButton.addEventListener('click', () => {
			void this.fillPageForms()
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
		return this.activeTabId
	}

	private sendFillFormMessage(tabId: number, profileData: ProfileData): Promise<ContentResponseMessage | null> {
		const message: ContentCommandMessage = {
			type: 'fillForm',
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
		if (!tabId) {
			this.renderPageStatus('unavailable', 'No active tab is available for autofill.', 0, 0)
			return
		}

		const response = await this.sendContentMessage(tabId, { type: 'getFormFields' })
		if (!response || isErrorResponse(response)) {
			this.renderPageStatus(
				'unavailable',
				'FormFilla cannot inspect this page yet. Reload the tab or make sure the content script can run here.',
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
		this.elements.autofillButton.disabled = readiness !== 'ready' || !this.activeProfileId
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
		this.elements.autofillButton.textContent = 'Running autofill...'

		const response = await this.sendFillFormMessage(tabId, activeProfile.data)
		this.elements.autofillButton.textContent = 'Autofill Current Page'
		this.elements.autofillButton.disabled = this.pageReadiness !== 'ready'

		if (!response || isErrorResponse(response)) {
			this.renderSummary([])
			this.showToast(response?.error || 'Autofill could not reach the current page.', 'error')
			return
		}

		if (isFillFormResponse(response)) {
			this.renderSummary(response.results)
			this.showToast('Autofill run completed')
			await this.refreshPageStatus()
		}
	}

	private openSettings(): void {
		chrome.tabs.create({ url: chrome.runtime.getURL('src/options/index.html') })
	}

	private renderSummary(results: FillResult[]): void {
		this.elements.summaryPanel.hidden = false
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

		unresolved.slice(0, 6).forEach(result => {
			const item = document.createElement('li')
			item.className = `issue-item ${result.status}`
			const label = this.formatFieldKey(result.fieldKey)
			item.innerHTML = `<strong>${label}</strong><span>${result.message || result.status}</span>`
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
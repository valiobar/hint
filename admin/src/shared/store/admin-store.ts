import { create } from 'zustand';
import {
	listCompanies,
	createCompany as apiCreateCompany,
	updateWidgetConfig as apiUpdateWidgetConfig,
	listDocuments,
	uploadDocuments as apiUploadDocuments,
	ingestUrls as apiIngestUrls,
	deleteDocument as apiDeleteDocument,
	login as apiLogin,
	register as apiRegister,
	fetchMe,
} from '@/shared/api';
import type { Company, DocumentMeta, Me } from '@/shared/api';
import { toErrorMessage } from '@/shared/lib/error-message';
import {
	clearSession,
	readSession,
	writeSession,
} from '@/shared/lib/auth-storage';

export interface UploadingFile {
	name: string;
	sizeBytes: number;
}

interface AdminState {
	me: Me | null;
	/** Header label. Always `me.email` while a session is loaded. */
	adminEmail: string | null;
	isAuthenticated: boolean;
	isAuthenticating: boolean;
	authError: string | null;
	/** Polar returned `?checkout=success`; checkout polling clears this. */
	checkoutPending: boolean;
	/** Header "Billing" opens the plan screen for a user who already has access. */
	showBilling: boolean;
	companies: Company[];
	isLoadingCompanies: boolean;
	companiesError: string | null;
	selectedCompanyId: string | null;
	documents: DocumentMeta[];
	isLoadingDocuments: boolean;
	documentsError: string | null;
	uploadingFiles: UploadingFile[];
	uploadError: string | null;
	isIngestingUrls: boolean;
	ingestUrlsError: string | null;
	isSavingSuggestedQuestions: boolean;
	suggestedQuestionsError: string | null;
	login: (email: string, password: string) => Promise<void>;
	register: (email: string, password: string) => Promise<void>;
	refreshMe: () => Promise<Me | null>;
	logout: () => void;
	restoreSession: () => Promise<void>;
	loadCompanies: () => Promise<void>;
	createCompany: (name: string) => Promise<void>;
	selectCompany: (companyId: string) => Promise<void>;
	loadDocuments: () => Promise<void>;
	uploadDocuments: (files: File[]) => Promise<void>;
	ingestUrls: (urls: string[]) => Promise<void>;
	deleteDocument: (documentId: string) => Promise<void>;
	updateSuggestedQuestions: (questions: string[]) => Promise<void>;
}

const SUBSCRIPTION_GRANTS_ACCESS: readonly string[] = ['active', 'trialing'];

export const selectNeedsBilling = (s: AdminState): boolean =>
	s.isAuthenticated &&
	s.me?.role !== 'superadmin' &&
	!SUBSCRIPTION_GRANTS_ACCESS.includes(s.me?.subscription_status ?? '');

export const selectCanCreateCompany = (s: AdminState): boolean =>
	(s.me?.limits.max_companies ?? 0) > s.companies.length;

export const selectCanIngestUrls = (s: AdminState): boolean =>
	s.me?.limits.url_ingestion ?? false;

const signedIn = (me: Me) => ({
	me,
	adminEmail: me.email,
	isAuthenticated: true as const,
});

export const useAdminStore = create<AdminState>()((set, get) => ({
	me: null,
	adminEmail: null,
	isAuthenticated: false,
	isAuthenticating: false,
	authError: null,
	checkoutPending: false,
	showBilling: false,
	companies: [],
	isLoadingCompanies: false,
	companiesError: null,
	selectedCompanyId: null,
	documents: [],
	isLoadingDocuments: false,
	documentsError: null,
	uploadingFiles: [],
	uploadError: null,
	isIngestingUrls: false,
	ingestUrlsError: null,
	isSavingSuggestedQuestions: false,
	suggestedQuestionsError: null,

	login: async (email, password) => {
		set({ isAuthenticating: true, authError: null });
		try {
			const res = await apiLogin(email, password);
			writeSession({ token: res.access_token, email: res.email });
			const me = await fetchMe();
			set(signedIn(me));
			await get().loadCompanies();
		} catch (err) {
			set({ authError: toErrorMessage(err) });
		} finally {
			set({ isAuthenticating: false });
		}
	},

	register: async (email, password) => {
		set({ isAuthenticating: true, authError: null });
		try {
			const res = await apiRegister(email, password);
			writeSession({ token: res.access_token, email: res.email });
			const me = await fetchMe();
			set(signedIn(me));
		} catch (err) {
			set({ authError: toErrorMessage(err) });
		} finally {
			set({ isAuthenticating: false });
		}
	},

	refreshMe: async () => {
		try {
			const me = await fetchMe();
			set({ me, adminEmail: me.email });
			return me;
		} catch {
			return null;
		}
	},

	logout: () => {
		clearSession();
		set({
			me: null,
			adminEmail: null,
			isAuthenticated: false,
			authError: null,
			checkoutPending: false,
			showBilling: false,
			companies: [],
			companiesError: null,
			selectedCompanyId: null,
			documents: [],
			documentsError: null,
			uploadingFiles: [],
			uploadError: null,
			isIngestingUrls: false,
			ingestUrlsError: null,
			isSavingSuggestedQuestions: false,
			suggestedQuestionsError: null,
		});
	},

	restoreSession: async () => {
		const session = readSession();
		if (!session) {
			return;
		}
		try {
			const me = await fetchMe();
			set(signedIn(me));
			await get().loadCompanies();
		} catch {
			get().logout();
		}
	},

	loadCompanies: async () => {
		set({ isLoadingCompanies: true, companiesError: null });
		try {
			set({ companies: await listCompanies() });
		} catch (err) {
			set({ companiesError: toErrorMessage(err) });
		} finally {
			set({ isLoadingCompanies: false });
		}
	},

	createCompany: async (name) => {
		const company = await apiCreateCompany(name);
		set((s) => ({ companies: [company, ...s.companies] }));
		await get().selectCompany(company.company_id);
	},

	selectCompany: async (companyId) => {
		set({
			selectedCompanyId: companyId,
			documents: [],
			documentsError: null,
			uploadError: null,
			ingestUrlsError: null,
			suggestedQuestionsError: null,
		});
		await get().loadDocuments();
	},

	loadDocuments: async () => {
		const companyId = get().selectedCompanyId;
		if (!companyId) {
			return;
		}
		set({ isLoadingDocuments: true, documentsError: null });
		try {
			set({ documents: await listDocuments(companyId) });
		} catch (err) {
			set({ documentsError: toErrorMessage(err) });
		} finally {
			set({ isLoadingDocuments: false });
		}
	},

	uploadDocuments: async (files) => {
		const companyId = get().selectedCompanyId;
		if (!companyId || files.length === 0) {
			return;
		}
		set({
			uploadError: null,
			uploadingFiles: files.map((f) => ({
				name: f.name,
				sizeBytes: f.size,
			})),
		});
		try {
			await apiUploadDocuments(companyId, files);
			await get().loadDocuments();
		} catch (err) {
			set({ uploadError: toErrorMessage(err) });
		} finally {
			set({ uploadingFiles: [] });
		}
	},

	ingestUrls: async (urls) => {
		const companyId = get().selectedCompanyId;
		if (!companyId || urls.length === 0) {
			return;
		}
		set({ isIngestingUrls: true, ingestUrlsError: null });
		try {
			await apiIngestUrls(companyId, urls);
			await get().loadDocuments();
		} catch (err) {
			set({ ingestUrlsError: toErrorMessage(err) });
		} finally {
			set({ isIngestingUrls: false });
		}
	},

	deleteDocument: async (documentId) => {
		const companyId = get().selectedCompanyId;
		if (!companyId) {
			return;
		}
		try {
			await apiDeleteDocument(companyId, documentId);
			set((s) => ({
				documents: s.documents.filter((d) => d.document_id !== documentId),
			}));
		} catch (err) {
			set({ documentsError: toErrorMessage(err) });
		}
	},

	updateSuggestedQuestions: async (questions) => {
		const companyId = get().selectedCompanyId;
		if (!companyId) {
			return;
		}
		set({
			isSavingSuggestedQuestions: true,
			suggestedQuestionsError: null,
		});
		try {
			const updated = await apiUpdateWidgetConfig(companyId, questions);
			set((s) => ({
				companies: s.companies.map((c) =>
					c.company_id === updated.company_id
						? {
								...updated,
								suggested_questions:
									updated.suggested_questions ?? [],
							}
						: c,
				),
			}));
		} catch (err) {
			set({ suggestedQuestionsError: toErrorMessage(err) });
		} finally {
			set({ isSavingSuggestedQuestions: false });
		}
	},
}));

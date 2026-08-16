import { create } from 'zustand';
import {
	listCompanies,
	createCompany as apiCreateCompany,
	updateWidgetConfig as apiUpdateWidgetConfig,
	listDocuments,
	uploadDocuments as apiUploadDocuments,
	deleteDocument as apiDeleteDocument,
	login as apiLogin,
	fetchMe,
} from '@/shared/api';
import type { Company, DocumentMeta } from '@/shared/api';
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
	adminEmail: string | null;
	isAuthenticated: boolean;
	isAuthenticating: boolean;
	authError: string | null;
	companies: Company[];
	isLoadingCompanies: boolean;
	companiesError: string | null;
	selectedCompanyId: string | null;
	documents: DocumentMeta[];
	isLoadingDocuments: boolean;
	documentsError: string | null;
	uploadingFiles: UploadingFile[];
	uploadError: string | null;
	isSavingSuggestedQuestions: boolean;
	suggestedQuestionsError: string | null;
	login: (email: string, password: string) => Promise<void>;
	logout: () => void;
	restoreSession: () => Promise<void>;
	loadCompanies: () => Promise<void>;
	createCompany: (name: string) => Promise<void>;
	selectCompany: (companyId: string) => Promise<void>;
	loadDocuments: () => Promise<void>;
	uploadDocuments: (files: File[]) => Promise<void>;
	deleteDocument: (documentId: string) => Promise<void>;
	updateSuggestedQuestions: (questions: string[]) => Promise<void>;
}

export const useAdminStore = create<AdminState>()((set, get) => ({
	adminEmail: null,
	isAuthenticated: false,
	isAuthenticating: false,
	authError: null,
	companies: [],
	isLoadingCompanies: false,
	companiesError: null,
	selectedCompanyId: null,
	documents: [],
	isLoadingDocuments: false,
	documentsError: null,
	uploadingFiles: [],
	uploadError: null,
	isSavingSuggestedQuestions: false,
	suggestedQuestionsError: null,

	login: async (email, password) => {
		set({ isAuthenticating: true, authError: null });
		try {
			const res = await apiLogin(email, password);
			writeSession({ token: res.access_token, email: res.email });
			set({ adminEmail: res.email, isAuthenticated: true });
			await get().loadCompanies();
		} catch (err) {
			set({ authError: toErrorMessage(err) });
		} finally {
			set({ isAuthenticating: false });
		}
	},

	logout: () => {
		clearSession();
		set({
			adminEmail: null,
			isAuthenticated: false,
			authError: null,
			companies: [],
			companiesError: null,
			selectedCompanyId: null,
			documents: [],
			documentsError: null,
			uploadingFiles: [],
			uploadError: null,
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
			const admin = await fetchMe();
			set({ adminEmail: admin.email, isAuthenticated: true });
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

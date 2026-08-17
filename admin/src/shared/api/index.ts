export { ApiError, request, setUnauthorizedHandler } from '@/shared/api/http';
export type {
	Company,
	DocumentMeta,
	DocumentStatus,
	SourceType,
} from '@/shared/api/types';
export type { AdminUser, LoginResponse } from '@/shared/api/auth';
export { login, fetchMe } from '@/shared/api/auth';
export {
	listCompanies,
	createCompany,
	updateWidgetConfig,
} from '@/shared/api/companies';
export {
	listDocuments,
	uploadDocuments,
	deleteDocument,
	ingestUrls,
} from '@/shared/api/documents';

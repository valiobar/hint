export { ApiError, request, setUnauthorizedHandler } from '@/shared/api/http';
export type { Company, DocumentMeta, DocumentStatus } from '@/shared/api/types';
export type { AdminUser, LoginResponse } from '@/shared/api/auth';
export { login, fetchMe } from '@/shared/api/auth';
export { listCompanies, createCompany } from '@/shared/api/companies';
export {
	listDocuments,
	uploadDocuments,
	deleteDocument,
} from '@/shared/api/documents';

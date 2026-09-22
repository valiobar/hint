export { ApiError, request, setUnauthorizedHandler } from '@/shared/api/http';
export type {
	Company,
	DocumentMeta,
	DocumentStatus,
	SourceType,
} from '@/shared/api/types';
export type {
	LoginResponse,
	Me,
	Plan,
	PlanLimits,
	Role,
	SubscriptionStatus,
} from '@/shared/api/auth';
export { fetchMe, googleLoginUrl, login, register } from '@/shared/api/auth';
export { createCheckout, getPortalUrl } from '@/shared/api/billing';
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

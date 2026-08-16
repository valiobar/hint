import { request } from '@/shared/api/http';
import type { Company } from '@/shared/api/types';

export const listCompanies = (): Promise<Company[]> =>
	request<Company[]>('/api/v1/companies');

export const createCompany = (name: string): Promise<Company> =>
	request<Company>('/api/v1/companies', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name }),
	});

export const updateWidgetConfig = (
	companyId: string,
	suggestedQuestions: string[],
): Promise<Company> =>
	request<Company>(
		`/api/v1/companies/${companyId}/widget-config`,
		{
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				suggested_questions: suggestedQuestions,
			}),
		},
	);

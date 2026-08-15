import { request } from '@/shared/api/http';
import type { DocumentMeta } from '@/shared/api/types';

export const listDocuments = (companyId: string): Promise<DocumentMeta[]> =>
	request<DocumentMeta[]>(`/api/v1/companies/${companyId}/documents`);

export const uploadDocuments = (
	companyId: string,
	files: File[],
): Promise<DocumentMeta[]> => {
	const form = new FormData();
	files.forEach((file) => form.append('files', file));
	return request<DocumentMeta[]>(
		`/api/v1/companies/${companyId}/documents`,
		{ method: 'POST', body: form },
	);
};

export const deleteDocument = (
	companyId: string,
	documentId: string,
): Promise<void> =>
	request<void>(
		`/api/v1/companies/${companyId}/documents/${documentId}`,
		{ method: 'DELETE' },
	);

export interface Company {
	company_id: string;
	name: string;
	created_at: string;
}

export type DocumentStatus = 'processing' | 'ready' | 'failed';

export interface DocumentMeta {
	document_id: string;
	company_id: string;
	filename: string;
	size_bytes: number;
	chunk_count: number;
	status: DocumentStatus;
	error: string | null;
	created_at: string;
}

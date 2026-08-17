export interface Company {
	company_id: string;
	name: string;
	created_at: string;
	suggested_questions: string[];
}

export type DocumentStatus = 'processing' | 'ready' | 'failed';

export type SourceType = 'file' | 'url';

export interface DocumentMeta {
	document_id: string;
	company_id: string;
	filename: string;
	size_bytes: number;
	chunk_count: number;
	status: DocumentStatus;
	source_type: SourceType;
	source_url: string | null;
	error: string | null;
	created_at: string;
}

import type { ReactNode } from 'react';
import type { DocumentMeta } from '@/shared/api';
import { StatusPill } from '@/shared/ui';
import { formatBytes } from '@/shared/lib/format-bytes';
import styles from './document-row.module.css';

interface DocumentRowProps {
	document: DocumentMeta;
	actions?: ReactNode;
}

export const DocumentRow = ({ document, actions }: DocumentRowProps) => (
	<li className={styles.row} data-testid={`document-row-${document.document_id}`}>
		<div className={styles.main}>
			<span className={styles.filename}>{document.filename}</span>
			{document.source_type === 'url' && document.source_url && (
				<a
					className={styles.sourceUrl}
					href={document.source_url}
					target="_blank"
					rel="noopener noreferrer"
					data-testid={`document-source-url-${document.document_id}`}
				>
					{document.source_url}
				</a>
			)}
			<span className={styles.meta}>
				{formatBytes(document.size_bytes)} · {document.chunk_count} chunks
			</span>
			{document.status === 'failed' && document.error && (
				<span className={styles.error}>{document.error}</span>
			)}
		</div>
		<StatusPill status={document.status} />
		{actions}
	</li>
);

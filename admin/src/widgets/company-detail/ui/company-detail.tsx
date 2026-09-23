import { useShallow } from 'zustand/react/shallow';
import { DocumentRow } from '@/entities/document';
import { DeleteDocumentButton } from '@/features/delete-document';
import { EmbedSnippet } from '@/features/copy-embed-snippet';
import { SuggestedQuestionsForm } from '@/features/edit-suggested-questions';
import { FileDropzone } from '@/features/upload-documents';
import { UrlSourceForm } from '@/features/add-url-source';
import {
	selectCanIngestUrls,
	useAdminStore,
} from '@/shared/store/admin-store';
import { Button, EmptyState, Spinner, StatusPill } from '@/shared/ui';
import { formatBytes } from '@/shared/lib/format-bytes';
import styles from './company-detail.module.css';

export const CompanyDetail = () => {
	const {
		company,
		documents,
		isLoadingDocuments,
		documentsError,
		uploadingFiles,
	} = useAdminStore(
		useShallow((s) => ({
			company:
				s.companies.find((c) => c.company_id === s.selectedCompanyId) ??
				null,
			documents: s.documents,
			isLoadingDocuments: s.isLoadingDocuments,
			documentsError: s.documentsError,
			uploadingFiles: s.uploadingFiles,
		})),
	);
	const canIngestUrls = useAdminStore(selectCanIngestUrls);

	if (!company) {
		return null;
	}

	const hasDocuments = documents.length > 0 || uploadingFiles.length > 0;

	return (
		<section className={styles.detail} data-testid="company-detail">
			<header className={styles.header}>
				<p className={styles.kicker}>Knowledge base</p>
				<h2>{company.name}</h2>
				<code>{company.company_id}</code>
			</header>
			<div className={styles.card}>
				<EmbedSnippet companyId={company.company_id} />
			</div>
			<div className={styles.card}>
				<SuggestedQuestionsForm />
			</div>
			<div className={styles.card}>
				<h3>Documents</h3>
				<p className={styles.hint}>
					Upload product docs or paste support-page URLs. Ready rows
					ground chat, hover hints, and walkthroughs for this company.
				</p>
				<FileDropzone />
				{canIngestUrls ? (
					<UrlSourceForm />
				) : (
					<div className={styles.proHint} data-testid="url-pro-hint">
						<p>
							URL ingestion is a <strong>Pro</strong> feature.
						</p>
						<Button
							variant="ghost"
							onClick={() =>
								useAdminStore.setState({ showBilling: true })
							}
						>
							Upgrade
						</Button>
					</div>
				)}
				{isLoadingDocuments && <Spinner />}
				{documentsError && (
					<p className={styles.error} role="alert">
						{documentsError}
					</p>
				)}
				<ul className={styles.documents}>
					{uploadingFiles.map((file) => (
						<li key={file.name} className={styles.uploadingRow}>
							<span>{file.name}</span>
							<span>{formatBytes(file.sizeBytes)}</span>
							<StatusPill status="uploading" />
						</li>
					))}
					{documents.map((doc) => (
						<DocumentRow
							key={doc.document_id}
							document={doc}
							actions={
								<DeleteDocumentButton
									documentId={doc.document_id}
									filename={doc.filename}
								/>
							}
						/>
					))}
				</ul>
				{!isLoadingDocuments && !hasDocuments && (
					<EmptyState title="No documents yet">
						Drop the product docs above.
					</EmptyState>
				)}
			</div>
		</section>
	);
};

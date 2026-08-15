import { useShallow } from 'zustand/react/shallow';
import { DocumentRow } from '@/entities/document';
import { DeleteDocumentButton } from '@/features/delete-document';
import { EmbedSnippet } from '@/features/copy-embed-snippet';
import { FileDropzone } from '@/features/upload-documents';
import { useAdminStore } from '@/shared/store/admin-store';
import { Spinner, StatusPill } from '@/shared/ui';
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

	if (!company) {
		return null;
	}

	return (
		<section className={styles.detail} data-testid="company-detail">
			<header className={styles.header}>
				<h2>{company.name}</h2>
				<code>{company.company_id}</code>
			</header>
			<EmbedSnippet companyId={company.company_id} />
			<h3>Documents</h3>
			<FileDropzone />
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
			{!isLoadingDocuments &&
				documents.length === 0 &&
				uploadingFiles.length === 0 && (
					<p className={styles.empty}>
						No documents yet — drop the product docs above.
					</p>
				)}
		</section>
	);
};

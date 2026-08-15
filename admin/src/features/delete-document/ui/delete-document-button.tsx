import { useAdminStore } from '@/shared/store/admin-store';
import styles from './delete-document-button.module.css';

interface DeleteDocumentButtonProps {
	documentId: string;
	filename: string;
}

export const DeleteDocumentButton = ({
	documentId,
	filename,
}: DeleteDocumentButtonProps) => {
	const deleteDocument = useAdminStore((s) => s.deleteDocument);

	const handleDelete = async () => {
		if (window.confirm(`Delete "${filename}" and its knowledge-base chunks?`)) {
			await deleteDocument(documentId);
		}
	};

	return (
		<button
			type="button"
			className={styles.button}
			onClick={handleDelete}
			aria-label={`Delete ${filename}`}
			data-testid={`delete-document-${documentId}`}
		>
			Delete
		</button>
	);
};

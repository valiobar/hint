import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react';
import { useAdminStore } from '@/shared/store/admin-store';
import {
	ACCEPT_ATTRIBUTE,
	type RejectedFile,
	validateFiles,
} from '../lib/validate-files';
import styles from './file-dropzone.module.css';

export const FileDropzone = () => {
	const uploadDocuments = useAdminStore((s) => s.uploadDocuments);
	const uploadError = useAdminStore((s) => s.uploadError);
	const inputRef = useRef<HTMLInputElement>(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const [rejected, setRejected] = useState<RejectedFile[]>([]);

	const handleFiles = async (files: File[]) => {
		const result = validateFiles(files);
		setRejected(result.rejected);
		if (result.valid.length > 0) {
			await uploadDocuments(result.valid);
		}
	};

	const handleDrop = async (event: DragEvent) => {
		event.preventDefault();
		setIsDragOver(false);
		await handleFiles([...event.dataTransfer.files]);
	};

	const handleInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
		await handleFiles([...(event.target.files ?? [])]);
		event.target.value = '';
	};

	const handleDragOver = (event: DragEvent) => {
		event.preventDefault();
		setIsDragOver(true);
	};

	const handleBrowseClick = () => {
		inputRef.current?.click();
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleBrowseClick();
		}
	};

	return (
		<div className={styles.container}>
			<div
				className={isDragOver ? styles.zoneActive : styles.zone}
				onDragOver={handleDragOver}
				onDragLeave={() => setIsDragOver(false)}
				onDrop={handleDrop}
				onClick={handleBrowseClick}
				onKeyDown={handleKeyDown}
				role="button"
				tabIndex={0}
				aria-label="Upload documents"
				data-testid="file-dropzone"
			>
				Drop files here or click to browse (pdf, md, txt, html · max 10 MB)
			</div>
			<input
				ref={inputRef}
				type="file"
				multiple
				accept={ACCEPT_ATTRIBUTE}
				className={styles.hiddenInput}
				onChange={handleInputChange}
			/>
			{rejected.map((r) => (
				<p key={r.name} className={styles.rejected} role="alert">
					{r.name}: {r.reason}
				</p>
			))}
			{uploadError && (
				<p className={styles.rejected} role="alert">
					{uploadError}
				</p>
			)}
		</div>
	);
};

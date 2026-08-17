import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useAdminStore } from '@/shared/store/admin-store';
import { Button } from '@/shared/ui';
import { validateUrls, type RejectedUrl } from '../lib/validate-urls';
import styles from './url-source-form.module.css';

export const UrlSourceForm = () => {
	const ingestUrls = useAdminStore((s) => s.ingestUrls);
	const isIngestingUrls = useAdminStore((s) => s.isIngestingUrls);
	const ingestUrlsError = useAdminStore((s) => s.ingestUrlsError);
	const [input, setInput] = useState('');
	const [rejected, setRejected] = useState<RejectedUrl[]>([]);

	const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
		setInput(event.target.value);
	};

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		const result = validateUrls(input);
		setRejected(result.rejected);
		if (result.valid.length === 0) {
			return;
		}
		await ingestUrls(result.valid);
		setInput('');
	};

	return (
		<form
			className={styles.form}
			onSubmit={handleSubmit}
			data-testid="url-source-form"
		>
			<p className={styles.hint}>
				Paste support page URLs, one per line (http/https, max 20).
			</p>
			<textarea
				className={styles.textarea}
				value={input}
				onChange={handleChange}
				placeholder={
					'https://support.example.com/article-1\nOne URL per line'
				}
				aria-label="Support page URLs"
			/>
			<Button
				type="submit"
				disabled={isIngestingUrls || !input.trim()}
			>
				{isIngestingUrls ? 'Ingesting…' : 'Add URLs'}
			</Button>
			{rejected.map((r) => (
				<p key={r.value} className={styles.rejected} role="alert">
					{r.value}: {r.reason}
				</p>
			))}
			{ingestUrlsError && (
				<p className={styles.rejected} role="alert">
					{ingestUrlsError}
				</p>
			)}
		</form>
	);
};

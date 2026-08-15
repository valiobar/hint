import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAdminStore } from '@/shared/store/admin-store';
import { toErrorMessage } from '@/shared/lib/error-message';
import { Button, TextInput } from '@/shared/ui';
import { createCompanySchema } from '../model/schema';
import styles from './create-company-form.module.css';

export const CreateCompanyForm = () => {
	const createCompany = useAdminStore((s) => s.createCompany);
	const [name, setName] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		const parsed = createCompanySchema.safeParse({ name });
		if (!parsed.success) {
			setError(parsed.error.issues[0].message);
			return;
		}
		setError(null);
		setIsSubmitting(true);
		try {
			await createCompany(parsed.data.name);
			setName('');
		} catch (err) {
			setError(toErrorMessage(err));
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<form
			className={styles.form}
			onSubmit={handleSubmit}
			data-testid="create-company-form"
		>
			<TextInput
				value={name}
				onChange={setName}
				placeholder="Company name"
				aria-label="Company name"
			/>
			<Button type="submit" disabled={isSubmitting}>
				{isSubmitting ? 'Creating…' : 'Create company'}
			</Button>
			{error && (
				<p className={styles.error} role="alert">
					{error}
				</p>
			)}
		</form>
	);
};

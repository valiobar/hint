import { useEffect, useState } from 'react';
import { useAdminStore } from '@/shared/store/admin-store';
import { Button, TextInput } from '@/shared/ui';
import { suggestedQuestionsSchema } from '../model/schema';
import styles from './suggested-questions-form.module.css';

const EMPTY_DRAFT = ['', '', '', ''];

export const SuggestedQuestionsForm = () => {
	const company = useAdminStore((s) =>
		s.companies.find((c) => c.company_id === s.selectedCompanyId),
	);
	const save = useAdminStore((s) => s.updateSuggestedQuestions);
	const isSaving = useAdminStore((s) => s.isSavingSuggestedQuestions);
	const error = useAdminStore((s) => s.suggestedQuestionsError);
	const [draft, setDraft] = useState([...EMPTY_DRAFT]);
	const [validationError, setValidationError] = useState<string | null>(
		null,
	);

	useEffect(() => {
		const existing = company?.suggested_questions ?? [];
		setDraft([
			existing[0] ?? '',
			existing[1] ?? '',
			existing[2] ?? '',
			existing[3] ?? '',
		]);
		setValidationError(null);
	}, [company?.company_id, company?.suggested_questions]);

	const handleQuestionChange = (index: number, next: string) => {
		setDraft((current) => {
			const copy = [...current];
			copy[index] = next;
			return copy;
		});
	};

	const handleSubmit = async () => {
		const parsed = suggestedQuestionsSchema.safeParse({
			questions: draft,
		});
		if (!parsed.success) {
			setValidationError(parsed.error.issues[0].message);
			return;
		}
		setValidationError(null);
		await save(parsed.data.questions);
	};

	const displayedError = validationError ?? error;

	return (
		<section
			className={styles.section}
			data-testid="suggested-questions-form"
		>
			<h3>Starter questions</h3>
			<p className={styles.hint}>
				Shown as chips when the widget chat is empty (max 4).
			</p>
			<div className={styles.fields}>
				{draft.map((value, index) => (
					<TextInput
						key={index}
						value={value}
						onChange={(next) => {
							handleQuestionChange(index, next);
						}}
						aria-label={`Starter question ${index + 1}`}
						placeholder="How do I …"
					/>
				))}
			</div>
			{displayedError && (
				<p className={styles.error} role="alert">
					{displayedError}
				</p>
			)}
			<Button
				onClick={() => {
					void handleSubmit();
				}}
				disabled={isSaving}
			>
				{isSaving ? 'Saving…' : 'Save questions'}
			</Button>
		</section>
	);
};

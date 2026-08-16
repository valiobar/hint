import { useEffect, useState } from 'react';
import { fetchSuggestedQuestions } from '@/features/suggested-questions/lib/fetch-widget-config';
import { useHintStore } from '@/shared/store/hint-store';
import styles from '@/features/suggested-questions/ui/suggested-questions.module.css';

export const SuggestedQuestions = () => {
	const sendMessage = useHintStore((s) => s.sendMessage);
	const isStreaming = useHintStore((s) => s.isStreaming);
	const isDisabled = useHintStore((s) => s.isDisabled);
	const [questions, setQuestions] = useState<string[]>([]);

	useEffect(() => {
		let cancelled = false;
		void fetchSuggestedQuestions().then((next) => {
			if (!cancelled) {
				setQuestions(next);
			}
		});
		return () => {
			cancelled = true;
		};
	}, []);

	if (questions.length === 0) {
		return null;
	}

	return (
		<ul
			className={styles.list}
			data-testid="suggested-questions"
		>
			{questions.map((question) => (
				<li key={question}>
					<button
						type="button"
						className={styles.chip}
						disabled={isStreaming || isDisabled}
						onClick={() => {
							void sendMessage(question);
						}}
						data-testid="suggested-question"
					>
						{question}
					</button>
				</li>
			))}
		</ul>
	);
};

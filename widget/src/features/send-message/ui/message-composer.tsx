import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useHintStore } from '@/shared/store/hint-store';
import { SendIcon } from '@/shared/ui/icons';
import styles from '@/features/send-message/ui/message-composer.module.css';

export const MessageComposer = () => {
	const [draft, setDraft] = useState('');
	const sendMessage = useHintStore((s) => s.sendMessage);
	const isStreaming = useHintStore((s) => s.isStreaming);
	const isDisabled = useHintStore((s) => s.isDisabled);
	const canSend =
		!isStreaming && !isDisabled && draft.trim().length > 0;

	const handleSend = () => {
		if (!canSend) {
			return;
		}
		void sendMessage(draft);
		setDraft('');
	};

	const handleKeyDown = (
		event: KeyboardEvent<HTMLTextAreaElement>,
	) => {
		event.stopPropagation();
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSend();
		}
	};

	return (
		<div className={styles.composer}>
			<textarea
				className={styles.input}
				value={draft}
				placeholder={
					isDisabled
						? 'Hint is not configured'
						: 'How do I…?'
				}
				rows={1}
				disabled={isDisabled}
				onChange={(e) => setDraft(e.target.value)}
				onKeyDown={handleKeyDown}
				aria-label="Ask Hint a question"
				data-testid="composer-input"
			/>
			<button
				type="button"
				className={styles.sendButton}
				onClick={handleSend}
				disabled={!canSend}
				aria-label="Send message"
				data-testid="composer-send"
			>
				<SendIcon />
			</button>
		</div>
	);
};

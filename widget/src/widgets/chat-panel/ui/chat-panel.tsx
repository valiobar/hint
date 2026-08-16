import { type AnimationEvent } from 'react';
import { MessageComposer } from '@/features/send-message';
import { useHintStore } from '@/shared/store/hint-store';
import { CloseIcon } from '@/shared/ui/icons';
import { MessageList } from '@/widgets/chat-panel/ui/message-list';
import styles from '@/widgets/chat-panel/ui/chat-panel.module.css';

interface ChatPanelProps {
	isClosing?: boolean;
	onExitEnd?: () => void;
}

export const ChatPanel = ({ isClosing, onExitEnd }: ChatPanelProps) => {
	const closePanel = useHintStore((s) => s.closePanel);
	const chatError = useHintStore((s) => s.chatError);

	const handleAnimationEnd = (event: AnimationEvent) => {
		// Child animations (bubbles, typing dots) bubble up — only the
		// panel's own closing animation should trigger the unmount.
		if (isClosing && event.target === event.currentTarget) {
			onExitEnd && onExitEnd();
		}
	};

	return (
		<section
			className={
				`${styles.panel} ${isClosing ? styles.closing : ''}`
			}
			onAnimationEnd={handleAnimationEnd}
			role="dialog"
			aria-label="Hint assistant"
			data-testid="chat-panel"
		>
			<header className={styles.header}>
				<span className={styles.title}>Hint</span>
				<button
					type="button"
					onClick={closePanel}
					aria-label="Close"
					data-testid="chat-panel-close"
				>
					<CloseIcon />
				</button>
			</header>
			<MessageList />
			{chatError && (
				<p className={styles.error} role="alert">
					{chatError}
				</p>
			)}
			<MessageComposer />
		</section>
	);
};

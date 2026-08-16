import { type AnimationEvent, type CSSProperties } from 'react';
import { MessageComposer } from '@/features/send-message';
import { useHintStore } from '@/shared/store/hint-store';
import { CloseIcon, NewChatIcon } from '@/shared/ui/icons';
import { MessageList } from '@/widgets/chat-panel/ui/message-list';
import styles from '@/widgets/chat-panel/ui/chat-panel.module.css';

interface ChatPanelProps {
	isClosing?: boolean;
	onExitEnd?: () => void;
}

export const ChatPanel = ({ isClosing, onExitEnd }: ChatPanelProps) => {
	const closePanel = useHintStore((s) => s.closePanel);
	const clearMessages = useHintStore((s) => s.clearMessages);
	const isStreaming = useHintStore((s) => s.isStreaming);
	const hasMessages = useHintStore((s) => s.messages.length > 0);
	const chatError = useHintStore((s) => s.chatError);
	const dockSide = useHintStore((s) => s.dockSide);
	const dockTopFraction = useHintStore((s) => s.dockTopFraction);

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
				`${styles.panel} ` +
				`${dockSide === 'left' ? styles.dockLeft : styles.dockRight} ` +
				`${isClosing ? styles.closing : ''}`
			}
			style={
				{
					'--panel-dock-fraction': dockTopFraction,
				} as CSSProperties
			}
			onAnimationEnd={handleAnimationEnd}
			role="dialog"
			aria-label="Hint assistant"
			data-testid="chat-panel"
		>
			<header className={styles.header}>
				<span className={styles.title}>Hint</span>
				<div className={styles.headerActions}>
					<button
						type="button"
						onClick={clearMessages}
						disabled={isStreaming || !hasMessages}
						aria-label="New chat"
						data-testid="chat-panel-new-chat"
					>
						<NewChatIcon />
					</button>
					<button
						type="button"
						className={styles.closeButton}
						onClick={closePanel}
						aria-label="Close"
						data-testid="chat-panel-close"
					>
						<CloseIcon />
					</button>
				</div>
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

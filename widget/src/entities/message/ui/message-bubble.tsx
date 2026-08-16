import type { ReactNode } from 'react';
import styles from '@/entities/message/ui/message-bubble.module.css';

interface MessageBubbleProps {
	role: 'user' | 'assistant';
	isFailed?: boolean;
	isPending?: boolean;
	isStreaming?: boolean;
	sources?: string[];
	children: ReactNode;
}

export const MessageBubble = ({
	role,
	isFailed,
	isPending,
	isStreaming,
	sources,
	children,
}: MessageBubbleProps) => (
	<div
		className={`${styles.bubble} ${styles[role]} ${isFailed ? styles.failed : ''}`}
		data-testid={`message-${role}`}
	>
		<div className={styles.content}>
			{isPending ? (
				<span
					className={styles.typing}
					aria-label="Thinking"
					data-testid="typing-indicator"
				>
					<span className={styles.typingDot} />
					<span className={styles.typingDot} />
					<span className={styles.typingDot} />
				</span>
			) : (
				<>
					{children}
					{isStreaming && (
						<span
							className={styles.caret}
							aria-hidden="true"
						/>
					)}
				</>
			)}
		</div>
		{isFailed && (
			<p className={styles.failedNote} role="alert">
				This answer failed to load. Try again.
			</p>
		)}
		{sources && sources.length > 0 && (
			<p className={styles.sources} data-testid="message-sources">
				From: {sources.join(', ')}
			</p>
		)}
	</div>
);

import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { useCopyToClipboard } from '@/shared/lib/use-copy-to-clipboard';
import { CheckIcon, CopyIcon } from '@/shared/ui/icons';
import styles from '@/entities/message/ui/message-bubble.module.css';

interface MessageBubbleProps {
	role: 'user' | 'assistant';
	isFailed?: boolean;
	isPending?: boolean;
	isStreaming?: boolean;
	sources?: string[];
	copyText?: string;
	children: ReactNode;
}

const isUrlSource = (source: string): boolean =>
	source.startsWith('http://') || source.startsWith('https://');

const formatSourceLabel = (source: string): string => {
	try {
		const parsed = new URL(source);
		return `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
	} catch {
		return source;
	}
};

export const MessageBubble = ({
	role,
	isFailed,
	isPending,
	isStreaming,
	sources,
	copyText,
	children,
}: MessageBubbleProps) => {
	const { isCopied, copy } = useCopyToClipboard();

	const handleCopyClick = useCallback(() => {
		copyText && copy(copyText);
	}, [copy, copyText]);

	return (
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
					From:{' '}
					{sources.map((source, index) => (
						<span key={source}>
							{index > 0 && ', '}
							{isUrlSource(source) ? (
								<a
									href={source}
									target="_blank"
									rel="noopener noreferrer"
									className={styles.sourceLink}
									data-testid="message-source-link"
								>
									{formatSourceLabel(source)}
								</a>
							) : (
								source
							)}
						</span>
					))}
				</p>
			)}
			{copyText && (
				<button
					type="button"
					className={styles.copyButton}
					onClick={handleCopyClick}
					aria-label={isCopied ? 'Copied' : 'Copy answer'}
					data-testid="message-copy"
				>
					{isCopied ? (
						<CheckIcon size={14} />
					) : (
						<CopyIcon size={14} />
					)}
					<span>{isCopied ? 'Copied' : 'Copy'}</span>
				</button>
			)}
		</div>
	);
};

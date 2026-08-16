import { Fragment, useEffect, useRef } from 'react';
import { MessageBubble } from '@/entities/message';
import { renderWithElementChips } from '@/features/locate-element';
import {
	parseWalkthroughSteps,
	WalkthroughStartButton,
} from '@/features/walkthrough';
import { useHintStore } from '@/shared/store/hint-store';
import { MarkdownContent } from '@/shared/ui/markdown';
import styles from '@/widgets/chat-panel/ui/chat-panel.module.css';

export const MessageList = () => {
	const messages = useHintStore((s) => s.messages);
	const isStreaming = useHintStore((s) => s.isStreaming);
	const scrollRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		scrollRef.current?.scrollTo({
			top: scrollRef.current.scrollHeight,
			behavior: 'smooth',
		});
	}, [messages]);

	if (messages.length === 0) {
		return (
			<div
				className={styles.empty}
				data-testid="chat-empty-state"
			>
				<p>
					Ask anything about this app — answers come from
					the product docs.
				</p>
			</div>
		);
	}

	return (
		<div
			ref={scrollRef}
			className={styles.list}
			data-testid="message-list"
		>
			{messages.map((message, index) => {
				const isCompletedAssistant =
					message.role === 'assistant' &&
					!message.isFailed &&
					message.content !== '' &&
					!(isStreaming && index === messages.length - 1);
				const steps = isCompletedAssistant
					? parseWalkthroughSteps(message.content)
					: [];

				return (
					<Fragment key={message.id}>
						<MessageBubble
							role={message.role}
							isFailed={message.isFailed}
							isPending={
								message.role === 'assistant' &&
								message.content === '' &&
								isStreaming &&
								index === messages.length - 1
							}
							isStreaming={
								message.role === 'assistant' &&
								message.content !== '' &&
								isStreaming &&
								index === messages.length - 1
							}
							sources={message.sources}
							copyText={
								isCompletedAssistant
									? message.content
									: undefined
							}
						>
							{message.role === 'assistant' ? (
								<MarkdownContent
									text={message.content}
									renderInline={renderWithElementChips}
								/>
							) : (
								message.content
							)}
						</MessageBubble>
						{steps.length > 0 && (
							<WalkthroughStartButton steps={steps} />
						)}
					</Fragment>
				);
			})}
		</div>
	);
};

import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from '@/entities/message';

it('renders URL sources as links and filenames as text', () => {
	render(
		<MessageBubble
			role="assistant"
			sources={[
				'https://support.example.com/reset-password',
				'manual.pdf',
			]}
		>
			Answer
		</MessageBubble>,
	);
	const link = screen.getByTestId('message-source-link');
	expect(link).toHaveAttribute(
		'href',
		'https://support.example.com/reset-password',
	);
	expect(link).toHaveAttribute('target', '_blank');
	expect(link).toHaveAttribute('rel', 'noopener noreferrer');
	expect(link).toHaveTextContent('support.example.com/reset-password');
	expect(screen.getByTestId('message-sources')).toHaveTextContent(
		'manual.pdf',
	);
});

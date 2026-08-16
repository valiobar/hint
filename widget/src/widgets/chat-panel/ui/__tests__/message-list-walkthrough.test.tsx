import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageList } from '@/widgets/chat-panel/ui/message-list';
import { useHintStore } from '@/shared/store/hint-store';

const STEPS_TEXT =
	'1. Click the "Reports" tab.\n2. Press the "Export report" button.';

describe('MessageList walkthrough entry', () => {
	beforeEach(() => {
		HTMLElement.prototype.scrollTo = () => undefined;
		useHintStore.setState({
			isStreaming: false,
			messages: [],
		});
	});

	it('shows the start button only on a completed parseable assistant message', () => {
		useHintStore.setState({
			messages: [
				{ id: 'u1', role: 'user', content: 'How do I export?' },
				{ id: 'a1', role: 'assistant', content: STEPS_TEXT },
			],
		});
		render(<MessageList />);
		expect(screen.getAllByTestId('walkthrough-start')).toHaveLength(
			1,
		);
	});
});

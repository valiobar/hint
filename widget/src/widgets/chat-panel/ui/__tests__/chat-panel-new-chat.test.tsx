import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatPanel } from '@/widgets/chat-panel/ui/chat-panel';
import { useHintStore } from '@/shared/store/hint-store';

describe('ChatPanel new chat button', () => {
	beforeEach(() => {
		HTMLElement.prototype.scrollTo = () => undefined;
		useHintStore.setState({
			isStreaming: false,
			messages: [],
			chatError: null,
			walkthrough: null,
		});
	});

	it('clears the conversation and disables once empty', () => {
		useHintStore.setState({
			messages: [{ id: 'u1', role: 'user', content: 'hi' }],
		});
		render(<ChatPanel />);
		const button = screen.getByTestId('chat-panel-new-chat');
		expect(button).toBeEnabled();
		fireEvent.click(button);
		expect(useHintStore.getState().messages).toEqual([]);
		expect(button).toBeDisabled();
	});

	it('is disabled while a response is streaming', () => {
		useHintStore.setState({
			messages: [{ id: 'u1', role: 'user', content: 'hi' }],
			isStreaming: true,
		});
		render(<ChatPanel />);
		expect(screen.getByTestId('chat-panel-new-chat')).toBeDisabled();
	});
});

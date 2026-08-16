import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
	clearWidgetConfigCache,
	writeWidgetConfigCache,
} from '@/features/suggested-questions/lib/config-cache';
import { SuggestedQuestions } from '@/features/suggested-questions/ui/suggested-questions';
import { useHintStore } from '@/shared/store/hint-store';
import { MessageList } from '@/widgets/chat-panel/ui/message-list';

const COMPANY_ID = 'cmp_test';
const originalSendMessage = useHintStore.getState().sendMessage;

describe('SuggestedQuestions', () => {
	beforeEach(() => {
		clearWidgetConfigCache();
		useHintStore.setState({
			sendMessage: originalSendMessage,
			isStreaming: false,
			isDisabled: false,
			messages: [],
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearWidgetConfigCache();
		useHintStore.setState({
			sendMessage: originalSendMessage,
			isStreaming: false,
			isDisabled: false,
			messages: [],
		});
	});

	it('sends the chip text through sendMessage', async () => {
		writeWidgetConfigCache(COMPANY_ID, [
			'How do I create an invoice?',
		]);
		const sendMessage = vi.fn();
		useHintStore.setState({
			sendMessage,
			isStreaming: false,
			isDisabled: false,
		});
		render(<SuggestedQuestions />);
		fireEvent.click(
			await screen.findByTestId('suggested-question'),
		);
		expect(sendMessage).toHaveBeenCalledWith(
			'How do I create an invoice?',
		);
	});

	it('keeps the empty-state sentence when the config request fails', async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValueOnce({ ok: false, status: 404 })
			.mockRejectedValueOnce(new Error('network'));
		vi.stubGlobal('fetch', fetchSpy);

		const { unmount } = render(<MessageList />);
		expect(
			await screen.findByTestId('chat-empty-state'),
		).toHaveTextContent(
			'Ask anything about this app — answers come from the product docs.',
		);
		await vi.waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledTimes(1);
		});
		expect(
			screen.queryByTestId('suggested-questions'),
		).not.toBeInTheDocument();

		unmount();
		clearWidgetConfigCache();

		render(<MessageList />);
		expect(
			await screen.findByTestId('chat-empty-state'),
		).toHaveTextContent(
			'Ask anything about this app — answers come from the product docs.',
		);
		await vi.waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledTimes(2);
		});
		expect(
			screen.queryByTestId('suggested-questions'),
		).not.toBeInTheDocument();
	});
});

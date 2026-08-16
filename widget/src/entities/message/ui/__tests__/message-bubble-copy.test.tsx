import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MessageBubble } from '@/entities/message';

const writeText = vi.fn();

describe('MessageBubble copy button', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		writeText.mockReset().mockResolvedValue(undefined);
		// jsdom has no Clipboard API — define the boundary directly.
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText },
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('copies the raw text and resets the label after 2 s', async () => {
		render(
			<MessageBubble role="assistant" copyText="raw **md**">
				rendered
			</MessageBubble>,
		);
		fireEvent.click(screen.getByTestId('message-copy'));
		expect(writeText).toHaveBeenCalledWith('raw **md**');
		await act(async () => {
			await Promise.resolve();
		});
		expect(screen.getByText('Copied')).toBeInTheDocument();
		act(() => {
			vi.advanceTimersByTime(2000);
		});
		expect(screen.getByText('Copy')).toBeInTheDocument();
	});

	it('hides the button without copyText and survives clipboard rejection', async () => {
		const warn = vi
			.spyOn(console, 'warn')
			.mockImplementation(() => undefined);
		const { rerender } = render(
			<MessageBubble role="assistant">rendered</MessageBubble>,
		);
		expect(screen.queryByTestId('message-copy')).toBeNull();

		writeText.mockRejectedValueOnce(new Error('denied'));
		rerender(
			<MessageBubble role="assistant" copyText="text">
				rendered
			</MessageBubble>,
		);
		fireEvent.click(screen.getByTestId('message-copy'));
		await act(async () => {
			await Promise.resolve();
		});
		expect(screen.getByText('Copy')).toBeInTheDocument();
		expect(warn).toHaveBeenCalledWith('Hint: clipboard write failed');
		warn.mockRestore();
	});
});

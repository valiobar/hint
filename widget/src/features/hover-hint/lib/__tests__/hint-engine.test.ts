import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, fetchHint } from '@/shared/api';
import { createHintEngine } from '@/features/hover-hint/lib/hint-engine';
import { useHintStore } from '@/shared/store/hint-store';
import { makeVisible } from '@/test/setup';

vi.mock('@/shared/api', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/shared/api')>();
	return {
		...actual,
		fetchHint: vi.fn(),
	};
});

const fetchHintMock = vi.mocked(fetchHint);

const resetStore = () => {
	useHintStore.setState({
		isOpen: false,
		isHintModeEnabled: false,
		isStreaming: false,
		isDisabled: false,
		messages: [],
		chatError: null,
		activeHint: null,
	});
};

const hover = (el: Element) => {
	el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
};

const unhover = (el: Element) => {
	el.dispatchEvent(
		new MouseEvent('mouseout', {
			bubbles: true,
			relatedTarget: document.body,
		}),
	);
};

describe('createHintEngine', () => {
	let button: HTMLButtonElement;
	let engine: ReturnType<typeof createHintEngine>;

	beforeEach(() => {
		vi.useFakeTimers();
		resetStore();
		fetchHintMock.mockReset();
		button = document.createElement('button');
		button.textContent = 'Export';
		document.body.append(button);
		makeVisible(button);
		engine = createHintEngine();
		engine.enable();
	});

	afterEach(() => {
		engine.disable();
		vi.useRealTimers();
	});

	it('fetches a hint only after the 400ms dwell and caches the result', async () => {
		fetchHintMock.mockResolvedValue({
			hint: 'Exports a report',
			source: 'manual.pdf',
		});

		hover(button);
		expect(fetchHintMock).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(400);
		expect(fetchHintMock).toHaveBeenCalledTimes(1);
		expect(useHintStore.getState().activeHint?.text).toBe(
			'Exports a report',
		);

		unhover(button);
		hover(button);
		await vi.advanceTimersByTimeAsync(400);
		expect(fetchHintMock).toHaveBeenCalledTimes(1);
	});

	it('disables the widget on 404 and stays silent on other errors', async () => {
		fetchHintMock.mockRejectedValueOnce(
			new ApiError(404, 'unknown company'),
		);
		hover(button);
		await vi.advanceTimersByTimeAsync(400);
		expect(useHintStore.getState().isDisabled).toBe(true);

		resetStore();
		unhover(button);

		fetchHintMock.mockRejectedValueOnce(new ApiError(500, 'boom'));
		hover(button);
		await vi.advanceTimersByTimeAsync(400);
		expect(useHintStore.getState().activeHint).toBeNull();
		expect(useHintStore.getState().isDisabled).toBe(false);
	});
});

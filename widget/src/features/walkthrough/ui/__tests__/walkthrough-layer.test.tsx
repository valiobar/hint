import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { WalkthroughLayer } from '@/features/walkthrough/ui/walkthrough-layer';
import {
	useHintStore,
	type WalkthroughStep,
} from '@/shared/store/hint-store';
import { makeVisible } from '@/test/setup';

const twoSteps: WalkthroughStep[] = [
	{ instruction: 'Click the "Reports" tab.', label: 'Reports' },
	{
		instruction: 'Press the "Export report" button.',
		label: 'Export report',
	},
];

describe('WalkthroughLayer', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		useHintStore.setState({
			walkthrough: { steps: twoSteps, activeStepIndex: 0 },
			isDisabled: false,
		});
		document.body.innerHTML =
			'<button>Reports</button><button>Export report</button>';
		for (const el of document.querySelectorAll('button')) {
			makeVisible(el);
		}
	});

	afterEach(() => {
		vi.useRealTimers();
		useHintStore.setState({ walkthrough: null });
	});

	it('auto-advances when the user clicks the highlighted element', () => {
		render(<WalkthroughLayer />);
		fireEvent.pointerDown(screen.getByText('Reports'));
		act(() => {
			vi.advanceTimersByTime(600);
		});
		expect(useHintStore.getState().walkthrough?.activeStepIndex).toBe(
			1,
		);
	});
});

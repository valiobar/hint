import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { IntroCallout } from '@/features/onboarding-intro/ui/intro-callout';
import { useHintStore } from '@/shared/store/hint-store';

describe('IntroCallout first-visit behavior', () => {
	beforeEach(() => {
		vi.useRealTimers();
		localStorage.clear();
		useHintStore.setState({
			isOpen: false,
			isDisabled: false,
			hasSeenIntro: false,
		});
	});

	it('reveals after the entrance delay on first visit', () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		render(<IntroCallout dockSide="right" isDragging={false} />);

		expect(screen.queryByTestId('intro-callout')).not.toBeInTheDocument();

		act(() => vi.advanceTimersByTime(1500));

		expect(screen.getByTestId('intro-callout')).toBeInTheDocument();
	});

	it('stays hidden when the intro has already been seen', () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		useHintStore.setState({ hasSeenIntro: true });
		render(<IntroCallout dockSide="right" isDragging={false} />);

		act(() => vi.advanceTimersByTime(1500));

		expect(screen.queryByTestId('intro-callout')).not.toBeInTheDocument();
	});

	it('opens the panel when the callout body is clicked', () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		render(<IntroCallout dockSide="right" isDragging={false} />);
		act(() => vi.advanceTimersByTime(1500));

		fireEvent.click(
			screen.getByRole('button', {
				name: /ask me anything about this app/,
			}),
		);

		expect(useHintStore.getState().isOpen).toBe(true);
		expect(useHintStore.getState().hasSeenIntro).toBe(true);
	});

	it('dismisses and starts the exit animation when the close button is clicked', () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		render(<IntroCallout dockSide="right" isDragging={false} />);
		act(() => vi.advanceTimersByTime(1500));

		const callout = screen.getByTestId('intro-callout');
		fireEvent.click(screen.getByTestId('intro-callout-dismiss'));

		expect(useHintStore.getState().hasSeenIntro).toBe(true);
		expect(callout.className).toContain('closing');
	});

	it('stays hidden while the guide bar is being dragged', () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		render(<IntroCallout dockSide="right" isDragging />);

		act(() => vi.advanceTimersByTime(1500));

		expect(screen.queryByTestId('intro-callout')).not.toBeInTheDocument();
	});

	it('stays hidden when the widget is disabled', () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		useHintStore.setState({ isDisabled: true });
		render(<IntroCallout dockSide="right" isDragging={false} />);

		act(() => vi.advanceTimersByTime(1500));

		expect(screen.queryByTestId('intro-callout')).not.toBeInTheDocument();
	});
});

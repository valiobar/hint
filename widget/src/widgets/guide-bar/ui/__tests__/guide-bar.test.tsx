import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GuideBar } from '@/widgets/guide-bar/ui/guide-bar';
import { useHintStore } from '@/shared/store/hint-store';

const stubBarRect = (
	bar: HTMLElement,
	rect: { left: number; top: number; width: number; height: number },
): void => {
	bar.getBoundingClientRect = () =>
		({
			x: rect.left,
			y: rect.top,
			top: rect.top,
			left: rect.left,
			right: rect.left + rect.width,
			bottom: rect.top + rect.height,
			width: rect.width,
			height: rect.height,
			toJSON: () => ({}),
		}) as DOMRect;
};

describe('GuideBar drag-to-dock', () => {
	beforeEach(() => {
		useHintStore.setState({
			dockSide: 'right',
			dockTopFraction: 0.5,
			isDisabled: false,
		});
	});

	it('turns horizontal while dragging and snaps to the nearest edge on release', () => {
		render(<GuideBar />);
		const positioner = screen.getByTestId('guide-bar-positioner');
		const bar = screen.getByTestId('guide-bar');
		const grip = screen.getByTestId('guide-bar-grip');

		// Bar dragged onto the left half of a 1024px-wide viewport
		stubBarRect(positioner, {
			left: 100,
			top: 300,
			width: 120,
			height: 52,
		});

		fireEvent.pointerDown(grip, {
			clientX: 110,
			clientY: 310,
			pointerId: 1,
		});
		fireEvent.pointerMove(grip, {
			clientX: 200,
			clientY: 320,
			pointerId: 1,
		});
		expect(bar.className).toContain('dragging');

		fireEvent.pointerUp(grip, {
			clientX: 200,
			clientY: 320,
			pointerId: 1,
		});
		expect(bar.className).not.toContain('dragging');
		expect(bar.className).toContain('dockedLeft');
		expect(useHintStore.getState().dockSide).toBe('left');
		expect(useHintStore.getState().dockTopFraction).toBeCloseTo(
			326 / window.innerHeight,
		);
	});

	it('keeps the right dock when released on the right half', () => {
		render(<GuideBar />);
		const positioner = screen.getByTestId('guide-bar-positioner');
		const bar = screen.getByTestId('guide-bar');
		const grip = screen.getByTestId('guide-bar-grip');

		stubBarRect(positioner, {
			left: 800,
			top: 100,
			width: 120,
			height: 52,
		});

		fireEvent.pointerDown(grip, {
			clientX: 810,
			clientY: 110,
			pointerId: 1,
		});
		fireEvent.pointerUp(grip, {
			clientX: 810,
			clientY: 110,
			pointerId: 1,
		});

		expect(useHintStore.getState().dockSide).toBe('right');
		expect(bar.className).not.toContain('dockedLeft');
	});
});

describe('GuideBar onboarding affordances', () => {
	beforeEach(() => {
		useHintStore.setState({
			dockSide: 'right',
			dockTopFraction: 0.5,
			isDisabled: false,
			hasSeenIntro: false,
		});
	});

	it('pulses the sparkle button before the intro has been seen', () => {
		render(<GuideBar />);
		const sparkle = screen.getByTestId('guide-bar-chat-toggle');

		expect(sparkle.className).toContain('attention');
	});

	it('stops pulsing the sparkle button after the intro has been seen', () => {
		useHintStore.setState({ hasSeenIntro: true });
		render(<GuideBar />);
		const sparkle = screen.getByTestId('guide-bar-chat-toggle');

		expect(sparkle.className).not.toContain('attention');
	});

	it('does not pulse the sparkle button while the widget is disabled', () => {
		useHintStore.setState({ isDisabled: true });
		render(<GuideBar />);
		const sparkle = screen.getByTestId('guide-bar-chat-toggle');

		expect(sparkle.className).not.toContain('attention');
	});

	it('exposes tooltip labels on both action buttons', () => {
		render(<GuideBar />);

		expect(
			screen.getByTestId('guide-bar-chat-toggle').getAttribute(
				'data-tooltip',
			),
		).toBe('Ask Hint anything');
		expect(
			screen.getByTestId('guide-bar-hints-toggle').getAttribute(
				'data-tooltip',
			),
		).toBe('Explain elements on hover');
	});
});

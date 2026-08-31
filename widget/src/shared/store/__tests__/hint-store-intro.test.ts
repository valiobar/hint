import { beforeEach, describe, expect, it } from 'vitest';
import { useHintStore } from '@/shared/store/hint-store';

describe('intro flag store actions', () => {
	beforeEach(() => {
		localStorage.clear();
		useHintStore.setState({
			isOpen: false,
			hasSeenIntro: false,
		});
	});

	it('hides the intro for this session without finishing the open budget', () => {
		useHintStore.getState().markIntroSeen();

		expect(useHintStore.getState().hasSeenIntro).toBe(true);
		expect(localStorage.getItem('hint:introOpens:cmp_test')).toBeNull();
		expect(localStorage.getItem('hint:introSeen:cmp_test')).toBeNull();
	});

	it('is idempotent when the intro is already hidden', () => {
		useHintStore.setState({ hasSeenIntro: true });
		useHintStore.getState().markIntroSeen();

		expect(useHintStore.getState().hasSeenIntro).toBe(true);
	});

	it('hides the intro when opening the panel', () => {
		useHintStore.getState().openPanel();

		expect(useHintStore.getState().isOpen).toBe(true);
		expect(useHintStore.getState().hasSeenIntro).toBe(true);
	});

	it('hides the intro when togglePanel opens the panel', () => {
		useHintStore.setState({ isOpen: false });

		useHintStore.getState().togglePanel();

		expect(useHintStore.getState().isOpen).toBe(true);
		expect(useHintStore.getState().hasSeenIntro).toBe(true);
	});

	it('does not hide the intro when togglePanel closes the panel', () => {
		useHintStore.setState({ isOpen: true, hasSeenIntro: false });

		useHintStore.getState().togglePanel();

		expect(useHintStore.getState().isOpen).toBe(false);
		expect(useHintStore.getState().hasSeenIntro).toBe(false);
	});
});

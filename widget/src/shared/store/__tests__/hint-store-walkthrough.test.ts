import { beforeEach, describe, expect, it } from 'vitest';
import {
	useHintStore,
	type WalkthroughStep,
} from '@/shared/store/hint-store';

const twoSteps: WalkthroughStep[] = [
	{ instruction: 'Click the "Reports" tab.', label: 'Reports' },
	{
		instruction: 'Press the "Export report" button.',
		label: 'Export report',
	},
];

describe('walkthrough store actions', () => {
	beforeEach(() => {
		useHintStore.setState({
			isOpen: false,
			isDisabled: false,
			activeHint: null,
			walkthrough: null,
		});
	});

	it('starts at step 0 with the panel closed and clears after the last step', () => {
		useHintStore.setState({ isOpen: true });
		useHintStore.getState().startWalkthrough(twoSteps);
		expect(useHintStore.getState().walkthrough?.activeStepIndex).toBe(
			0,
		);
		expect(useHintStore.getState().isOpen).toBe(false);

		useHintStore.getState().nextWalkthroughStep();
		expect(useHintStore.getState().walkthrough?.activeStepIndex).toBe(
			1,
		);

		useHintStore.getState().nextWalkthroughStep();
		expect(useHintStore.getState().walkthrough).toBeNull();
	});
});

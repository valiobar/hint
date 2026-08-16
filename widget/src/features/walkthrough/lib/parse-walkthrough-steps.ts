import type { WalkthroughStep } from '@/shared/store/hint-store';

export const MAX_WALKTHROUGH_STEPS = 10;

const STEP_LINE = /^\s*\d+[.)]\s+(.+)$/;
const QUOTED_LABEL = /"([^"\n]{1,80})"/;

export const parseWalkthroughSteps = (text: string): WalkthroughStep[] => {
	const steps: WalkthroughStep[] = [];
	for (const line of text.split('\n')) {
		const stepMatch = line.match(STEP_LINE);
		if (!stepMatch) {
			continue;
		}
		const instruction = (stepMatch[1] ?? '').trim();
		const labelMatch = instruction.match(QUOTED_LABEL);
		steps.push({
			instruction,
			label: labelMatch?.[1] ?? null,
		});
	}
	if (steps.length < 2) {
		return [];
	}
	return steps.slice(0, MAX_WALKTHROUGH_STEPS);
};

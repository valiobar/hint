import { describe, expect, it } from 'vitest';
import {
	MAX_WALKTHROUGH_STEPS,
	parseWalkthroughSteps,
} from '@/features/walkthrough/lib/parse-walkthrough-steps';

describe('parseWalkthroughSteps', () => {
	it('parses numbered steps with quoted labels', () => {
		const text =
			'To export:\n1. Click the "Reports" tab.\n2. Press the "Export report" button.';
		expect(parseWalkthroughSteps(text)).toEqual([
			{ instruction: 'Click the "Reports" tab.', label: 'Reports' },
			{
				instruction: 'Press the "Export report" button.',
				label: 'Export report',
			},
		]);
	});

	it('accepts 1) numbering and uses the first quoted label', () => {
		const text =
			'1) Open the "Reports" then "Ignored" panel.\n2) Click "Export report".';
		expect(parseWalkthroughSteps(text)).toEqual([
			{
				instruction: 'Open the "Reports" then "Ignored" panel.',
				label: 'Reports',
			},
			{
				instruction: 'Click "Export report".',
				label: 'Export report',
			},
		]);
	});

	it('keeps label-less steps and returns [] without at least 2 numbered lines', () => {
		expect(
			parseWalkthroughSteps(
				'1. Open the sidebar.\n2. Click the "Save" button.',
			),
		).toEqual([
			{ instruction: 'Open the sidebar.', label: null },
			{ instruction: 'Click the "Save" button.', label: 'Save' },
		]);
		expect(parseWalkthroughSteps('Click the "Save" button.')).toEqual([]);
		expect(parseWalkthroughSteps('1. Only one step "Save".')).toEqual([]);
	});

	it('caps parsed steps at MAX_WALKTHROUGH_STEPS', () => {
		const lines = Array.from(
			{ length: MAX_WALKTHROUGH_STEPS + 3 },
			(_, i) => `${i + 1}. Click "${i + 1}".`,
		);
		const steps = parseWalkthroughSteps(lines.join('\n'));
		expect(steps).toHaveLength(MAX_WALKTHROUGH_STEPS);
		expect(steps[0]).toEqual({
			instruction: 'Click "1".',
			label: '1',
		});
		expect(steps[MAX_WALKTHROUGH_STEPS - 1]).toEqual({
			instruction: `Click "${MAX_WALKTHROUGH_STEPS}".`,
			label: `${MAX_WALKTHROUGH_STEPS}`,
		});
	});
});

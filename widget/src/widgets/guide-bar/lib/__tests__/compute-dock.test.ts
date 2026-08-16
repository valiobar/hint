import { describe, expect, it } from 'vitest';
import {
	computeDockPosition,
	dockToCoordinates,
	DOCK_EDGE_MARGIN,
} from '@/widgets/guide-bar/lib/compute-dock';

const viewport = { width: 1000, height: 800 };
const barSize = { width: 52, height: 120 };

describe('computeDockPosition', () => {
	it('picks the nearest side from the bar center', () => {
		const leftRect = { left: 100, top: 300, width: 120, height: 52 };
		const rightRect = { left: 700, top: 300, width: 120, height: 52 };

		expect(computeDockPosition(leftRect, viewport).side).toBe('left');
		expect(computeDockPosition(rightRect, viewport).side).toBe(
			'right',
		);
	});

	it('clamps the top fraction into [0, 1] and centers on the bar', () => {
		const midRect = { left: 100, top: 374, width: 120, height: 52 };
		const aboveRect = { left: 100, top: -200, width: 120, height: 52 };
		const belowRect = { left: 100, top: 900, width: 120, height: 52 };

		expect(
			computeDockPosition(midRect, viewport).topFraction,
		).toBeCloseTo(0.5);
		expect(computeDockPosition(aboveRect, viewport).topFraction).toBe(
			0,
		);
		expect(computeDockPosition(belowRect, viewport).topFraction).toBe(
			1,
		);
	});
});

describe('dockToCoordinates', () => {
	it('places the bar flush with the chosen edge', () => {
		expect(dockToCoordinates('left', 0.5, barSize, viewport).x).toBe(
			0,
		);
		expect(dockToCoordinates('right', 0.5, barSize, viewport).x).toBe(
			viewport.width - barSize.width,
		);
	});

	it('centers vertically on the fraction and clamps to the viewport', () => {
		const centered = dockToCoordinates('right', 0.5, barSize, viewport);
		const top = dockToCoordinates('right', 0, barSize, viewport);
		const bottom = dockToCoordinates('right', 1, barSize, viewport);

		expect(centered.y).toBe(
			0.5 * viewport.height - barSize.height / 2,
		);
		expect(top.y).toBe(DOCK_EDGE_MARGIN);
		expect(bottom.y).toBe(
			viewport.height - barSize.height - DOCK_EDGE_MARGIN,
		);
	});
});

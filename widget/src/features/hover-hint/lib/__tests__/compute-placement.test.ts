import { describe, expect, it } from 'vitest';
import { computePlacement } from '@/features/hover-hint/lib/compute-placement';

describe('computePlacement', () => {
	it('places above by default and flips below near the top edge', () => {
		expect(
			computePlacement({
				top: 200,
				left: 400,
				width: 80,
				height: 32,
			}),
		).toMatchObject({ side: 'above', y: 192 });

		expect(
			computePlacement({
				top: 10,
				left: 400,
				width: 80,
				height: 32,
			}),
		).toMatchObject({ side: 'below', y: 50 });
	});
});

import { describe, expect, it } from 'vitest';
import { computeCardPlacement } from '@/features/walkthrough/lib/compute-card-placement';

describe('computeCardPlacement', () => {
	it('places below a target with room and floats when there is no rect', () => {
		expect(
			computeCardPlacement({
				top: 80,
				left: 400,
				width: 80,
				height: 32,
			}),
		).toMatchObject({ side: 'below', y: 124 });

		expect(computeCardPlacement(null)).toMatchObject({
			side: 'floating',
			x: window.innerWidth / 2,
			y: window.innerHeight - 16,
		});
	});
});

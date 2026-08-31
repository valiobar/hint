import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	INTRO_MAX_OPENS,
	isIntroComplete,
	readIntroOpenCount,
	recordIntroOpen,
} from '@/shared/lib/intro-storage';

const OPENS_KEY = 'hint:introOpens:cmp_test';
const LEGACY_KEY = 'hint:introSeen:cmp_test';

describe('intro open-count storage', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('counts page opens up to the max and then completes', () => {
		expect(isIntroComplete('cmp_test')).toBe(false);

		for (let n = 1; n <= INTRO_MAX_OPENS; n++) {
			expect(recordIntroOpen('cmp_test')).toBe(n);
		}
		expect(localStorage.getItem(OPENS_KEY)).toBe(String(INTRO_MAX_OPENS));

		expect(isIntroComplete('cmp_test')).toBe(true);
		expect(recordIntroOpen('cmp_test')).toBe(INTRO_MAX_OPENS);
		expect(localStorage.getItem(OPENS_KEY)).toBe(String(INTRO_MAX_OPENS));
	});

	it('treats the legacy once-ever flag as already complete', () => {
		localStorage.setItem(LEGACY_KEY, '1');

		expect(readIntroOpenCount('cmp_test')).toBe(INTRO_MAX_OPENS);
		expect(isIntroComplete('cmp_test')).toBe(true);
	});

	it('does not throw when localStorage is blocked', () => {
		const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
			throw new Error('Storage blocked');
		});

		expect(() => recordIntroOpen('cmp_test')).not.toThrow();
		spy.mockRestore();
	});
});

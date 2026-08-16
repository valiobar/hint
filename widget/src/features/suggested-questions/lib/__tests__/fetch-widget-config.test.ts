import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearWidgetConfigCache,
	writeWidgetConfigCache,
} from '@/features/suggested-questions/lib/config-cache';
import { fetchSuggestedQuestions } from '@/features/suggested-questions/lib/fetch-widget-config';

const COMPANY_ID = 'cmp_test';

describe('fetchSuggestedQuestions', () => {
	beforeEach(() => {
		clearWidgetConfigCache();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearWidgetConfigCache();
	});

	it('returns cached questions without refetching', async () => {
		writeWidgetConfigCache(COMPANY_ID, [
			'How do I export a report?',
		]);
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		await expect(fetchSuggestedQuestions()).resolves.toEqual([
			'How do I export a report?',
		]);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('returns an empty list on 404 and network failure', async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValueOnce({ ok: false, status: 404 })
			.mockRejectedValueOnce(new Error('network'));
		vi.stubGlobal('fetch', fetchSpy);

		await expect(fetchSuggestedQuestions()).resolves.toEqual([]);
		clearWidgetConfigCache();
		await expect(fetchSuggestedQuestions()).resolves.toEqual([]);
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});
});

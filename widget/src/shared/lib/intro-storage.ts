/** How many page opens still show the first-run intro. */
export const INTRO_MAX_OPENS = 5;

const opensKey = (companyId: string | undefined): string =>
	`hint:introOpens:${companyId ?? 'unknown'}`;

const legacySeenKey = (companyId: string | undefined): string =>
	`hint:introSeen:${companyId ?? 'unknown'}`;

export const readIntroOpenCount = (
	companyId: string | undefined,
): number => {
	try {
		// Users who already finished the old once-ever flag stay finished.
		if (localStorage.getItem(legacySeenKey(companyId)) === '1') {
			return INTRO_MAX_OPENS;
		}
		const raw = localStorage.getItem(opensKey(companyId));
		if (raw == null) {
			return 0;
		}
		const n = Number.parseInt(raw, 10);
		if (!Number.isFinite(n) || n < 0) {
			return 0;
		}
		return Math.min(n, INTRO_MAX_OPENS);
	} catch {
		return 0;
	}
};

/** True when the intro should no longer appear on fresh page loads. */
export const isIntroComplete = (
	companyId: string | undefined,
): boolean => readIntroOpenCount(companyId) >= INTRO_MAX_OPENS;

/**
 * Count this page open toward the intro budget. No-op once the max is
 * reached. Returns the updated count.
 */
export const recordIntroOpen = (
	companyId: string | undefined,
): number => {
	const current = readIntroOpenCount(companyId);
	if (current >= INTRO_MAX_OPENS) {
		return current;
	}
	const next = current + 1;
	try {
		localStorage.setItem(opensKey(companyId), String(next));
	} catch {
		// Storage blocked — intro may replay; acceptable degradation.
	}
	return next;
};

import { fetchHint, ApiError } from '@/shared/api';
import type { HintResponse } from '@/shared/api/types';
import {
	INTERACTIVE_SELECTOR,
	isInsideHintRoot,
	isVisibleElement,
} from '@/shared/lib/interactive-elements';
import { describeElement } from '@/shared/lib/element-descriptor';
import { extractPageContext } from '@/shared/lib/page-context';
import { useHintStore } from '@/shared/store/hint-store';
import { WIDGET_CONFIG } from '@/shared/config';
import { buildHintCacheKey } from '@/features/hover-hint/lib/hint-cache-key';

const DWELL_MS = 400;
const CACHE_MAX_ENTRIES = 200;

export interface HintEngine {
	enable: () => void;
	disable: () => void;
}

export const createHintEngine = (): HintEngine => {
	let dwellTimer: number | null = null;
	let abortController: AbortController | null = null;
	let currentTarget: Element | null = null;
	const cache = new Map<string, HintResponse>();

	const toRectSnapshot = (el: Element) => {
		const { top, left, width, height } = el.getBoundingClientRect();
		return { top, left, width, height };
	};

	const clearPending = () => {
		if (dwellTimer !== null) {
			window.clearTimeout(dwellTimer);
			dwellTimer = null;
		}
		abortController?.abort();
		abortController = null;
	};

	const rememberHint = (key: string, hint: HintResponse) => {
		if (cache.size >= CACHE_MAX_ENTRIES) {
			cache.delete(cache.keys().next().value as string);
		}
		cache.set(key, hint);
	};

	const showHintFor = async (el: Element) => {
		const { showHint, hideHint, disableWidget } =
			useHintStore.getState();
		const descriptor = describeElement(el);
		const key = buildHintCacheKey(descriptor);
		const rect = toRectSnapshot(el);

		const cached = cache.get(key);
		if (cached) {
			showHint(rect, cached.hint);
			return;
		}
		showHint(rect, null);
		abortController = new AbortController();
		try {
			const hint = await fetchHint(
				{
					company_id: WIDGET_CONFIG!.companyId,
					element: descriptor,
					page_context: extractPageContext(),
				},
				abortController.signal,
			);
			rememberHint(key, hint);
			if (currentTarget === el) {
				showHint(rect, hint.hint);
			}
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				return;
			}
			if (err instanceof ApiError && err.status === 404) {
				disableWidget();
				return;
			}
			hideHint();
		}
	};

	const handleMouseOver = (event: MouseEvent) => {
		const target = (event.target as Element | null)?.closest(
			INTERACTIVE_SELECTOR,
		);
		if (
			!target ||
			isInsideHintRoot(target) ||
			!isVisibleElement(target) ||
			target === currentTarget
		) {
			return;
		}
		clearPending();
		currentTarget = target;
		dwellTimer = window.setTimeout(() => {
			dwellTimer = null;
			void showHintFor(target);
		}, DWELL_MS);
	};

	const handleMouseOut = (event: MouseEvent) => {
		if (!currentTarget) {
			return;
		}
		const next = event.relatedTarget as Element | null;
		if (next && currentTarget.contains(next)) {
			return;
		}
		clearPending();
		currentTarget = null;
		useHintStore.getState().hideHint();
	};

	const handleViewportChange = () => {
		if (useHintStore.getState().activeHint) {
			clearPending();
			currentTarget = null;
			useHintStore.getState().hideHint();
		}
	};

	return {
		enable: () => {
			document.addEventListener('mouseover', handleMouseOver, true);
			document.addEventListener('mouseout', handleMouseOut, true);
			window.addEventListener('scroll', handleViewportChange, true);
			window.addEventListener('resize', handleViewportChange);
		},
		disable: () => {
			document.removeEventListener('mouseover', handleMouseOver, true);
			document.removeEventListener('mouseout', handleMouseOut, true);
			window.removeEventListener(
				'scroll',
				handleViewportChange,
				true,
			);
			window.removeEventListener('resize', handleViewportChange);
			clearPending();
			currentTarget = null;
			useHintStore.getState().hideHint();
		},
	};
};

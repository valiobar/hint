// Single source of truth for what counts as an interactive element on the
// host page — shared by page-context extraction, hover hints, and
// locate-element.

export const INTERACTIVE_SELECTOR =
	'button, a[href], input, select, textarea, ' +
	'[role="button"], [role="menuitem"], [role="tab"]';

export const isInsideHintRoot = (el: Element): boolean =>
	el.closest('#hint-root') !== null;

export const isVisibleElement = (el: Element): boolean => {
	if ((el as HTMLElement).offsetParent === null) {
		return false;
	}
	const rect = el.getBoundingClientRect();
	return rect.width > 0 && rect.height > 0;
};

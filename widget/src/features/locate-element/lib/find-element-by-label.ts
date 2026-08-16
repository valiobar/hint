import {
	INTERACTIVE_SELECTOR,
	isInsideHintRoot,
} from '@/shared/lib/interactive-elements';
import { getElementLabelCandidates } from '@/shared/lib/element-label';

export const findElementByLabel = (label: string): Element | null => {
	const needle = label.trim().toLowerCase();
	if (!needle) {
		return null;
	}
	for (const el of document.querySelectorAll(INTERACTIVE_SELECTOR)) {
		if (
			isInsideHintRoot(el) ||
			(el as HTMLElement).offsetParent === null
		) {
			continue;
		}
		const isMatch = getElementLabelCandidates(el).some(
			(candidate) => candidate.toLowerCase() === needle,
		);
		if (isMatch) {
			return el;
		}
	}
	return null;
};

// Accessible-name resolution for interactive host-page elements — shared by
// page-context extraction (what the LLM sees) and locate-element matching
// (which quoted labels become chips). Form controls usually have no
// textContent; their visible name lives in an associated <label>.

const FORM_CONTROL_TAGS = new Set(['input', 'select', 'textarea']);

type LabeledControl =
	| HTMLInputElement
	| HTMLSelectElement
	| HTMLTextAreaElement;

const normalize = (text: string | null | undefined): string =>
	(text ?? '').replace(/\s+/g, ' ').trim();

const associatedLabelText = (el: Element): string => {
	const labels = (el as LabeledControl).labels;
	if (!labels || labels.length === 0) {
		return '';
	}
	// A wrapping <label> may contain the control itself (a <select> would
	// leak its option texts) — strip nested controls before reading text.
	const clone = labels[0].cloneNode(true) as HTMLElement;
	for (const nested of clone.querySelectorAll(
		'input, select, textarea, button',
	)) {
		nested.remove();
	}
	return normalize(clone.textContent);
};

export const getElementLabelCandidates = (el: Element): string[] => {
	const isFormControl = FORM_CONTROL_TAGS.has(el.tagName.toLowerCase());
	const raw = isFormControl
		? [
				associatedLabelText(el),
				el.getAttribute('aria-label'),
				el.getAttribute('placeholder'),
				el.getAttribute('name'),
			]
		: [normalize(el.textContent), el.getAttribute('aria-label')];

	const seen = new Set<string>();
	const candidates: string[] = [];
	for (const value of raw) {
		const label = normalize(value);
		const key = label.toLowerCase();
		if (label && !seen.has(key)) {
			seen.add(key);
			candidates.push(label);
		}
	}
	return candidates;
};

export const getElementLabel = (el: Element): string =>
	getElementLabelCandidates(el)[0] ?? '';

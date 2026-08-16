const FOCUS_TAGS = new Set(['input', 'textarea', 'select']);

export const performElementAction = (el: Element): void => {
	const target = el as HTMLElement;
	const tag = target.tagName.toLowerCase();
	if (FOCUS_TAGS.has(tag) || target.isContentEditable) {
		target.focus();
		return;
	}
	target.click();
};

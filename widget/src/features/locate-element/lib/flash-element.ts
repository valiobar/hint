import { outlineElement } from '@/shared/lib/element-highlight';

export const flashElement = (el: Element): void => {
	const target = el as HTMLElement;
	const removeOutline = outlineElement(el);
	target.scrollIntoView({ behavior: 'smooth', block: 'center' });
	window.setTimeout(removeOutline, 1600);
};

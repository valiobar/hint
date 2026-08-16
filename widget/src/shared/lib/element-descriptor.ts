import type { ElementDescriptor } from '@/shared/api/types';
import {
	MAX_ELEMENT_TEXT_CHARS,
	MAX_SELECTOR_PATH_CHARS,
} from '@/shared/api/types';
import { getElementLabel } from '@/shared/lib/element-label';

const ATTR_WHITELIST = [
	'id',
	'name',
	'aria-label',
	'placeholder',
	'href',
	'type',
	'title',
] as const;

const MAX_ATTR_VALUE_CHARS = 256;

const pickAttrs = (el: Element): Record<string, string> => {
	const attrs: Record<string, string> = {};
	for (const name of ATTR_WHITELIST) {
		const value = el.getAttribute(name);
		if (value) {
			attrs[name] = value.slice(0, MAX_ATTR_VALUE_CHARS);
		}
	}
	return attrs;
};

// Hashed/utility class names (CSS modules, Tailwind) are unstable across
// host-app deploys — skip them so selector paths stay cache-friendly.
const isStableClass = (name: string): boolean =>
	name.length <= 24 && !/\d|--/.test(name);

export const buildCssPath = (el: Element, maxDepth = 4): string => {
	const parts: string[] = [];
	let node: Element | null = el;
	while (node && node !== document.body && parts.length < maxDepth) {
		if (node.id) {
			parts.unshift(`#${node.id}`);
			break;
		}
		const stable = [...node.classList].find(isStableClass);
		parts.unshift(
			stable
				? `${node.tagName.toLowerCase()}.${stable}`
				: node.tagName.toLowerCase(),
		);
		node = node.parentElement;
	}
	return parts.join(' > ').slice(0, MAX_SELECTOR_PATH_CHARS);
};

export const describeElement = (el: Element): ElementDescriptor => ({
	tag: el.tagName.toLowerCase().slice(0, 32),
	text: getElementLabel(el).slice(0, MAX_ELEMENT_TEXT_CHARS) || null,
	role: el.getAttribute('role'),
	attrs: pickAttrs(el),
	selector_path: buildCssPath(el),
});

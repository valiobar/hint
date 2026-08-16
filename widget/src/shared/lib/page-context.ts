import type { PageContext } from '@/shared/api/types';
import {
	MAX_HEADINGS,
	MAX_INTERACTIVE_ELEMENTS,
	MAX_TEXT_EXCERPT_CHARS,
	MAX_URL_CHARS,
} from '@/shared/api/types';
import { describeElement } from '@/shared/lib/element-descriptor';
import {
	INTERACTIVE_SELECTOR,
	isInsideHintRoot,
	isVisibleElement,
} from '@/shared/lib/interactive-elements';

const extractMainText = (): string => {
	const root =
		document.querySelector<HTMLElement>('main') ?? document.body;
	return root.innerText
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MAX_TEXT_EXCERPT_CHARS);
};

export const extractPageContext = (): PageContext => {
	const headings = [...document.querySelectorAll('h1, h2, h3')]
		.filter((el) => !el.closest('#hint-root'))
		.map((el) => el.textContent?.trim() ?? '')
		.filter((text) => text.length > 0)
		.slice(0, MAX_HEADINGS);

	const interactive = [
		...document.querySelectorAll(INTERACTIVE_SELECTOR),
	]
		.filter((el) => isVisibleElement(el) && !isInsideHintRoot(el))
		.slice(0, MAX_INTERACTIVE_ELEMENTS)
		.map((el) => describeElement(el));

	return {
		url: location.href.slice(0, MAX_URL_CHARS),
		title: document.title.slice(0, 512),
		headings,
		interactive,
		visible_text_excerpt: extractMainText(),
	};
};

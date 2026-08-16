import { describe, expect, it } from 'vitest';
import { extractPageContext } from '@/shared/lib/page-context';
import {
	MAX_INTERACTIVE_ELEMENTS,
	MAX_TEXT_EXCERPT_CHARS,
} from '@/shared/api/types';
import { makeVisible } from '@/test/setup';

describe('extractPageContext', () => {
	it('caps payload size and excludes widget chrome and hidden nodes', () => {
		const main = document.createElement('main');
		main.textContent = 'w'.repeat(MAX_TEXT_EXCERPT_CHARS + 50);

		const hintRoot = document.createElement('div');
		hintRoot.id = 'hint-root';
		const widgetBtn = document.createElement('button');
		widgetBtn.textContent = 'Widget close';
		hintRoot.append(widgetBtn);

		const hidden = document.createElement('button');
		hidden.textContent = 'Hidden';

		document.body.append(main, hintRoot, hidden);
		makeVisible(widgetBtn);

		for (let i = 0; i < MAX_INTERACTIVE_ELEMENTS + 1; i++) {
			const btn = document.createElement('button');
			btn.textContent = `Action ${i}`;
			document.body.append(btn);
			makeVisible(btn);
		}

		const ctx = extractPageContext();

		expect(ctx.interactive).toHaveLength(MAX_INTERACTIVE_ELEMENTS);
		expect(
			ctx.interactive.some((el) => el.text === 'Widget close'),
		).toBe(false);
		expect(ctx.interactive.some((el) => el.text === 'Hidden')).toBe(
			false,
		);
		expect(ctx.visible_text_excerpt).toHaveLength(
			MAX_TEXT_EXCERPT_CHARS,
		);
	});
});

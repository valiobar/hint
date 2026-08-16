import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Must run before app modules load so WIDGET_CONFIG and the persist
// key resolve. setupFiles execute before each test file's imports.
window.__HINT__ = {
	companyId: 'cmp_test',
	apiUrl: 'http://hint.test',
	cdnBaseUrl: 'http://cdn.test/embed/v1',
};

// jsdom has no layout engine — innerText is empty / missing.
Object.defineProperty(HTMLElement.prototype, 'innerText', {
	configurable: true,
	get() {
		return this.textContent ?? '';
	},
	set(value: string) {
		this.textContent = value;
	},
});

HTMLElement.prototype.scrollIntoView = () => undefined;

afterEach(() => {
	cleanup();
	document.body.innerHTML = '';
});

// jsdom reports offsetParent === null and a zero rect, so visibility
// helpers treat every fixture as hidden unless tests opt in.
export const makeVisible = (el: Element): void => {
	Object.defineProperty(el, 'offsetParent', {
		configurable: true,
		get: () => document.body,
	});
	el.getBoundingClientRect = () =>
		({
			x: 8,
			y: 8,
			top: 8,
			left: 8,
			bottom: 40,
			right: 88,
			width: 80,
			height: 32,
			toJSON: () => ({}),
		}) as DOMRect;
};

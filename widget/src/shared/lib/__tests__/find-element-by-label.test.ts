import { describe, expect, it } from 'vitest';
import { findElementByLabel } from '@/shared/lib/find-element-by-label';
import { makeVisible } from '@/test/setup';

describe('findElementByLabel', () => {
	it('matches form controls by wrapping label, for-linked label, placeholder, and buttons by text', () => {
		document.body.innerHTML = `
			<label>Customer name
				<input type="text" placeholder="Acme Retail">
			</label>
			<label for="status-filter">Status</label>
			<select id="status-filter">
				<option>All statuses</option>
			</select>
			<button type="button">Export report</button>
		`;
		for (const el of document.querySelectorAll('input, select, button')) {
			makeVisible(el);
		}
		const input = document.querySelector('input');
		const select = document.querySelector('select');
		const button = document.querySelector('button');

		expect(findElementByLabel('Customer name')).toBe(input);
		expect(findElementByLabel('acme retail')).toBe(input);
		expect(findElementByLabel('Status')).toBe(select);
		expect(findElementByLabel('Export report')).toBe(button);
		// Option text is not an accessible name for the select.
		expect(findElementByLabel('All statuses')).toBeNull();
	});
});

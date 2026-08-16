import { describe, expect, it } from 'vitest';
import { describeElement } from '@/shared/lib/element-descriptor';
import { MAX_ELEMENT_TEXT_CHARS } from '@/shared/api/types';

describe('describeElement', () => {
	it('short-circuits on id, skips unstable classes, and clamps text', () => {
		document.body.innerHTML = `
			<div id="toolbar">
				<div class="css-a1b2 hashed--mod nav">
					<button
						class="css-x9 export"
						aria-label="Go"
						data-secret="nope"
					>${'x'.repeat(MAX_ELEMENT_TEXT_CHARS + 40)}</button>
				</div>
			</div>
		`;

		const desc = describeElement(document.querySelector('button')!);

		expect(desc.selector_path).toBe(
			'#toolbar > div.nav > button.export',
		);
		expect(desc.text).toHaveLength(MAX_ELEMENT_TEXT_CHARS);
		expect(desc.attrs).toEqual({ 'aria-label': 'Go' });
	});

	it('uses the associated label as text for form controls', () => {
		document.body.innerHTML = `
			<label>Customer name
				<input id="customer-name" placeholder="Acme Retail">
			</label>
			<label for="status-filter">Status</label>
			<select id="status-filter"><option>All statuses</option></select>
		`;

		expect(describeElement(document.querySelector('input')!).text).toBe(
			'Customer name',
		);
		expect(describeElement(document.querySelector('select')!).text).toBe(
			'Status',
		);
	});
});

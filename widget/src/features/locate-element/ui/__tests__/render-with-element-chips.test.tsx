import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderWithElementChips } from '@/features/locate-element/ui/render-with-element-chips';
import { makeVisible } from '@/test/setup';

describe('renderWithElementChips', () => {
	it('turns quoted and bold labels into chips and strips asterisks from unmatched bold text', () => {
		document.body.innerHTML = `
			<button type="button">Export report</button>
			<label>Customer name <input type="text"></label>
		`;
		for (const el of document.querySelectorAll('button, input')) {
			makeVisible(el);
		}

		const { container } = render(
			<div data-testid="msg">
				{renderWithElementChips(
					'Click "Export report", fill **Customer name**, then **Unknown thing**.',
				)}
			</div>,
		);

		const chips = screen.getAllByTestId('element-chip');
		expect(chips).toHaveLength(2);
		expect(chips[0]).toHaveTextContent('Export report');
		expect(chips[1]).toHaveTextContent('Customer name');
		expect(container.textContent).toContain('Unknown thing');
		expect(container.textContent).not.toContain('**');
	});
});

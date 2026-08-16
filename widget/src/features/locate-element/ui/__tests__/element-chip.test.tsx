import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ElementChip } from '@/features/locate-element/ui/element-chip';
import { makeVisible } from '@/test/setup';

describe('ElementChip', () => {
	it('flashes on chip click and performs the host action from the icon', () => {
		const host = document.createElement('button');
		host.textContent = 'Export';
		document.body.append(host);
		makeVisible(host);
		const clickSpy = vi.spyOn(host, 'click');

		const hintRoot = document.createElement('div');
		hintRoot.id = 'hint-root';
		document.body.append(hintRoot);
		render(<ElementChip label="Export" />, { container: hintRoot });

		fireEvent.click(screen.getByTestId('element-chip'));
		expect(clickSpy).not.toHaveBeenCalled();
		expect(host.classList.contains('hint-element-highlight')).toBe(
			true,
		);

		fireEvent.click(screen.getByTestId('element-chip-action'));
		expect(clickSpy).toHaveBeenCalledTimes(1);
	});
});

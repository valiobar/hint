import { expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { applyTheme, readTheme } from '@/shared/lib/theme';
import { ThemeToggle } from './theme-toggle';

it('defaults to light and switches to dark', () => {
	localStorage.clear();
	document.documentElement.removeAttribute('data-theme');
	applyTheme(readTheme());
	render(<ThemeToggle />);
	expect(document.documentElement.dataset.theme).toBe('light');
	fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
	expect(document.documentElement.dataset.theme).toBe('dark');
	expect(localStorage.getItem('hint.admin.theme')).toBe('dark');
});

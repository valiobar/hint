export type Theme = 'light' | 'dark';

const THEME_KEY = 'hint.admin.theme';

export const readTheme = (): Theme => {
	try {
		const stored = localStorage.getItem(THEME_KEY);
		if (stored === 'dark' || stored === 'light') {
			return stored;
		}
	} catch {
		// private mode — stay on the Figma default
	}
	return 'light';
};

export const writeTheme = (theme: Theme): void => {
	try {
		localStorage.setItem(THEME_KEY, theme);
	} catch {
		// private mode — theme is memory-only
	}
};

export const applyTheme = (theme: Theme): void => {
	document.documentElement.dataset.theme = theme;
};

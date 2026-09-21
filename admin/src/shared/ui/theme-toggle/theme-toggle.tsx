import { useEffect, useState } from 'react';
import { applyTheme, readTheme, writeTheme, type Theme } from '@/shared/lib/theme';
import { Button } from '@/shared/ui/button/button';

export const ThemeToggle = () => {
	const [theme, setTheme] = useState<Theme>(() => readTheme());

	useEffect(() => {
		applyTheme(theme);
	}, [theme]);

	const handleToggle = () => {
		const next: Theme = theme === 'light' ? 'dark' : 'light';
		setTheme(next);
		writeTheme(next);
		applyTheme(next);
	};

	return (
		<Button
			variant="chip"
			onClick={handleToggle}
			aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
		>
			{theme === 'light' ? 'Dark' : 'Light'}
		</Button>
	);
};

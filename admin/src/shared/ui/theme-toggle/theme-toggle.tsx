import { useEffect, useState } from 'react';
import { applyTheme, readTheme, writeTheme, type Theme } from '@/shared/lib/theme';
import { Button } from '@/shared/ui/button/button';
import { MoonIcon, SunIcon } from '@/shared/ui/icons/theme-icons';
import styles from './theme-toggle.module.css';

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

	const nextTheme = theme === 'light' ? 'dark' : 'light';

	return (
		<Button
			variant="ghost"
			className={styles.toggle}
			onClick={handleToggle}
			aria-label={`Switch to ${nextTheme} theme`}
		>
			{theme === 'light' ? <MoonIcon /> : <SunIcon />}
		</Button>
	);
};

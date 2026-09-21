import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/app';
import { applyTheme, readTheme } from '@/shared/lib/theme';
import '@/app/styles/global.css';

applyTheme(readTheme());

const root = document.getElementById('root');
if (!root) {
	throw new Error('Root element #root not found');
}

createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);

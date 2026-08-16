import { createRoot } from 'react-dom/client';
import { HintApp } from '@/app/hint-app';
import { loadShadowCss } from '@/app/load-shadow-css';
import { WIDGET_CONFIG } from '@/shared/config';
// Bundled into hint-widget.{hash}.css together with all CSS Modules
import '@/shared/ui/styles/variables.css';

const mount = async () => {
	const config = window.__HINT__;
	if (!WIDGET_CONFIG || !config || config.mounted) {
		return;
	}
	config.mounted = true;

	const host = document.createElement('div');
	host.id = 'hint-root';
	host.style.cssText = 'position:fixed;z-index:2147483647;width:0;height:0;';
	document.body.appendChild(host);

	const shadow = host.attachShadow({ mode: 'open' });

	try {
		await loadShadowCss(shadow, WIDGET_CONFIG.cdnBaseUrl);
	} catch {
		console.error('Hint: failed to load widget styles; widget disabled');
		host.remove();
		return;
	}

	const container = document.createElement('div');
	shadow.appendChild(container);
	createRoot(container).render(<HintApp />);
};

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', () => void mount());
} else {
	void mount();
}

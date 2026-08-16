import { API_URL, WIDGET_CDN_URL } from '@/shared/config';

const LOADER_SRC = `${WIDGET_CDN_URL}/embed/v1/loader.js`;

// Vite's production HTML transform drops classic (non-module) external
// <script> tags from index.html, so the documented embed snippet cannot
// live there. Inject the same tag from JS after the app boots.
export const injectHintEmbed = (): void => {
	if (document.querySelector('script[data-hint-company-id]')) {
		return;
	}
	const companyId = document
		.querySelector('meta[name="hint-company-id"]')
		?.getAttribute('content')
		?.trim();
	if (!companyId) {
		return;
	}
	const script = document.createElement('script');
	script.src = LOADER_SRC;
	script.defer = true;
	script.setAttribute('data-hint-company-id', companyId);
	script.setAttribute('data-hint-api-url', API_URL);
	document.body.appendChild(script);
};

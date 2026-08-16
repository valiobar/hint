export interface WidgetConfig {
	companyId: string;
	apiUrl: string;
	cdnBaseUrl: string;
}

// Loader sets window.__HINT__ before the IIFE runs. Missing global means
// the bundle was loaded outside the loader — mount must abort.
export const WIDGET_CONFIG: WidgetConfig | null = window.__HINT__
	? {
			companyId: window.__HINT__.companyId,
			apiUrl: window.__HINT__.apiUrl,
			cdnBaseUrl: window.__HINT__.cdnBaseUrl,
		}
	: null;

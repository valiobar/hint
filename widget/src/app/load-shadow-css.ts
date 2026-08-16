// Port of marketing-app load-shadow-css.ts.
// The define is rewritten to `hint-widget.{hash}.css` by the Step 2 plugin.
const CSS_FILENAME: string = __HINT_CSS_FILENAME__;

export const loadShadowCss = (
	shadowRoot: ShadowRoot,
	cdnBaseUrl: string,
): Promise<void> =>
	new Promise((resolve, reject) => {
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = `${cdnBaseUrl}/${CSS_FILENAME}`;
		link.onload = () => resolve();
		link.onerror = () =>
			reject(new Error(`Failed to load CSS from ${link.href}`));
		shadowRoot.appendChild(link);
	});

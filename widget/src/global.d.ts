interface HintGlobal {
	companyId: string;
	apiUrl: string;
	/**
	 * Directory of the loader.js `src` (no trailing slash), e.g.
	 * `http://localhost:1337/embed/v1`. Set by the generated loader so the
	 * IIFE bundle can resolve the hashed CSS URL. An IIFE has no
	 * `import.meta.url`, so the loader passes the same base it used to
	 * fetch this JS.
	 */
	cdnBaseUrl: string;
	mounted?: boolean;
}

interface Window {
	__HINT__?: HintGlobal;
}

/**
 * Compile-time CSS filename (`hint-widget.css`). Vite `define`s this as
 * the stable name; the content-hash plugin string-replaces it inside the
 * built JS with `hint-widget.{hash}.css` so the runtime always requests
 * the stylesheet produced by its own build.
 */
declare const __HINT_CSS_FILENAME__: string;

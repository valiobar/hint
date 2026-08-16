import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import type { Plugin } from 'vite';

const WIDGET_PREFIX = 'hint-widget';

/**
 * First 8 hex chars of sha256 — short enough for a URL, long enough that
 * a collision between two successive builds is not a practical concern.
 */
const hashFileContent = (filePath: string): string =>
	createHash('sha256')
		.update(readFileSync(filePath))
		.digest('hex')
		.slice(0, 8);

/**
 * Generate `loader.js` — the only file host pages ever name.
 *
 * Why this file exists
 * --------------------
 * Host pages embed a *stable* URL:
 *
 *   <script src="https://cdn.example/embed/v1/loader.js"
 *           data-hint-company-id="…"></script>
 *
 * The heavy artifacts (`hint-widget.{hash}.js` / `.css`) are content-hashed
 * and served `Cache-Control: public, max-age=31536000, immutable`. Browsers
 * will not revalidate them. If a host page pointed at those files directly,
 * a deploy would never reach already-embedded customers without a cache
 * purge or a snippet change — both unacceptable for an embed.
 *
 * `loader.js` is the opposite: nginx serves it `Cache-Control: no-store`.
 * Every page load re-fetches this tiny file, reads the *current* hashed
 * bundle name, and injects that. A new build therefore reaches every
 * customer on their next navigation. That is the loader's whole reason
 * to exist; everything else (singleton guard, config pickup) is the
 * Phase 0 embed contract riding along.
 *
 * Why it is generated, not checked in
 * -----------------------------------
 * Vite copies `public/` into `dist/` verbatim. A hand-written
 * `public/loader.js` would either (a) hard-code `hint-widget.js` and miss
 * the hash, or (b) be overwritten / overwrite the generated file. The
 * plugin is the single source of truth: the loader is written in
 * `writeBundle` *after* this build's hashes are known, so loader and
 * bundle can never reference different builds.
 *
 * Why `cdnBaseUrl` is stored on `window.__HINT__`
 * -----------------------------------------------
 * The widget ships as an IIFE, which has no `import.meta.url` to derive
 * the CDN directory from. The loader already knows that directory
 * (`tag.src` minus the filename) because that is how it fetches the JS
 * — it stores the same base so the runtime can build
 * `${cdnBaseUrl}/${__HINT_CSS_FILENAME__}` for the shadow-root <link>.
 *
 * Embed contract (must stay verbatim vs Phase 0 / docs/01)
 * --------------------------------------------------------
 * - Singleton: `window.__HINT__` already set → warn and abort.
 * - `data-hint-company-id` required; missing → error and abort.
 * - `data-hint-api-url` optional, default `http://localhost:8000`.
 * - Bundle URL is resolved from the loader's own `src`, never a
 *   hardcoded host, so loader and JS always come from one CDN path.
 */
export const buildLoader = (hashedJsName: string): string =>
	[
		'(() => {',
		'\tif (window.__HINT__) {',
		"\t\tconsole.warn('Hint is already initialized on this page');",
		'\t\treturn;',
		'\t}',
		// Two tags with the same loader src share one download; with
		// defer, currentScript is the last tag (or null). Always take
		// the first embed in document order so a singleton-guard
		// duplicate cannot steal company_id.
		'\tconst tag = document.querySelector(',
		"\t\t'script[data-hint-company-id]',",
		'\t);',
		"\tconst companyId = tag && tag.getAttribute('data-hint-company-id');",
		'\tif (!companyId) {',
		"\t\tconsole.error('Hint: data-hint-company-id is required');",
		'\t\treturn;',
		'\t}',
		"\tconst cdnBaseUrl = tag.src.substring(0, tag.src.lastIndexOf('/'));",
		'\twindow.__HINT__ = {',
		'\t\tcompanyId,',
		"\t\tapiUrl: tag.getAttribute('data-hint-api-url') || 'http://localhost:8000',",
		'\t\tcdnBaseUrl,',
		'\t};',
		"\tconst script = document.createElement('script');",
		`\tscript.src = cdnBaseUrl + '/${hashedJsName}';`,
		'\tscript.defer = true;',
		'\tdocument.head.appendChild(script);',
		'})();',
	].join('\n');

/**
 * Post-build: content-hash the CSS + JS, then generate `loader.js`.
 *
 * Order is load-bearing:
 *   1. Hash CSS, rename, *then* rewrite the stable CSS name inside the JS.
 *      The JS hash in step 2 must include that rewrite — otherwise two
 *      builds that only change CSS would keep the same JS filename while
 *      pointing at different stylesheets.
 *   2. Hash the rewritten JS and rename it.
 *   3. Write `loader.js` pointing at this build's hashed JS name.
 */
export const contentHashAndLoaderPlugin = (): Plugin => ({
	name: 'content-hash-and-loader',
	writeBundle(options: { dir?: string }) {
		const outDir = options.dir ?? 'dist';
		const cssPath = path.join(outDir, `${WIDGET_PREFIX}.css`);
		const jsPath = path.join(outDir, `${WIDGET_PREFIX}.js`);
		if (!existsSync(cssPath) || !existsSync(jsPath)) {
			return;
		}

		const cssHash = hashFileContent(cssPath);
		const hashedCssName = `${WIDGET_PREFIX}.${cssHash}.css`;
		renameSync(cssPath, path.join(outDir, hashedCssName));
		const jsContent = readFileSync(jsPath, 'utf-8').replace(
			new RegExp(`${WIDGET_PREFIX}\\.css`, 'g'),
			hashedCssName,
		);
		writeFileSync(jsPath, jsContent, 'utf-8');

		const jsHash = hashFileContent(jsPath);
		const hashedJsName = `${WIDGET_PREFIX}.${jsHash}.js`;
		renameSync(jsPath, path.join(outDir, hashedJsName));

		writeFileSync(
			path.join(outDir, 'loader.js'),
			buildLoader(hashedJsName),
			'utf-8',
		);
	},
});

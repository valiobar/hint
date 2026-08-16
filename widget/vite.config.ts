import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { contentHashAndLoaderPlugin } from './build-plugins/content-hash-and-loader';

export default defineConfig({
	plugins: [react(), contentHashAndLoaderPlugin()],
	resolve: {
		alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
	},
	define: {
		'process.env.NODE_ENV': JSON.stringify('production'),
		// Stable name only. The writeBundle plugin rewrites this string
		// inside the built JS to `hint-widget.{cssHash}.css` so the
		// runtime CSS URL always matches the file this build emitted.
		__HINT_CSS_FILENAME__: JSON.stringify('hint-widget.css'),
	},
	build: {
		lib: {
			entry: 'src/lib.tsx',
			name: 'HintWidget',
			formats: ['iife'],
			fileName: () => 'hint-widget.js',
		},
		rollupOptions: {
			external: [],
			output: {
				// Stable CSS name so the post-build plugin can find the
				// file and content-hash it. Hashed names cannot be known
				// here — hashing happens after Rollup writes the bundle.
				assetFileNames: (assetInfo) =>
					assetInfo.name?.endsWith('.css')
						? 'hint-widget.css'
						: (assetInfo.name ?? 'asset'),
			},
		},
	},
});

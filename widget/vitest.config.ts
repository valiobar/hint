import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
	viteConfig,
	defineConfig({
		define: {
			'process.env.NODE_ENV': JSON.stringify('test'),
		},
		test: {
			environment: 'jsdom',
			setupFiles: ['src/test/setup.ts'],
		},
	}),
);

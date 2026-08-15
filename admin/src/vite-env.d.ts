/// <reference types="vite/client" />
/// <reference types="react" />
/// <reference types="react-dom" />

interface ImportMetaEnv {
	readonly VITE_API_URL?: string;
	readonly VITE_WIDGET_CDN_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

declare module '*.module.css' {
	const classes: { readonly [key: string]: string };
	export default classes;
}

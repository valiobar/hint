export interface ProductFeature {
	id: string;
	title: string;
	howItWorks: string;
	howToAccess: string;
}

export const PRODUCT_FEATURES: ProductFeature[] = [
	{
		id: 'knowledge-base',
		title: 'Knowledge base',
		howItWorks:
			'Upload PDF, Markdown, TXT, or HTML. Hint chunks and embeds each file per company so chat and hover hints answer from those docs — not generic model knowledge.',
		howToAccess:
			'Select a company on the left, then drop files under Documents. Ready / failed status shows on each row.',
	},
	{
		id: 'embed',
		title: 'Embed snippet',
		howItWorks:
			'One script tag loads the Hint widget on any host page (open Shadow DOM). The widget talks to the public chat and hint APIs with that company id.',
		howToAccess:
			'Select a company and copy the snippet from the detail pane. Paste it into the host app (the demo page at :3002 already has one).',
	},
	{
		id: 'guide-bar',
		title: 'Guide bar',
		howItWorks:
			'A floating pill on the host page. Drag the grip to dock it left or right; the position is remembered for the tab.',
		howToAccess:
			'Sparkle opens chat. Lightbulb toggles hover hints. Keyboard: Ctrl/Cmd + /.',
	},
	{
		id: 'chat',
		title: 'Chat',
		howItWorks:
			'Ask “how do I …?” Answers stream from the company docs plus the current page (title, URL, visible controls). Source filenames appear under the reply.',
		howToAccess:
			'Open the panel from the sparkle on the guide bar, or press Ctrl/Cmd + /. Type in the composer.',
	},
	{
		id: 'element-chips',
		title: 'Element chips',
		howItWorks:
			'When an answer quotes a control label, that quote becomes a chip. Click it to flash the live element; the pointer button clicks or focuses it.',
		howToAccess:
			'After a reply that names a button or field, use the chip on that quoted label in the chat transcript.',
	},
	{
		id: 'hover-hints',
		title: 'Hover hints',
		howItWorks:
			'A one-sentence tooltip (≤140 characters) appears after you dwell on a control — grounded in the docs, or a neutral label if the KB does not mention it.',
		howToAccess:
			'Turn on the lightbulb on the guide bar, then hover an interactive element on the page.',
	},
	{
		id: 'walkthroughs',
		title: 'Guided walkthroughs',
		howItWorks:
			'How-to answers come back as numbered steps. Starting a walkthrough highlights one control at a time and advances when the user clicks it.',
		howToAccess:
			'Ask a how-to question, then Walk me through it under the completed answer. Back / Next / Stop on the card; Escape to stop.',
	},
];

export const SETUP_STEPS = [
	{
		id: 'company',
		title: 'Create a company',
		body: 'A company gets its own id and knowledge-base collection. Create one in the sidebar — it is selected automatically.',
	},
	{
		id: 'docs',
		title: 'Upload docs or paste URLs',
		body: 'Drop PDF, Markdown, TXT, or HTML, or ingest http(s) support pages. Wait for a ready pill before asking the widget.',
	},
	{
		id: 'snippet',
		title: 'Copy the embed snippet',
		body: 'One loader tag plus the company id. Paste it into the host app, or open the demo with that cmp_… query param.',
	},
	{
		id: 'host',
		title: 'Open the host page',
		body: 'The guide bar appears on the live page. Chat, hover hints, chips, and walkthroughs all read this company’s docs.',
	},
] as const;

export const STACK_STATS = [
	{ value: '1', label: 'tag', detail: 'One loader script per host page.' },
	{ value: '4', label: 'chips', detail: 'Starter questions on an empty chat.' },
	{ value: '7', label: 'features', detail: 'KB, embed, bar, chat, chips, hints, walks.' },
] as const;

export const STACK_SURFACES = [
	{
		port: '3001',
		title: 'Admin',
		body: 'This panel. Companies, documents, starter questions, and the snippet.',
	},
	{
		port: '1337',
		title: 'Widget CDN',
		body: 'loader.js plus the hashed widget bundle served to every host page.',
	},
	{
		port: '8000',
		title: 'API',
		body: 'Auth, ingestion, retrieval, chat SSE, and hover hints.',
	},
] as const;

export const PRODUCT_FAQ = [
	{
		q: 'Does Admin chat?',
		a: 'No. Operators manage the knowledge base here. End users talk to the widget on the host page.',
	},
	{
		q: 'Why did reload lose my company?',
		a: 'Selection is in-memory only. Click the company again — documents reload from the API.',
	},
	{
		q: 'Where do answers come from?',
		a: 'Per-company chunks in Chroma plus the live page. The model is not supposed to invent product facts.',
	},
] as const;

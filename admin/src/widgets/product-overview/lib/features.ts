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
			'Upload PDF, Markdown, TXT, or HTML. Chunks and embeddings stay per company — chat and hints use those docs, not generic model knowledge.',
		howToAccess:
			'Select a company, then drop files under Documents. Ready / failed shows on each row.',
	},
	{
		id: 'embed',
		title: 'Embed snippet',
		howItWorks:
			'One script tag loads the Shadow DOM widget. It calls public /chat and /hint with that company id.',
		howToAccess:
			'Copy the snippet from the company pane. Demo already has one — override with ?company_id=.',
	},
	{
		id: 'guide-bar',
		title: 'Guide bar',
		howItWorks:
			'Floating pill on the host. Drag the grip to dock left or right; the tab remembers the position.',
		howToAccess:
			'Sparkle opens chat. Lightbulb toggles hover hints. Keyboard: Ctrl/Cmd + /.',
	},
	{
		id: 'chat',
		title: 'Chat',
		howItWorks:
			'Ask how-do-I. Answers stream from the company docs plus the current page. Source filenames sit under the reply.',
		howToAccess:
			'Open the panel from the sparkle, or press Ctrl/Cmd + /. Type in the composer.',
	},
	{
		id: 'element-chips',
		title: 'Element chips',
		howItWorks:
			'When an answer quotes a control label, that quote becomes a chip. Click it to flash the live element.',
		howToAccess:
			'After a reply that names a button or field, use the chip on that quoted label.',
	},
	{
		id: 'hover-hints',
		title: 'Hover hints',
		howItWorks:
			'A one-sentence tooltip (≤140 characters) after you dwell on a control — from the docs, or a neutral label.',
		howToAccess:
			'Turn on the lightbulb, then hover an interactive element on the page.',
	},
	{
		id: 'walkthroughs',
		title: 'Guided walkthroughs',
		howItWorks:
			'Numbered how-tos can start a walkthrough that highlights one control at a time.',
		howToAccess:
			'Ask a how-to, then Walk me through it. Back / Next / Stop; Escape to exit.',
	},
];

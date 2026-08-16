export interface MarkdownParagraphBlock {
	type: 'paragraph';
	text: string;
}

export interface MarkdownListBlock {
	type: 'list';
	ordered: boolean;
	items: string[];
}

export type MarkdownBlock = MarkdownParagraphBlock | MarkdownListBlock;

export interface InlineSegment {
	type: 'text' | 'code';
	value: string;
}

const ORDERED_ITEM = /^\s*\d+[.)]\s+(.+)$/;
const UNORDERED_ITEM = /^\s*[-*•]\s+(.+)$/;
const INLINE_CODE = /`([^`\n]+)`/g;

/**
 * Line-based block parser for the markdown subset the assistant prompt
 * actually produces: ordered lists (`1.` / `1)`), unordered lists
 * (`-` / `*` / `•`), and paragraphs (blank lines split; single newlines
 * kept). Tolerant of half-streamed input — an incomplete trailing line
 * is just a short paragraph or item.
 */
export const parseMarkdownBlocks = (text: string): MarkdownBlock[] => {
	const blocks: MarkdownBlock[] = [];
	let paragraphLines: string[] = [];

	const flushParagraph = () => {
		if (paragraphLines.length > 0) {
			blocks.push({
				type: 'paragraph',
				text: paragraphLines.join('\n'),
			});
			paragraphLines = [];
		}
	};

	const pushListItem = (ordered: boolean, item: string) => {
		const last = blocks[blocks.length - 1];
		if (
			last &&
			last.type === 'list' &&
			last.ordered === ordered &&
			paragraphLines.length === 0
		) {
			last.items.push(item);
			return;
		}
		flushParagraph();
		blocks.push({ type: 'list', ordered, items: [item] });
	};

	for (const line of text.split('\n')) {
		const orderedMatch = line.match(ORDERED_ITEM);
		if (orderedMatch) {
			pushListItem(true, orderedMatch[1].trim());
			continue;
		}
		const unorderedMatch = line.match(UNORDERED_ITEM);
		if (unorderedMatch) {
			pushListItem(false, unorderedMatch[1].trim());
			continue;
		}
		if (line.trim() === '') {
			flushParagraph();
			continue;
		}
		paragraphLines.push(line);
	}
	flushParagraph();
	return blocks;
};

/**
 * Tokenizes `` `code` `` spans inside a text run so the renderer can
 * exclude them from element-chip parsing.
 */
export const splitInlineCode = (text: string): InlineSegment[] => {
	const segments: InlineSegment[] = [];
	let lastIndex = 0;
	for (const match of text.matchAll(INLINE_CODE)) {
		const index = match.index ?? 0;
		if (index > lastIndex) {
			segments.push({
				type: 'text',
				value: text.slice(lastIndex, index),
			});
		}
		segments.push({ type: 'code', value: match[1] });
		lastIndex = index + match[0].length;
	}
	if (lastIndex < text.length) {
		segments.push({ type: 'text', value: text.slice(lastIndex) });
	}
	return segments;
};

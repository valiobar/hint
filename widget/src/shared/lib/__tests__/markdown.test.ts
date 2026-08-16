import { describe, expect, it } from 'vitest';
import {
	parseMarkdownBlocks,
	splitInlineCode,
} from '@/shared/lib/markdown';

describe('parseMarkdownBlocks', () => {
	it('parses ordered lists with . and ) markers into one block', () => {
		const blocks = parseMarkdownBlocks('1. First\n2) Second');
		expect(blocks).toEqual([
			{ type: 'list', ordered: true, items: ['First', 'Second'] },
		]);
	});

	it('parses unordered lists and separates them from ordered ones', () => {
		const blocks = parseMarkdownBlocks('- A\n* B\n1. C');
		expect(blocks).toEqual([
			{ type: 'list', ordered: false, items: ['A', 'B'] },
			{ type: 'list', ordered: true, items: ['C'] },
		]);
	});

	it('splits paragraphs on blank lines and keeps single newlines', () => {
		const blocks = parseMarkdownBlocks('Line one\nLine two\n\nNext');
		expect(blocks).toEqual([
			{ type: 'paragraph', text: 'Line one\nLine two' },
			{ type: 'paragraph', text: 'Next' },
		]);
	});

	it('handles mixed content and empty input', () => {
		expect(parseMarkdownBlocks('')).toEqual([]);
		const blocks = parseMarkdownBlocks('Intro:\n1. Do this\n\nOutro');
		expect(blocks.map((b) => b.type)).toEqual([
			'paragraph',
			'list',
			'paragraph',
		]);
	});
});

describe('splitInlineCode', () => {
	it('tokenizes code spans and preserves surrounding text', () => {
		expect(splitInlineCode('Run `pnpm dev` now')).toEqual([
			{ type: 'text', value: 'Run ' },
			{ type: 'code', value: 'pnpm dev' },
			{ type: 'text', value: ' now' },
		]);
		expect(splitInlineCode('no code')).toEqual([
			{ type: 'text', value: 'no code' },
		]);
	});
});

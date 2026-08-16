import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarkdownContent } from '@/shared/ui/markdown';

const passthrough = (text: string) => text;

describe('MarkdownContent', () => {
	it('renders ordered lists, paragraphs, and inline code', () => {
		const { container } = render(
			<MarkdownContent
				text={'Intro `cmd`\n\n1. First\n2. Second'}
				renderInline={passthrough}
			/>,
		);
		const list = screen.getByRole('list');
		expect(list.tagName).toBe('OL');
		expect(screen.getAllByRole('listitem')).toHaveLength(2);
		expect(screen.getByText('cmd').tagName).toBe('CODE');
		const paragraph = container.querySelector('p');
		expect(paragraph).not.toBeNull();
		expect(paragraph).toHaveTextContent('Intro cmd');
	});

	it('renders unordered lists as <ul>', () => {
		render(
			<MarkdownContent
				text={'- Alpha\n- Beta'}
				renderInline={passthrough}
			/>,
		);
		expect(screen.getByRole('list').tagName).toBe('UL');
		expect(screen.getAllByRole('listitem')).toHaveLength(2);
	});

	it('delegates plain text runs to renderInline', () => {
		const marker = (text: string) => (
			<em data-testid="inline">{text}</em>
		);
		render(<MarkdownContent text="hello" renderInline={marker} />);
		expect(screen.getByTestId('inline')).toHaveTextContent('hello');
	});

	it('never passes code spans to renderInline', () => {
		const seen: string[] = [];
		const recorder = (text: string) => {
			seen.push(text);
			return text;
		};
		render(
			<MarkdownContent
				text={'Run `pnpm dev` now'}
				renderInline={recorder}
			/>,
		);
		expect(seen).toEqual(['Run ', ' now']);
	});
});

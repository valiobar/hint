import { Fragment, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
	parseMarkdownBlocks,
	splitInlineCode,
} from '@/shared/lib/markdown';
import styles from '@/shared/ui/markdown/markdown-content.module.css';

interface MarkdownContentProps {
	text: string;
	// Injected by the widget layer so shared/ never imports the chip
	// parser from features/ (FSD boundary).
	renderInline: (text: string) => ReactNode;
}

export const MarkdownContent = ({
	text,
	renderInline,
}: MarkdownContentProps) => {
	const blocks = useMemo(() => parseMarkdownBlocks(text), [text]);

	const renderRun = (run: string): ReactNode =>
		splitInlineCode(run).map((segment, index) =>
			segment.type === 'code' ? (
				<code key={`code-${index}`} className={styles.code}>
					{segment.value}
				</code>
			) : (
				<Fragment key={`text-${index}`}>
					{renderInline(segment.value)}
				</Fragment>
			),
		);

	return (
		<div className={styles.markdown} data-testid="markdown-content">
			{blocks.map((block, index) =>
				block.type === 'paragraph' ? (
					<p key={index} className={styles.paragraph}>
						{renderRun(block.text)}
					</p>
				) : block.ordered ? (
					<ol key={index} className={styles.list}>
						{block.items.map((item, itemIndex) => (
							<li key={itemIndex}>{renderRun(item)}</li>
						))}
					</ol>
				) : (
					<ul key={index} className={styles.list}>
						{block.items.map((item, itemIndex) => (
							<li key={itemIndex}>{renderRun(item)}</li>
						))}
					</ul>
				),
			)}
		</div>
	);
};

import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { findElementByLabel } from '@/features/locate-element/lib/find-element-by-label';
import { ElementChip } from '@/features/locate-element/ui/element-chip';

// Models reference on-screen elements either as "quoted labels" (what the
// prompt asks for) or as **bold markdown** — accept both. Messages are
// rendered as plain text, so unmatched bold segments drop their asterisks.
const LABEL_SEGMENT = /"([^"\n]{1,80})"|\*\*([^*\n]{1,80})\*\*/g;

export const renderWithElementChips = (text: string): ReactNode[] => {
	const nodes: ReactNode[] = [];
	let lastIndex = 0;
	for (const match of text.matchAll(LABEL_SEGMENT)) {
		const [full, quoted, bolded] = match;
		const label = quoted ?? bolded;
		const index = match.index ?? 0;
		const fallback = quoted !== undefined ? full : bolded;
		nodes.push(
			<Fragment key={`t${index}`}>
				{text.slice(lastIndex, index)}
			</Fragment>,
			findElementByLabel(label) ? (
				<ElementChip key={`c${index}`} label={label} />
			) : (
				<Fragment key={`q${index}`}>{fallback}</Fragment>
			),
		);
		lastIndex = index + full.length;
	}
	nodes.push(<Fragment key="tail">{text.slice(lastIndex)}</Fragment>);
	return nodes;
};

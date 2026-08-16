import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { findElementByLabel } from '@/shared/lib/find-element-by-label';
import { ElementChip } from '@/features/locate-element/ui/element-chip';

// Models reference on-screen elements either as "quoted labels" (what the
// prompt asks for) or as **bold markdown** — accept both. Unmatched bold
// renders as <strong>; unmatched quotes stay literal prose.
const LABEL_SEGMENT = /"([^"\n]{1,80})"|\*\*([^*\n]{1,80})\*\*/g;

export const renderWithElementChips = (text: string): ReactNode[] => {
	const nodes: ReactNode[] = [];
	let lastIndex = 0;
	for (const match of text.matchAll(LABEL_SEGMENT)) {
		const [full, quoted, bolded] = match;
		const label = quoted ?? bolded;
		const index = match.index ?? 0;
		let labelNode: ReactNode;
		if (findElementByLabel(label)) {
			labelNode = <ElementChip key={`c${index}`} label={label} />;
		} else if (bolded !== undefined) {
			labelNode = <strong key={`b${index}`}>{bolded}</strong>;
		} else {
			labelNode = <Fragment key={`q${index}`}>{full}</Fragment>;
		}
		nodes.push(
			<Fragment key={`t${index}`}>
				{text.slice(lastIndex, index)}
			</Fragment>,
			labelNode,
		);
		lastIndex = index + full.length;
	}
	nodes.push(<Fragment key="tail">{text.slice(lastIndex)}</Fragment>);
	return nodes;
};

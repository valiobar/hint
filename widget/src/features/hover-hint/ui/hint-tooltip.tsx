import { type CSSProperties, useEffect } from 'react';
import {
	INTERACTIVE_SELECTOR,
	isInsideHintRoot,
} from '@/shared/lib/interactive-elements';
import { outlineElement } from '@/shared/lib/element-highlight';
import {
	useHintStore,
	type ActiveHint,
	type HintRectSnapshot,
} from '@/shared/store/hint-store';
import { computePlacement } from '@/features/hover-hint/lib/compute-placement';
import styles from '@/features/hover-hint/ui/hint-tooltip.module.css';

const findTargetByRect = (rect: HintRectSnapshot): Element | null => {
	for (const el of document.querySelectorAll(INTERACTIVE_SELECTOR)) {
		if (isInsideHintRoot(el)) {
			continue;
		}
		const current = el.getBoundingClientRect();
		if (
			current.top === rect.top &&
			current.left === rect.left &&
			current.width === rect.width &&
			current.height === rect.height
		) {
			return el;
		}
	}
	return null;
};

const HintTooltipView = ({ activeHint }: { activeHint: ActiveHint }) => {
	const placement = computePlacement(activeHint.rect);

	useEffect(() => {
		const el = findTargetByRect(activeHint.rect);
		if (!el) {
			return;
		}
		return outlineElement(el);
	}, [
		activeHint.rect.top,
		activeHint.rect.left,
		activeHint.rect.width,
		activeHint.rect.height,
	]);

	return (
		<div
			className={`${styles.tooltip} ${styles[placement.side]}`}
			style={
				{
					'--hint-tooltip-x': `${placement.x}px`,
					'--hint-tooltip-y': `${placement.y}px`,
				} as CSSProperties
			}
			role="tooltip"
			data-testid="hint-tooltip"
		>
			{activeHint.text ?? (
				<span
					className={styles.shimmer}
					data-testid="hint-tooltip-shimmer"
				/>
			)}
		</div>
	);
};

export const HintTooltip = () => {
	const activeHint = useHintStore((s) => s.activeHint);
	if (!activeHint) {
		return null;
	}
	return <HintTooltipView activeHint={activeHint} />;
};

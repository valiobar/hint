import type { HintRectSnapshot } from '@/shared/store/hint-store';

const GAP = 8;
const VIEWPORT_MARGIN = 8;
const TOOLTIP_ESTIMATED_HEIGHT = 44;
const TOOLTIP_MAX_WIDTH = 280;

export interface TooltipPlacement {
	x: number;
	y: number;
	side: 'above' | 'below';
}

export const computePlacement = (
	rect: HintRectSnapshot,
): TooltipPlacement => {
	const side =
		rect.top >= TOOLTIP_ESTIMATED_HEIGHT + GAP ? 'above' : 'below';
	const y =
		side === 'above'
			? rect.top - GAP
			: rect.top + rect.height + GAP;
	const centerX = rect.left + rect.width / 2;
	const x = Math.min(
		Math.max(centerX, VIEWPORT_MARGIN + TOOLTIP_MAX_WIDTH / 2),
		window.innerWidth - VIEWPORT_MARGIN - TOOLTIP_MAX_WIDTH / 2,
	);
	return { x, y, side };
};

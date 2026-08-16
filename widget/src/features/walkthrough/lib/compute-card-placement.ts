import type { HintRectSnapshot } from '@/shared/store/hint-store';

const GAP = 12;
const VIEWPORT_MARGIN = 16;
const CARD_ESTIMATED_HEIGHT = 140;
const CARD_MAX_WIDTH = 320;

export interface CardPlacement {
	x: number;
	y: number;
	side: 'above' | 'below' | 'floating';
}

export const computeCardPlacement = (
	rect: HintRectSnapshot | null,
): CardPlacement => {
	if (!rect) {
		return {
			x: window.innerWidth / 2,
			y: window.innerHeight - VIEWPORT_MARGIN,
			side: 'floating',
		};
	}
	const fitsBelow =
		rect.top + rect.height + GAP + CARD_ESTIMATED_HEIGHT <=
		window.innerHeight - VIEWPORT_MARGIN;
	const side = fitsBelow ? 'below' : 'above';
	const y =
		side === 'below'
			? rect.top + rect.height + GAP
			: rect.top - GAP;
	const centerX = rect.left + rect.width / 2;
	const x = Math.min(
		Math.max(centerX, VIEWPORT_MARGIN + CARD_MAX_WIDTH / 2),
		window.innerWidth - VIEWPORT_MARGIN - CARD_MAX_WIDTH / 2,
	);
	return { x, y, side };
};

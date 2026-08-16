import type { DockSide } from '@/shared/store/hint-store';

export interface ViewportSize {
	width: number;
	height: number;
}

export interface BarRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface BarSize {
	width: number;
	height: number;
}

export interface DockPosition {
	side: DockSide;
	topFraction: number;
}

export interface DockCoordinates {
	x: number;
	y: number;
}

export const DOCK_EDGE_MARGIN = 8;

const clamp = (value: number, min: number, max: number): number =>
	Math.min(Math.max(value, min), Math.max(min, max));

/** Picks the nearest screen side for the released bar. */
export const computeDockPosition = (
	rect: BarRect,
	viewport: ViewportSize,
): DockPosition => {
	const centerX = rect.left + rect.width / 2;
	const centerY = rect.top + rect.height / 2;
	const side: DockSide =
		centerX < viewport.width / 2 ? 'left' : 'right';
	const topFraction =
		viewport.height > 0 ? clamp(centerY / viewport.height, 0, 1) : 0.5;
	return { side, topFraction };
};

/** Resolves a docked position to viewport pixel coordinates. */
export const dockToCoordinates = (
	side: DockSide,
	topFraction: number,
	barSize: BarSize,
	viewport: ViewportSize,
): DockCoordinates => {
	const x = side === 'left' ? 0 : viewport.width - barSize.width;
	const y = clamp(
		topFraction * viewport.height - barSize.height / 2,
		DOCK_EDGE_MARGIN,
		viewport.height - barSize.height - DOCK_EDGE_MARGIN,
	);
	return { x, y };
};

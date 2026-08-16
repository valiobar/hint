import {
	type CSSProperties,
	type PointerEvent as ReactPointerEvent,
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';
import { useHintStore } from '@/shared/store/hint-store';
import {
	computeDockPosition,
	dockToCoordinates,
	type DockCoordinates,
	type ViewportSize,
} from '@/widgets/guide-bar/lib/compute-dock';

interface DragDockResult {
	barRef: RefObject<HTMLDivElement>;
	isDragging: boolean;
	barStyle: CSSProperties;
	handleGripPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
	handleGripPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
	handleGripPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
}

const getViewport = (): ViewportSize => ({
	width: window.innerWidth,
	height: window.innerHeight,
});

/**
 * Drag-to-dock behavior for the guide bar. While dragging, the bar
 * follows the pointer 1:1; on release it snaps to the nearest
 * left/right edge (the CSS left/top transition provides the glide)
 * and the docked position is persisted in the store.
 */
export const useDragDock = (): DragDockResult => {
	const dockSide = useHintStore((s) => s.dockSide);
	const dockTopFraction = useHintStore((s) => s.dockTopFraction);
	const setDockPosition = useHintStore((s) => s.setDockPosition);

	const barRef = useRef<HTMLDivElement>(null);
	// Pointer offset from the bar's top-left corner, captured on grab.
	const grabOffsetRef = useRef<{ x: number; y: number } | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [position, setPosition] = useState<DockCoordinates>({
		x: 0,
		y: 0,
	});

	const applyDockedPosition = useCallback(() => {
		const bar = barRef.current;
		if (!bar) {
			return;
		}
		const { width, height } = bar.getBoundingClientRect();
		setPosition(
			dockToCoordinates(
				dockSide,
				dockTopFraction,
				{ width, height },
				getViewport(),
			),
		);
	}, [dockSide, dockTopFraction]);

	// Runs before paint so the initial render never flashes at (0, 0),
	// and re-runs after release so the snap transition has its target.
	useLayoutEffect(() => {
		if (isDragging) {
			return;
		}
		applyDockedPosition();
	}, [isDragging, applyDockedPosition]);

	const handleResize = useCallback(() => {
		if (!isDragging) {
			applyDockedPosition();
		}
	}, [isDragging, applyDockedPosition]);

	useEffect(() => {
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, [handleResize]);

	const handleGripPointerDown = useCallback(
		(event: ReactPointerEvent<HTMLElement>) => {
			const bar = barRef.current;
			if (!bar) {
				return;
			}
			const rect = bar.getBoundingClientRect();
			grabOffsetRef.current = {
				x: event.clientX - rect.left,
				y: event.clientY - rect.top,
			};
			// jsdom lacks pointer capture; browsers need it so moves
			// keep flowing to the grip when the pointer outruns it.
			event.currentTarget.setPointerCapture?.(event.pointerId);
			setIsDragging(true);
			setPosition({
				x: event.clientX - grabOffsetRef.current.x,
				y: event.clientY - grabOffsetRef.current.y,
			});
		},
		[],
	);

	const handleGripPointerMove = useCallback(
		(event: ReactPointerEvent<HTMLElement>) => {
			const grabOffset = grabOffsetRef.current;
			if (!grabOffset) {
				return;
			}
			setPosition({
				x: event.clientX - grabOffset.x,
				y: event.clientY - grabOffset.y,
			});
		},
		[],
	);

	const handleGripPointerUp = useCallback(
		(event: ReactPointerEvent<HTMLElement>) => {
			if (!grabOffsetRef.current) {
				return;
			}
			grabOffsetRef.current = null;
			event.currentTarget.releasePointerCapture?.(event.pointerId);
			const bar = barRef.current;
			if (bar) {
				const rect = bar.getBoundingClientRect();
				const { side, topFraction } = computeDockPosition(
					{
						left: rect.left,
						top: rect.top,
						width: rect.width,
						height: rect.height,
					},
					getViewport(),
				);
				setDockPosition(side, topFraction);
			}
			setIsDragging(false);
		},
		[setDockPosition],
	);

	return {
		barRef,
		isDragging,
		barStyle: {
			'--bar-x': `${position.x}px`,
			'--bar-y': `${position.y}px`,
		} as CSSProperties,
		handleGripPointerDown,
		handleGripPointerMove,
		handleGripPointerUp,
	};
};

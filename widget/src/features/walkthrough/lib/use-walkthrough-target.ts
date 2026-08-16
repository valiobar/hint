import { useCallback, useEffect, useRef, useState } from 'react';
import { findElementByLabel } from '@/shared/lib/find-element-by-label';
import { outlineElement } from '@/shared/lib/element-highlight';
import type { HintRectSnapshot } from '@/shared/store/hint-store';

const RESOLVE_INTERVAL_MS = 200;
const RESOLVE_TIMEOUT_MS = 2000;

interface WalkthroughTarget {
	element: Element | null;
	rect: HintRectSnapshot | null;
}

export const useWalkthroughTarget = (
	label: string | null,
	stepIndex: number,
): WalkthroughTarget => {
	const [target, setTarget] = useState<WalkthroughTarget>({
		element: null,
		rect: null,
	});
	const removeOutlineRef = useRef<(() => void) | null>(null);

	const snapshotRect = useCallback((el: Element): HintRectSnapshot => {
		const { top, left, width, height } = el.getBoundingClientRect();
		return { top, left, width, height };
	}, []);

	const adoptElement = useCallback(
		(el: Element) => {
			removeOutlineRef.current?.();
			removeOutlineRef.current = outlineElement(el);
			(el as HTMLElement).scrollIntoView({
				behavior: 'smooth',
				block: 'center',
			});
			setTarget({ element: el, rect: snapshotRect(el) });
		},
		[snapshotRect],
	);

	useEffect(() => {
		setTarget({ element: null, rect: null });
		if (!label) {
			return;
		}
		let elapsed = 0;
		const tryResolve = () => {
			const el = findElementByLabel(label);
			if (el) {
				window.clearInterval(timer);
				adoptElement(el);
			} else if ((elapsed += RESOLVE_INTERVAL_MS) >= RESOLVE_TIMEOUT_MS) {
				window.clearInterval(timer);
			}
		};
		const timer = window.setInterval(tryResolve, RESOLVE_INTERVAL_MS);
		tryResolve();
		return () => {
			window.clearInterval(timer);
			removeOutlineRef.current?.();
			removeOutlineRef.current = null;
		};
	}, [label, stepIndex, adoptElement]);

	const handleReposition = useCallback(() => {
		setTarget((current) =>
			current.element
				? { ...current, rect: snapshotRect(current.element) }
				: current,
		);
	}, [snapshotRect]);

	useEffect(() => {
		window.addEventListener('scroll', handleReposition, {
			capture: true,
			passive: true,
		});
		window.addEventListener('resize', handleReposition);
		return () => {
			window.removeEventListener('scroll', handleReposition, true);
			window.removeEventListener('resize', handleReposition);
		};
	}, [handleReposition]);

	return target;
};

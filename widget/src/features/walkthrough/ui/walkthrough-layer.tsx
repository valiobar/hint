import { useCallback, useEffect, useRef } from 'react';
import { useHintStore } from '@/shared/store/hint-store';
import { useWalkthroughTarget } from '@/features/walkthrough/lib/use-walkthrough-target';
import { computeCardPlacement } from '@/features/walkthrough/lib/compute-card-placement';
import { WalkthroughCard } from '@/features/walkthrough/ui/walkthrough-card';

const AUTO_ADVANCE_DELAY_MS = 600;

const ActiveWalkthrough = () => {
	const walkthrough = useHintStore((s) => s.walkthrough)!;
	const nextStep = useHintStore((s) => s.nextWalkthroughStep);
	const prevStep = useHintStore((s) => s.prevWalkthroughStep);
	const stopWalkthrough = useHintStore((s) => s.stopWalkthrough);

	const { steps, activeStepIndex } = walkthrough;
	const step = steps[activeStepIndex];
	const { element, rect } = useWalkthroughTarget(
		step.label,
		activeStepIndex,
	);
	const elementRef = useRef<Element | null>(null);
	elementRef.current = element;
	const advanceTimerRef = useRef<number | null>(null);

	const handlePointerDown = useCallback(
		(event: PointerEvent) => {
			const target = elementRef.current;
			if (!target || !(event.target instanceof Node)) {
				return;
			}
			if (target === event.target || target.contains(event.target)) {
				advanceTimerRef.current = window.setTimeout(
					nextStep,
					AUTO_ADVANCE_DELAY_MS,
				);
			}
		},
		[nextStep],
	);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				stopWalkthrough();
			}
		},
		[stopWalkthrough],
	);

	useEffect(() => {
		document.addEventListener('pointerdown', handlePointerDown, true);
		document.addEventListener('keydown', handleKeyDown);
		return () => {
			document.removeEventListener(
				'pointerdown',
				handlePointerDown,
				true,
			);
			document.removeEventListener('keydown', handleKeyDown);
			if (advanceTimerRef.current !== null) {
				window.clearTimeout(advanceTimerRef.current);
			}
		};
	}, [handlePointerDown, handleKeyDown]);

	return (
		<WalkthroughCard
			stepNumber={activeStepIndex + 1}
			totalSteps={steps.length}
			instruction={step.instruction}
			isElementFound={element !== null}
			placement={computeCardPlacement(rect)}
			onBack={prevStep}
			onNext={nextStep}
			onStop={stopWalkthrough}
		/>
	);
};

export const WalkthroughLayer = () => {
	const hasWalkthrough = useHintStore((s) => s.walkthrough !== null);
	if (!hasWalkthrough) {
		return null;
	}
	return <ActiveWalkthrough />;
};

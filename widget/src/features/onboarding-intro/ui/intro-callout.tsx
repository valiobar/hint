import { type AnimationEvent, useEffect, useState } from 'react';
import { useExitAnimation } from '@/shared/lib/use-exit-animation';
import { useHintStore, type DockSide } from '@/shared/store/hint-store';
import { CloseIcon } from '@/shared/ui/icons';
import styles from '@/features/onboarding-intro/ui/intro-callout.module.css';

interface IntroCalloutProps {
	dockSide: DockSide;
	isDragging: boolean;
}

export const IntroCallout = ({
	dockSide,
	isDragging,
}: IntroCalloutProps) => {
	const hasSeenIntro = useHintStore((s) => s.hasSeenIntro);
	const isDisabled = useHintStore((s) => s.isDisabled);
	const openPanel = useHintStore((s) => s.openPanel);
	const markIntroSeen = useHintStore((s) => s.markIntroSeen);

	// Delayed reveal: barIn finishes at ~620ms; wait ~1.5s total.
	const [isReady, setIsReady] = useState(false);
	useEffect(() => {
		const timer = setTimeout(() => setIsReady(true), 1500);
		return () => clearTimeout(timer);
	}, []);

	const isVisible =
		isReady && !hasSeenIntro && !isDisabled && !isDragging;
	const { shouldRender, isClosing, handleExitEnd } =
		useExitAnimation(isVisible);

	const handleAnimationEnd = (event: AnimationEvent) => {
		if (event.target === event.currentTarget) {
			handleExitEnd();
		}
	};

	if (!shouldRender) {
		return null;
	}

	return (
		<div
			className={
				`${styles.callout} ` +
				`${dockSide === 'left' ? styles.dockedLeft : ''} ` +
				`${isClosing ? styles.closing : ''}`
			}
			role="note"
			aria-label="Hint introduction"
			data-testid="intro-callout"
			onAnimationEnd={handleAnimationEnd}
		>
			<button
				type="button"
				className={styles.body}
				onClick={openPanel}
			>
				Hi, I'm Hint 👋 — ask me anything about this app.
			</button>
			<button
				type="button"
				className={styles.dismiss}
				onClick={markIntroSeen}
				aria-label="Dismiss introduction"
				data-testid="intro-callout-dismiss"
			>
				<CloseIcon />
			</button>
		</div>
	);
};

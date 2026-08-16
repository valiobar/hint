import type { CSSProperties } from 'react';
import type { CardPlacement } from '@/features/walkthrough/lib/compute-card-placement';
import styles from '@/features/walkthrough/ui/walkthrough-card.module.css';

interface WalkthroughCardProps {
	stepNumber: number;
	totalSteps: number;
	instruction: string;
	isElementFound: boolean;
	placement: CardPlacement;
	onBack: () => void;
	onNext: () => void;
	onStop: () => void;
}

export const WalkthroughCard = ({
	stepNumber,
	totalSteps,
	instruction,
	isElementFound,
	placement,
	onBack,
	onNext,
	onStop,
}: WalkthroughCardProps) => {
	const isLast = stepNumber === totalSteps;
	return (
		<div
			className={`${styles.card} ${styles[placement.side]}`}
			style={
				{
					'--walkthrough-card-x': `${placement.x}px`,
					'--walkthrough-card-y': `${placement.y}px`,
					'--walkthrough-progress':
						`${(stepNumber / totalSteps) * 100}%`,
				} as CSSProperties
			}
			role="dialog"
			aria-label={`Walkthrough step ${stepNumber} of ${totalSteps}`}
			data-testid="walkthrough-card"
		>
			<div className={styles.progress} aria-hidden="true">
				<span className={styles.progressFill} />
			</div>
			<p className={styles.counter}>
				Step {stepNumber} of {totalSteps}
			</p>
			<p className={styles.instruction} aria-live="polite">
				{instruction}
			</p>
			{!isElementFound && (
				<p
					className={styles.notFound}
					data-testid="walkthrough-not-found"
				>
					Can't find this element on the current page — do the
					step manually, then press Next.
				</p>
			)}
			<div className={styles.actions}>
				<button
					type="button"
					onClick={onBack}
					disabled={stepNumber === 1}
					data-testid="walkthrough-back"
				>
					Back
				</button>
				<button
					type="button"
					className={styles.next}
					onClick={onNext}
					data-testid="walkthrough-next"
				>
					{isLast ? 'Done' : 'Next'}
				</button>
				<button
					type="button"
					className={styles.stop}
					onClick={onStop}
					aria-label="Stop walkthrough"
					data-testid="walkthrough-stop"
				>
					Stop
				</button>
			</div>
		</div>
	);
};

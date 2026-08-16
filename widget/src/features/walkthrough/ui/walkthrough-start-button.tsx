import { useHintStore, type WalkthroughStep } from '@/shared/store/hint-store';
import { PointerClickIcon } from '@/shared/ui/icons';
import styles from '@/features/walkthrough/ui/walkthrough-start-button.module.css';

interface WalkthroughStartButtonProps {
	steps: WalkthroughStep[];
}

export const WalkthroughStartButton = ({
	steps,
}: WalkthroughStartButtonProps) => {
	const startWalkthrough = useHintStore((s) => s.startWalkthrough);
	const handleClick = () => startWalkthrough(steps);
	return (
		<button
			type="button"
			className={styles.button}
			onClick={handleClick}
			data-testid="walkthrough-start"
		>
			<PointerClickIcon size={14} />
			Walk me through it
		</button>
	);
};

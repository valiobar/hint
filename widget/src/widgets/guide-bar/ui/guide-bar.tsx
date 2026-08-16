import { useHintStore } from '@/shared/store/hint-store';
import { LightbulbIcon, SparkleIcon } from '@/shared/ui/icons';
import styles from '@/widgets/guide-bar/ui/guide-bar.module.css';

export const GuideBar = () => {
	const isOpen = useHintStore((s) => s.isOpen);
	const isHintModeEnabled = useHintStore((s) => s.isHintModeEnabled);
	const isDisabled = useHintStore((s) => s.isDisabled);
	const togglePanel = useHintStore((s) => s.togglePanel);
	const toggleHintMode = useHintStore((s) => s.toggleHintMode);

	return (
		<div
			className={
				`${styles.bar} ${isDisabled ? styles.disabled : ''}`
			}
			data-testid="guide-bar"
			title={isDisabled ? 'Hint is not configured' : undefined}
		>
			<button
				type="button"
				className={
					`${styles.barButton} ${isOpen ? styles.active : ''}`
				}
				onClick={togglePanel}
				disabled={isDisabled}
				aria-label={
					isOpen ? 'Close Hint chat' : 'Open Hint chat'
				}
				aria-expanded={isOpen}
				data-testid="guide-bar-chat-toggle"
			>
				<SparkleIcon />
			</button>
			<button
				type="button"
				className={
					`${styles.barButton} ${
						isHintModeEnabled ? styles.active : ''
					}`
				}
				onClick={toggleHintMode}
				disabled={isDisabled}
				aria-label="Toggle hover hints"
				aria-pressed={isHintModeEnabled}
				data-testid="guide-bar-hints-toggle"
			>
				<LightbulbIcon />
			</button>
		</div>
	);
};

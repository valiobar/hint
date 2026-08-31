import { useState } from 'react';
import { IntroCallout } from '@/features/onboarding-intro';
import { useHintStore } from '@/shared/store/hint-store';
import { GripIcon, LightbulbIcon, SparkleIcon } from '@/shared/ui/icons';
import { useDragDock } from '@/widgets/guide-bar/lib/use-drag-dock';
import styles from '@/widgets/guide-bar/ui/guide-bar.module.css';

export const GuideBar = () => {
	const isOpen = useHintStore((s) => s.isOpen);
	const isHintModeEnabled = useHintStore((s) => s.isHintModeEnabled);
	const isDisabled = useHintStore((s) => s.isDisabled);
	const hasSeenIntro = useHintStore((s) => s.hasSeenIntro);
	const dockSide = useHintStore((s) => s.dockSide);
	const togglePanel = useHintStore((s) => s.togglePanel);
	const toggleHintMode = useHintStore((s) => s.toggleHintMode);
	// Frozen at mount so the flag flipping mid-session never retriggers
	// the entrance animation.
	const [wasFirstVisit] = useState(
		() => !useHintStore.getState().hasSeenIntro,
	);
	const {
		barRef,
		isDragging,
		barStyle,
		handleGripPointerDown,
		handleGripPointerMove,
		handleGripPointerUp,
	} = useDragDock();

	return (
		<div
			ref={barRef}
			className={
				`${styles.positioner} ` +
				`${isDragging ? styles.positionerDragging : ''}`
			}
			style={barStyle}
			data-testid="guide-bar-positioner"
		>
			<IntroCallout dockSide={dockSide} isDragging={isDragging} />
			<div
				className={
					`${styles.bar} ` +
					`${wasFirstVisit ? styles.firstVisit : ''} ` +
					`${dockSide === 'left' ? styles.dockedLeft : ''} ` +
					`${isDragging ? styles.dragging : ''} ` +
					`${isDisabled ? styles.disabled : ''}`
				}
				data-testid="guide-bar"
				title={isDisabled ? 'Hint is not configured' : undefined}
			>
				<span
					className={styles.grip}
					onPointerDown={handleGripPointerDown}
					onPointerMove={handleGripPointerMove}
					onPointerUp={handleGripPointerUp}
					onPointerCancel={handleGripPointerUp}
					aria-hidden="true"
					data-testid="guide-bar-grip"
				>
					<GripIcon />
				</span>
				<button
					type="button"
					className={
						`${styles.barButton} ${isOpen ? styles.active : ''} ` +
						`${!hasSeenIntro && !isDisabled ? styles.attention : ''}`
					}
					onClick={togglePanel}
					disabled={isDisabled}
					aria-label={
						isOpen ? 'Close Hint chat' : 'Open Hint chat'
					}
					aria-expanded={isOpen}
					data-tooltip="Ask Hint anything"
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
					data-tooltip="Explain elements on hover"
					data-testid="guide-bar-hints-toggle"
				>
					<LightbulbIcon />
				</button>
			</div>
		</div>
	);
};

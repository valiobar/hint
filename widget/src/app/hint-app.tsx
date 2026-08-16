import { useEffect, useCallback } from 'react';
import { GuideBar } from '@/widgets/guide-bar';
import { ChatPanel } from '@/widgets/chat-panel';
import { HintLayer } from '@/features/hover-hint';
import { WalkthroughLayer } from '@/features/walkthrough';
import { useHintStore } from '@/shared/store/hint-store';
import { useExitAnimation } from '@/shared/lib/use-exit-animation';

export const HintApp = () => {
	const isOpen = useHintStore((s) => s.isOpen);
	const isDisabled = useHintStore((s) => s.isDisabled);
	const togglePanel = useHintStore((s) => s.togglePanel);
	const { shouldRender, isClosing, handleExitEnd } =
		useExitAnimation(isOpen);

	const handleShortcut = useCallback(
		(event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key === '/') {
				event.preventDefault();
				togglePanel();
			}
		},
		[togglePanel],
	);

	useEffect(() => {
		if (isDisabled) {
			return;
		}
		document.addEventListener('keydown', handleShortcut);
		return () => document.removeEventListener('keydown', handleShortcut);
	}, [handleShortcut, isDisabled]);

	return (
		<>
			<GuideBar />
			{shouldRender && (
				<ChatPanel
					isClosing={isClosing}
					onExitEnd={handleExitEnd}
				/>
			)}
			<HintLayer />
			<WalkthroughLayer />
		</>
	);
};

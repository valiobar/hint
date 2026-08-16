import { useCallback, useEffect, useState } from 'react';

interface ExitAnimationState {
	shouldRender: boolean;
	isClosing: boolean;
	handleExitEnd: () => void;
}

/**
 * Keeps a component mounted after `isOpen` flips to false so a CSS
 * exit animation can play. The component must call `handleExitEnd`
 * from its `onAnimationEnd` once the closing animation finishes.
 */
export const useExitAnimation = (isOpen: boolean): ExitAnimationState => {
	const [shouldRender, setShouldRender] = useState(isOpen);

	useEffect(() => {
		if (isOpen) {
			setShouldRender(true);
		}
	}, [isOpen]);

	const handleExitEnd = useCallback(() => {
		if (!isOpen) {
			setShouldRender(false);
		}
	}, [isOpen]);

	return {
		shouldRender,
		isClosing: shouldRender && !isOpen,
		handleExitEnd,
	};
};

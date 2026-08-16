import { useCallback, useEffect, useRef, useState } from 'react';

const RESET_AFTER_MS = 2000;

export const useCopyToClipboard = () => {
	const [isCopied, setIsCopied] = useState(false);
	const timerRef = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timerRef.current !== null) {
				window.clearTimeout(timerRef.current);
			}
		},
		[],
	);

	const copy = useCallback(async (value: string) => {
		try {
			await navigator.clipboard.writeText(value);
			setIsCopied(true);
			if (timerRef.current !== null) {
				window.clearTimeout(timerRef.current);
			}
			timerRef.current = window.setTimeout(() => {
				setIsCopied(false);
			}, RESET_AFTER_MS);
		} catch {
			// Clipboard unavailable (insecure context / permission denied)
			console.warn('Hint: clipboard write failed');
		}
	}, []);

	return { isCopied, copy };
};

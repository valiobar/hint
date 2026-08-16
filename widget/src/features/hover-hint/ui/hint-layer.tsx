import { useEffect, useRef } from 'react';
import { useHintStore } from '@/shared/store/hint-store';
import {
	createHintEngine,
	type HintEngine,
} from '@/features/hover-hint/lib/hint-engine';
import { HintTooltip } from '@/features/hover-hint/ui/hint-tooltip';

export const HintLayer = () => {
	const isHintModeEnabled = useHintStore((s) => s.isHintModeEnabled);
	const isDisabled = useHintStore((s) => s.isDisabled);
	const engineRef = useRef<HintEngine | null>(null);

	useEffect(() => {
		if (!isHintModeEnabled || isDisabled) {
			return;
		}
		engineRef.current ??= createHintEngine();
		const engine = engineRef.current;
		engine.enable();
		return () => engine.disable();
	}, [isHintModeEnabled, isDisabled]);

	return <HintTooltip />;
};

import type { ElementDescriptor } from '@/shared/api/types';

export const buildHintCacheKey = (
	descriptor: ElementDescriptor,
): string =>
	`${location.pathname}|${descriptor.selector_path}|${
		descriptor.text ?? ''
	}`;

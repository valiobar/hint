import type { IconProps } from '@/shared/ui/icons/types';

export const GripIcon = ({ size = 14, className }: IconProps) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="currentColor"
		stroke="none"
		aria-hidden="true"
		className={className}
	>
		<circle cx="9" cy="5" r="1.6" />
		<circle cx="15" cy="5" r="1.6" />
		<circle cx="9" cy="12" r="1.6" />
		<circle cx="15" cy="12" r="1.6" />
		<circle cx="9" cy="19" r="1.6" />
		<circle cx="15" cy="19" r="1.6" />
	</svg>
);

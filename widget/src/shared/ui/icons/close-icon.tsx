import type { IconProps } from '@/shared/ui/icons/types';

export const CloseIcon = ({ size = 18, className }: IconProps) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.8"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
		className={className}
	>
		<path d="M6 6l12 12M18 6L6 18" />
	</svg>
);

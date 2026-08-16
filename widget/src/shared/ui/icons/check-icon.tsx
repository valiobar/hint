import type { IconProps } from '@/shared/ui/icons/types';

export const CheckIcon = ({ size = 18, className }: IconProps) => (
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
		<path d="M4 12.5l5 5L20 6.5" />
	</svg>
);

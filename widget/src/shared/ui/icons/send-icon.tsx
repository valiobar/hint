import type { IconProps } from '@/shared/ui/icons/types';

export const SendIcon = ({ size = 18, className }: IconProps) => (
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
		<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
	</svg>
);

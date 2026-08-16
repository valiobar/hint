import type { IconProps } from '@/shared/ui/icons/types';

export const CopyIcon = ({ size = 18, className }: IconProps) => (
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
		<rect x="9" y="9" width="11" height="11" rx="2" />
		<path d="M5 15V5a2 2 0 0 1 2-2h10" />
	</svg>
);

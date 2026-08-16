import type { IconProps } from '@/shared/ui/icons/types';

export const PointerClickIcon = ({ size = 12, className }: IconProps) => (
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
		<path d="M14 4.1 12 6" />
		<path d="m5.1 8.2 1.9 1.9" />
		<path d="M15 15.6 12 18" />
		<path d="M7 14.9l-1.9 1.9" />
		<path d="M9.1 4.1 12 6" />
		<path d="M10.8 21.3 13.6 13.6 21.3 10.8 10.8 21.3z" />
	</svg>
);

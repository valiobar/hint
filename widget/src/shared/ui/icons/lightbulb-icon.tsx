import type { IconProps } from '@/shared/ui/icons/types';

export const LightbulbIcon = ({ size = 18, className }: IconProps) => (
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
		<path d="M9 18h6M10 22h4" />
		<path d="M12 2a6 6 0 0 0-4 10.9V16h8v-3.1A6 6 0 0 0 12 2z" />
	</svg>
);

import type { IconProps } from '@/shared/ui/icons/types';

export const NewChatIcon = ({ size = 18, className }: IconProps) => (
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
		<path
			d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.9-.9L3 20l1-4.9A8.4 8.4 0 1 1 21 11.5Z"
		/>
		<path d="M12 8v6M9 11h6" />
	</svg>
);

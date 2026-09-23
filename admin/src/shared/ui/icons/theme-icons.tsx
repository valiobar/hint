interface ThemeIconProps {
	size?: number;
}

export const MoonIcon = ({ size = 18 }: ThemeIconProps) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		aria-hidden="true"
	>
		<path
			d="M20 14.5A8.2 8.2 0 0 1 9.5 4 7 7 0 1 0 20 14.5Z"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinejoin="round"
		/>
	</svg>
);

export const SunIcon = ({ size = 18 }: ThemeIconProps) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		aria-hidden="true"
	>
		<circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.8" />
		<path
			d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
		/>
	</svg>
);

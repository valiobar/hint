interface GoogleIconProps {
	size?: number;
}

export const GoogleIcon = ({ size = 18 }: GoogleIconProps) => (
	<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
		<path
			fill="#4285F4"
			d="M23.5 12.3c0-.8-.07-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z"
		/>
		<path
			fill="#34A853"
			d="M12 24c3.2 0 6-1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.8-3.8H1.3v3.1A12 12 0 0 0 12 24Z"
		/>
		<path
			fill="#FBBC05"
			d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z"
		/>
		<path
			fill="#EA4335"
			d="M12 4.7c1.8 0 3.3.6 4.6 1.8L20 3A12 12 0 0 0 1.3 6.6l4 3.1C6.2 6.8 8.9 4.7 12 4.7Z"
		/>
	</svg>
);

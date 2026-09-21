import type { ReactNode } from 'react';
import styles from './button.module.css';

interface ButtonProps {
	type?: 'button' | 'submit';
	disabled?: boolean;
	children: ReactNode;
	onClick?: () => void;
	variant?: 'primary' | 'ghost' | 'chip';
	className?: string;
	'aria-label'?: string;
}

export const Button = ({
	type = 'button',
	disabled = false,
	children,
	onClick,
	variant = 'primary',
	className,
	'aria-label': ariaLabel,
}: ButtonProps) => (
	<button
		type={type}
		disabled={disabled}
		className={[styles.button, styles[variant], className]
			.filter(Boolean)
			.join(' ')}
		onClick={onClick}
		aria-label={ariaLabel}
		data-testid="button"
	>
		{children}
	</button>
);

import type { ReactNode } from 'react';
import styles from './button.module.css';

interface ButtonProps {
	type?: 'button' | 'submit';
	disabled?: boolean;
	children: ReactNode;
	onClick?: () => void;
}

export const Button = ({
	type = 'button',
	disabled = false,
	children,
	onClick,
}: ButtonProps) => (
	<button
		type={type}
		disabled={disabled}
		className={styles.button}
		onClick={onClick}
		data-testid="button"
	>
		{children}
	</button>
);

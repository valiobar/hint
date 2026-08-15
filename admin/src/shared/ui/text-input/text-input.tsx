import type { ChangeEvent } from 'react';
import styles from './text-input.module.css';

interface TextInputProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	type?: 'text' | 'password';
	'aria-label': string;
}

export const TextInput = ({
	value,
	onChange,
	placeholder,
	type = 'text',
	'aria-label': ariaLabel,
}: TextInputProps) => {
	const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
		onChange(event.target.value);
	};

	return (
		<input
			type={type}
			className={styles.input}
			value={value}
			onChange={handleChange}
			placeholder={placeholder}
			aria-label={ariaLabel}
			data-testid="text-input"
		/>
	);
};

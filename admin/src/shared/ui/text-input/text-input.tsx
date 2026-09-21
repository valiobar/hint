import type { ChangeEvent } from 'react';
import styles from './text-input.module.css';

interface TextInputProps {
	id?: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	type?: 'text' | 'password';
	'aria-label': string;
}

export const TextInput = ({
	id,
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
			id={id}
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

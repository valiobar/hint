import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAdminStore } from '@/shared/store/admin-store';
import { Button, TextInput } from '@/shared/ui';
import { registerSchema } from '../model/schema';
import styles from './register-form.module.css';

export const RegisterForm = () => {
	const register = useAdminStore((s) => s.register);
	const isAuthenticating = useAdminStore((s) => s.isAuthenticating);
	const authError = useAdminStore((s) => s.authError);
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confirm, setConfirm] = useState('');
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		const parsed = registerSchema.safeParse({ email, password, confirm });
		if (!parsed.success) {
			setError(parsed.error.issues[0].message);
			return;
		}
		setError(null);
		await register(parsed.data.email, parsed.data.password);
		setPassword('');
		setConfirm('');
	};

	return (
		<form
			className={styles.form}
			onSubmit={handleSubmit}
			data-testid="register-form"
		>
			<TextInput
				value={email}
				onChange={setEmail}
				placeholder="Email"
				aria-label="Email"
			/>
			<TextInput
				value={password}
				onChange={setPassword}
				type="password"
				placeholder="8+ chars, upper, lower, number, symbol"
				aria-label="Password"
			/>
			<TextInput
				value={confirm}
				onChange={setConfirm}
				type="password"
				placeholder="Confirm password"
				aria-label="Confirm password"
			/>
			<Button type="submit" disabled={isAuthenticating} className={styles.submit}>
				{isAuthenticating ? 'Creating account…' : 'Create account'}
			</Button>
			{(error ?? authError) && (
				<p className={styles.error} role="alert">
					{error ?? authError}
				</p>
			)}
		</form>
	);
};

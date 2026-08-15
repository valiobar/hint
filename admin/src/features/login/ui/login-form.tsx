import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAdminStore } from '@/shared/store/admin-store';
import { Button, TextInput } from '@/shared/ui';
import { loginSchema } from '../model/schema';
import styles from './login-form.module.css';

export const LoginForm = () => {
	const login = useAdminStore((s) => s.login);
	const isAuthenticating = useAdminStore((s) => s.isAuthenticating);
	const authError = useAdminStore((s) => s.authError);
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		const parsed = loginSchema.safeParse({ email, password });
		if (!parsed.success) {
			setError(parsed.error.issues[0].message);
			return;
		}
		setError(null);
		await login(parsed.data.email, parsed.data.password);
		setPassword('');
	};

	return (
		<form
			className={styles.form}
			onSubmit={handleSubmit}
			data-testid="login-form"
		>
			<h1>Hint Admin</h1>
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
				placeholder="Password"
				aria-label="Password"
			/>
			<Button type="submit" disabled={isAuthenticating}>
				{isAuthenticating ? 'Signing in…' : 'Sign in'}
			</Button>
			{(error ?? authError) && (
				<p className={styles.error} role="alert">
					{error ?? authError}
				</p>
			)}
		</form>
	);
};

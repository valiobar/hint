import { useState } from 'react';
import { LoginForm } from '@/features/login';
import { RegisterForm } from '@/features/register';
import { googleLoginUrl } from '@/shared/api';
import { useAdminStore } from '@/shared/store/admin-store';
import { GoogleIcon, Wordmark } from '@/shared/ui';
import styles from './auth-screen.module.css';

export const AuthScreen = () => {
	const [mode, setMode] = useState<'login' | 'register'>('login');

	const switchMode = () => {
		useAdminStore.setState({ authError: null });
		setMode(mode === 'login' ? 'register' : 'login');
	};

	return (
		<div className={styles.card} data-testid="auth-screen">
			<Wordmark label="hint" />
			<p className={styles.kicker}>Admin</p>
			<h1>Hint Admin</h1>
			<p className={styles.lead}>
				{mode === 'login'
					? 'In-app AI guidance grounded in your docs and the live page. Sign in to manage companies and the embed.'
					: 'Create an account to manage companies, documents, and the embed snippet.'}
			</p>

			{mode === 'login' ? <LoginForm /> : <RegisterForm />}

			<div className={styles.divider}>or</div>

			<a className={styles.googleButton} href={googleLoginUrl()}>
				<GoogleIcon />
				Continue with Google
			</a>

			<button type="button" className={styles.switchMode} onClick={switchMode}>
				{mode === 'login'
					? 'No account yet? Sign up'
					: 'Already have an account? Sign in'}
			</button>
		</div>
	);
};

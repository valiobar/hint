import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { LoginForm } from '@/features/login';
import { setUnauthorizedHandler } from '@/shared/api';
import { useAdminStore } from '@/shared/store/admin-store';
import { Button } from '@/shared/ui';
import { ApiStatusBadge } from '@/widgets/api-status';
import { CompaniesSidebar } from '@/widgets/companies-sidebar';
import { CompanyDetail } from '@/widgets/company-detail';
import styles from './app.module.css';

export const App = () => {
	const { isAuthenticated, adminEmail, selectedCompanyId } = useAdminStore(
		useShallow((s) => ({
			isAuthenticated: s.isAuthenticated,
			adminEmail: s.adminEmail,
			selectedCompanyId: s.selectedCompanyId,
		})),
	);
	const restoreSession = useAdminStore((s) => s.restoreSession);
	const logout = useAdminStore((s) => s.logout);

	useEffect(() => {
		setUnauthorizedHandler(logout);
	}, [logout]);

	useEffect(() => {
		void restoreSession();
	}, [restoreSession]);

	if (!isAuthenticated) {
		return (
			<main className={styles.loginScreen} data-testid="login-screen">
				<LoginForm />
			</main>
		);
	}

	return (
		<div className={styles.layout}>
			<header className={styles.header}>
				<h1 className={styles.title}>Hint Admin</h1>
				<div className={styles.headerActions}>
					<ApiStatusBadge />
					<span className={styles.adminEmail}>{adminEmail}</span>
					<Button onClick={logout}>Sign out</Button>
				</div>
			</header>
			<div className={styles.panes}>
				<CompaniesSidebar />
				<main className={styles.main}>
					{selectedCompanyId ? (
						<CompanyDetail />
					) : (
						<p className={styles.placeholder}>
							Select a company on the left — or create one — to
							manage its knowledge base and get the embed snippet.
						</p>
					)}
				</main>
			</div>
		</div>
	);
};

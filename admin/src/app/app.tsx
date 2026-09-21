import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { LoginForm } from '@/features/login';
import { setUnauthorizedHandler } from '@/shared/api';
import { useAdminStore } from '@/shared/store/admin-store';
import { Button, ThemeToggle } from '@/shared/ui';
import { ApiStatusBadge } from '@/widgets/api-status';
import { CompaniesSidebar } from '@/widgets/companies-sidebar';
import { CompanyDetail } from '@/widgets/company-detail';
import { ProductOverview } from '@/widgets/product-overview';
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
				<div className={styles.loginTheme}>
					<ThemeToggle />
				</div>
				<LoginForm />
			</main>
		);
	}

	return (
		<div className={styles.layout}>
			<CompaniesSidebar />
			<div className={styles.workspace}>
				<header className={styles.header}>
					<h1 className={styles.visuallyHidden}>Hint Admin</h1>
					<div className={styles.headerActions}>
						<ApiStatusBadge />
						<span className={styles.adminEmail}>{adminEmail}</span>
						<ThemeToggle />
						<Button variant="ghost" onClick={logout}>
							Sign out
						</Button>
					</div>
				</header>
				<main className={styles.main}>
					{selectedCompanyId ? <CompanyDetail /> : <ProductOverview />}
				</main>
			</div>
		</div>
	);
};

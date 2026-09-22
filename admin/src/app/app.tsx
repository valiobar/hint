import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { setUnauthorizedHandler } from '@/shared/api';
import { consumeAuthCallback } from '@/shared/lib/auth-callback';
import {
	selectNeedsBilling,
	useAdminStore,
} from '@/shared/store/admin-store';
import { ThemeToggle } from '@/shared/ui';
import { AuthScreen } from '@/widgets/auth-screen';
import { BillingScreen, CheckoutPending } from '@/widgets/billing';
import { CompaniesSidebar } from '@/widgets/companies-sidebar';
import { CompanyDetail } from '@/widgets/company-detail';
import { ProductOverview } from '@/widgets/product-overview';
import styles from './app.module.css';

export const App = () => {
	const {
		isAuthenticated,
		selectedCompanyId,
		needsBilling,
		showBilling,
		checkoutPending,
	} = useAdminStore(
		useShallow((s) => ({
			isAuthenticated: s.isAuthenticated,
			selectedCompanyId: s.selectedCompanyId,
			needsBilling: selectNeedsBilling(s),
			showBilling: s.showBilling,
			checkoutPending: s.checkoutPending,
		})),
	);
	const restoreSession = useAdminStore((s) => s.restoreSession);
	const logout = useAdminStore((s) => s.logout);

	useEffect(() => {
		setUnauthorizedHandler(logout);
	}, [logout]);

	useEffect(() => {
		const cb = consumeAuthCallback();
		if (cb.oauthError) {
			useAdminStore.setState({
				authError:
					cb.oauthError === 'oauth_state'
						? 'Google sign-in expired — try again'
						: 'Google sign-in failed — try again',
			});
		}
		if (cb.checkoutReturn) {
			useAdminStore.setState({ checkoutPending: true });
		}
		void restoreSession();
	}, [restoreSession]);

	if (!isAuthenticated) {
		return (
			<main className={styles.loginScreen} data-testid="login-screen">
				<div className={styles.loginTheme}>
					<ThemeToggle />
				</div>
				<AuthScreen />
			</main>
		);
	}

	const showPlans = needsBilling || showBilling;

	return (
		<div className={styles.layout}>
			<CompaniesSidebar />
			<div className={styles.workspace}>
				<h1 className={styles.visuallyHidden}>Hint Admin</h1>
				<main className={styles.main}>
					{checkoutPending ? (
						<CheckoutPending />
					) : showPlans ? (
						<BillingScreen />
					) : selectedCompanyId ? (
						<CompanyDetail />
					) : (
						<ProductOverview />
					)}
				</main>
			</div>
		</div>
	);
};

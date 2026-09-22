import { useShallow } from 'zustand/react/shallow';
import { CompanyListItem } from '@/entities/company';
import { CreateCompanyForm } from '@/features/create-company';
import {
	selectCanCreateCompany,
	selectNeedsBilling,
	useAdminStore,
} from '@/shared/store/admin-store';
import { Button, EmptyState, Spinner, ThemeToggle, Wordmark } from '@/shared/ui';
import styles from './companies-sidebar.module.css';

export const CompaniesSidebar = () => {
	const { companies, isLoadingCompanies, companiesError, selectedCompanyId } =
		useAdminStore(
			useShallow((s) => ({
				companies: s.companies,
				isLoadingCompanies: s.isLoadingCompanies,
				companiesError: s.companiesError,
				selectedCompanyId: s.selectedCompanyId,
			})),
		);
	const selectCompany = useAdminStore((s) => s.selectCompany);
	const me = useAdminStore((s) => s.me);
	const logout = useAdminStore((s) => s.logout);
	const billingOpen = useAdminStore(
		(s) => s.showBilling || selectNeedsBilling(s),
	);
	const canCreate = useAdminStore(selectCanCreateCompany);
	const maxCompanies = me?.limits.max_companies ?? 0;
	const plan = me?.plan;
	const isSuperadmin = me?.role === 'superadmin';

	return (
		<aside className={styles.sidebar} data-testid="companies-sidebar">
			<div className={styles.brand}>
				<Wordmark size="sm" />
			</div>
			<section className={styles.section} aria-labelledby="companies-heading">
				<h2 id="companies-heading" className={styles.heading}>
					Companies
				</h2>
				{canCreate ? (
					<CreateCompanyForm />
				) : maxCompanies === 0 ? (
					<p className={styles.subscribeHint} data-testid="subscribe-hint">
						Subscribe to add a company.
					</p>
				) : (
					<div className={styles.limitNotice} data-testid="company-limit-notice">
						<p>
							Plan limit reached ({maxCompanies}{' '}
							{maxCompanies === 1 ? 'company' : 'companies'}).
						</p>
						{plan !== 'pro' ? (
							<Button
								onClick={() =>
									useAdminStore.setState({ showBilling: true })
								}
							>
								Upgrade plan
							</Button>
						) : null}
					</div>
				)}
				{isLoadingCompanies && <Spinner />}
				{companiesError && (
					<p className={styles.error} role="alert">
						{companiesError}
					</p>
				)}
				{!isLoadingCompanies &&
					companies.length === 0 &&
					!companiesError &&
					canCreate && (
						<EmptyState title="No companies yet">
							Create the first one above.
						</EmptyState>
					)}
				<ul className={styles.list}>
					{companies.map((company) => (
						<li key={company.company_id}>
							<CompanyListItem
								company={company}
								isSelected={company.company_id === selectedCompanyId}
								onSelect={selectCompany}
							/>
						</li>
					))}
				</ul>
			</section>
			<footer className={styles.account} data-testid="sidebar-account">
				<div className={styles.accountHead}>
					<p className={styles.accountEmail}>{me?.email}</p>
					<ThemeToggle />
				</div>
				{!isSuperadmin ? (
					<p className={styles.planLine}>
						<span
							className={styles.planPill}
							data-testid="plan-pill"
							data-status={me?.subscription_status ?? 'none'}
						>
							{me?.plan ?? 'no plan'}
							{me?.subscription_status
								? ` · ${me.subscription_status.replace(/_/g, ' ')}`
								: ''}
						</span>
					</p>
				) : null}
				<div className={styles.accountActions}>
					{!isSuperadmin ? (
						<Button
							variant={billingOpen ? 'primary' : 'neutral'}
							className={styles.accountButton}
							onClick={() =>
								useAdminStore.setState({ showBilling: true })
							}
						>
							Billing
						</Button>
					) : null}
					<Button
						variant="ghost"
						className={styles.accountButton}
						onClick={logout}
					>
						Sign out
					</Button>
				</div>
			</footer>
		</aside>
	);
};

import { useShallow } from 'zustand/react/shallow';
import { CompanyListItem } from '@/entities/company';
import { CreateCompanyForm } from '@/features/create-company';
import {
	selectCanCreateCompany,
	useAdminStore,
} from '@/shared/store/admin-store';
import { Button, EmptyState, Spinner, Wordmark } from '@/shared/ui';
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
	const canCreate = useAdminStore(selectCanCreateCompany);
	const maxCompanies = useAdminStore((s) => s.me?.limits.max_companies ?? 0);
	const plan = useAdminStore((s) => s.me?.plan);

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
				{!isLoadingCompanies && companies.length === 0 && !companiesError && (
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
			<p className={styles.footer}>
				Nothing selected — overview on the right.
			</p>
		</aside>
	);
};

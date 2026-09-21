import { useShallow } from 'zustand/react/shallow';
import { CompanyListItem } from '@/entities/company';
import { CreateCompanyForm } from '@/features/create-company';
import { useAdminStore } from '@/shared/store/admin-store';
import { EmptyState, Spinner, Wordmark } from '@/shared/ui';
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

	return (
		<aside className={styles.sidebar} data-testid="companies-sidebar">
			<div className={styles.brand}>
				<Wordmark size="sm" />
				<p className={styles.product}>Hint Admin</p>
			</div>
			<section className={styles.section} aria-labelledby="companies-heading">
				<div className={styles.heading}>
					<p className={styles.kicker}>Workspace</p>
					<h2 id="companies-heading">Companies</h2>
				</div>
				<CreateCompanyForm />
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
			<section className={styles.section} aria-labelledby="content-docs-heading">
				<h2 id="content-docs-heading" className={styles.docsHeading}>
					Content Docs
				</h2>
				{selectedCompanyId ? (
					<p className={styles.docsHint}>
						Company selected — documents are on the right.
					</p>
				) : (
					<p className={styles.docsHint}>
						Nothing selected — overview on the right.
					</p>
				)}
			</section>
		</aside>
	);
};

import { useShallow } from 'zustand/react/shallow';
import { CompanyListItem } from '@/entities/company';
import { CreateCompanyForm } from '@/features/create-company';
import { useAdminStore } from '@/shared/store/admin-store';
import { EmptyState, Spinner } from '@/shared/ui';
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
			<div className={styles.heading}>
				<p className={styles.kicker}>Workspace</p>
				<h2>Companies</h2>
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
		</aside>
	);
};

import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { Company, Me } from '@/shared/api';
import { useAdminStore } from '@/shared/store/admin-store';
import { CompanyDetail } from './company-detail';

const company: Company = {
	company_id: 'co_1',
	name: 'Acme',
	created_at: '2026-01-01T00:00:00Z',
	suggested_questions: [],
};

const me = (overrides: Partial<Me> = {}): Me => ({
	email: 'ada@example.com',
	role: 'user',
	created_at: '2026-01-01T00:00:00Z',
	plan: 'basic',
	subscription_status: 'active',
	limits: { max_companies: 1, url_ingestion: false },
	...overrides,
});

it('hides URL ingestion on Basic and opens billing from the upgrade action', () => {
	useAdminStore.setState({
		me: me(),
		companies: [company],
		selectedCompanyId: company.company_id,
		documents: [],
		uploadingFiles: [],
		isLoadingDocuments: false,
		documentsError: null,
		showBilling: false,
	});

	render(<CompanyDetail />);

	expect(screen.queryByTestId('url-source-form')).not.toBeInTheDocument();
	expect(screen.getByTestId('url-pro-hint')).toHaveTextContent(
		'URL ingestion is a Pro feature.',
	);
	fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
	expect(useAdminStore.getState().showBilling).toBe(true);
});

it('shows the URL form when the plan allows ingestion', () => {
	useAdminStore.setState({
		me: me({
			plan: 'pro',
			limits: { max_companies: 10, url_ingestion: true },
		}),
		companies: [company],
		selectedCompanyId: company.company_id,
		documents: [],
		uploadingFiles: [],
		isLoadingDocuments: false,
		showBilling: false,
	});

	render(<CompanyDetail />);

	expect(screen.getByTestId('url-source-form')).toBeInTheDocument();
	expect(screen.queryByTestId('url-pro-hint')).not.toBeInTheDocument();
});

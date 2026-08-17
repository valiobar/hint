import { expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { UrlSourceForm } from './url-source-form';

const ingestUrls = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/shared/store/admin-store', () => ({
	useAdminStore: (
		selector: (state: {
			ingestUrls: typeof ingestUrls;
			isIngestingUrls: boolean;
			ingestUrlsError: string | null;
		}) => unknown,
	) =>
		selector({
			ingestUrls,
			isIngestingUrls: false,
			ingestUrlsError: null,
		}),
}));

it('submits valid URLs and shows rejected lines', async () => {
	render(<UrlSourceForm />);
	fireEvent.change(screen.getByLabelText('Support page URLs'), {
		target: {
			value: 'https://support.example.com/reset\nnot-a-url',
		},
	});
	await act(async () => {
		fireEvent.submit(screen.getByTestId('url-source-form'));
	});
	expect(ingestUrls).toHaveBeenCalledWith([
		'https://support.example.com/reset',
	]);
	expect(screen.getByRole('alert')).toHaveTextContent(
		'not-a-url: Not a valid URL',
	);
	expect(screen.getByLabelText('Support page URLs')).toHaveValue('');
});

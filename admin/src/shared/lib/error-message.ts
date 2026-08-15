import { ApiError } from '@/shared/api';

export const toErrorMessage = (err: unknown): string => {
	if (err instanceof ApiError) {
		return err.detail;
	}
	if (err instanceof Error) {
		return err.message;
	}
	return 'Unexpected error';
};

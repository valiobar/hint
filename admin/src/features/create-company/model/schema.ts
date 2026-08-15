import { z } from 'zod';

export const createCompanySchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, 'Company name is required')
		.max(100, 'Company name must be at most 100 characters'),
});

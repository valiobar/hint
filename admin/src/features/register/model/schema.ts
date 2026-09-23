import { z } from 'zod';

export const registerSchema = z
	.object({
		email: z.string().trim().email('Enter a valid email'),
		password: z
			.string()
			.min(8, 'Password must be at least 8 characters')
			.max(200, 'Password must be at most 200 characters')
			.regex(/[a-z]/, 'Password must include a lowercase letter')
			.regex(/[A-Z]/, 'Password must include an uppercase letter')
			.regex(/\d/, 'Password must include a number')
			.regex(/[^A-Za-z0-9]/, 'Password must include a symbol'),
		confirm: z.string(),
	})
	.refine((value) => value.password === value.confirm, {
		message: 'Passwords do not match',
		path: ['confirm'],
	});

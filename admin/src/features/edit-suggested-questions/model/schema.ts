import { z } from 'zod';

export const suggestedQuestionsSchema = z.object({
	questions: z
		.array(
			z
				.string()
				.trim()
				.max(120, 'Each question must be at most 120 characters'),
		)
		.max(4)
		.transform((items) => items.filter((item) => item.length > 0)),
});

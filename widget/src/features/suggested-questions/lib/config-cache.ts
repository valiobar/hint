const cache = new Map<string, string[]>();

export const readWidgetConfigCache = (
	companyId: string,
): string[] | undefined => cache.get(companyId);

export const writeWidgetConfigCache = (
	companyId: string,
	questions: string[],
): void => {
	cache.set(companyId, questions);
};

export const clearWidgetConfigCache = (): void => {
	cache.clear();
};

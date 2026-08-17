export interface RejectedUrl {
	value: string;
	reason: string;
}

export interface UrlValidationResult {
	valid: string[];
	rejected: RejectedUrl[];
}

export const MAX_URLS_PER_REQUEST = 20;

export const validateUrls = (input: string): UrlValidationResult => {
	const lines = input
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	const valid: string[] = [];
	const rejected: RejectedUrl[] = [];
	for (const line of lines) {
		try {
			const parsed = new URL(line);
			if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
				rejected.push({
					value: line,
					reason: 'Only http/https URLs',
				});
			} else if (valid.length >= MAX_URLS_PER_REQUEST) {
				rejected.push({
					value: line,
					reason: 'Max 20 URLs per request',
				});
			} else {
				valid.push(line);
			}
		} catch {
			rejected.push({ value: line, reason: 'Not a valid URL' });
		}
	}
	return { valid, rejected };
};

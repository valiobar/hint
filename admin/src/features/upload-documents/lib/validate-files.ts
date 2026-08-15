const ACCEPTED_EXTENSIONS = ['.pdf', '.md', '.txt', '.html', '.htm'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export interface RejectedFile {
	name: string;
	reason: string;
}

export interface ValidationResult {
	valid: File[];
	rejected: RejectedFile[];
}

export const validateFiles = (files: File[]): ValidationResult => {
	const valid: File[] = [];
	const rejected: RejectedFile[] = [];
	files.forEach((file) => {
		const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
		if (!ACCEPTED_EXTENSIONS.includes(ext)) {
			rejected.push({
				name: file.name,
				reason: `Unsupported file type: ${ext}`,
			});
		} else if (file.size > MAX_FILE_SIZE_BYTES) {
			rejected.push({ name: file.name, reason: 'File exceeds 10 MB' });
		} else {
			valid.push(file);
		}
	});
	return { valid, rejected };
};

export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(',');

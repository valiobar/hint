import { API_URL, WIDGET_CDN_URL } from '@/shared/config';

export const buildEmbedSnippet = (companyId: string): string =>
	[
		`<script src="${WIDGET_CDN_URL}/embed/v1/loader.js"`,
		`        data-hint-company-id="${companyId}"`,
		`        data-hint-api-url="${API_URL}" defer></script>`,
	].join('\n');

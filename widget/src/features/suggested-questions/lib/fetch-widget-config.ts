import { WIDGET_CONFIG } from '@/shared/config';
import type { WidgetConfigResponse } from '@/shared/api/types';
import {
	readWidgetConfigCache,
	writeWidgetConfigCache,
} from '@/features/suggested-questions/lib/config-cache';

export const fetchSuggestedQuestions = async (): Promise<string[]> => {
	const companyId = WIDGET_CONFIG?.companyId;
	const apiUrl = WIDGET_CONFIG?.apiUrl;
	if (!companyId || !apiUrl) {
		return [];
	}
	const cached = readWidgetConfigCache(companyId);
	if (cached !== undefined) {
		return cached;
	}
	try {
		const response = await fetch(
			`${apiUrl}/api/v1/companies/${companyId}/widget-config`,
		);
		if (!response.ok) {
			writeWidgetConfigCache(companyId, []);
			return [];
		}
		const body = (await response.json()) as WidgetConfigResponse;
		const questions = Array.isArray(body.suggested_questions)
			? body.suggested_questions.slice(0, 4)
			: [];
		writeWidgetConfigCache(companyId, questions);
		return questions;
	} catch {
		writeWidgetConfigCache(companyId, []);
		return [];
	}
};

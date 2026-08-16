import { WIDGET_CONFIG } from '@/shared/config';
import { parseSseStream, type SseEvent } from '@/shared/api/sse';
import type {
	ChatRequest,
	HintRequest,
	HintResponse,
} from '@/shared/api/types';

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly detail: string,
	) {
		super(detail);
		this.name = 'ApiError';
	}
}

const extractDetail = async (response: Response): Promise<string> => {
	try {
		const body = (await response.json()) as { detail?: unknown };
		if (typeof body.detail === 'string') {
			return body.detail;
		}
	} catch {
		// non-JSON error body — fall through
	}
	return `Request failed with status ${response.status}`;
};

// Pre-stream HTTP errors (404 / 422 / 503) arrive before the first SSE
// byte — see docs/06-ai-layer.md. Mid-stream failures stay on the
// generator as `event: error` and are not thrown here.
export const streamChat = async (
	request: ChatRequest,
	signal?: AbortSignal,
): Promise<AsyncGenerator<SseEvent>> => {
	let response: Response;
	try {
		response = await fetch(`${WIDGET_CONFIG!.apiUrl}/api/v1/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(request),
			signal,
		});
	} catch (err) {
		if (err instanceof DOMException && err.name === 'AbortError') {
			throw err;
		}
		throw new ApiError(0, 'Hint backend is unreachable');
	}
	if (!response.ok) {
		throw new ApiError(response.status, await extractDetail(response));
	}
	if (!response.body) {
		throw new ApiError(0, 'Streaming is not supported in this browser');
	}
	return parseSseStream(response.body);
};

export const fetchHint = async (
	request: HintRequest,
	signal?: AbortSignal,
): Promise<HintResponse> => {
	let response: Response;
	try {
		response = await fetch(`${WIDGET_CONFIG!.apiUrl}/api/v1/hint`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(request),
			signal,
		});
	} catch (err) {
		if (err instanceof DOMException && err.name === 'AbortError') {
			throw err;
		}
		throw new ApiError(0, 'Hint backend is unreachable');
	}
	if (!response.ok) {
		throw new ApiError(response.status, await extractDetail(response));
	}
	return (await response.json()) as HintResponse;
};

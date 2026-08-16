export { ApiError, streamChat, fetchHint } from '@/shared/api/assist';
export { parseSseStream } from '@/shared/api/sse';
export type { SseEvent } from '@/shared/api/sse';
export type {
	ElementDescriptor,
	PageContext,
	ChatRole,
	WireChatMessage,
	ChatRequest,
	ChatDonePayload,
	HintRequest,
	HintResponse,
} from '@/shared/api/types';
export {
	MAX_MESSAGES,
	MAX_MESSAGE_CHARS,
	MAX_HEADINGS,
	MAX_INTERACTIVE_ELEMENTS,
	MAX_TEXT_EXCERPT_CHARS,
	MAX_ELEMENT_TEXT_CHARS,
	MAX_SELECTOR_PATH_CHARS,
	MAX_URL_CHARS,
} from '@/shared/api/types';

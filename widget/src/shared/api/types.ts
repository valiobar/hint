// Mirror of backend/app/models/assist.py — snake_case on the wire.

export interface ElementDescriptor {
	tag: string;
	text: string | null;
	role: string | null;
	attrs: Record<string, string>;
	selector_path: string;
}

export interface PageContext {
	url: string;
	title: string;
	headings: string[];
	interactive: ElementDescriptor[];
	visible_text_excerpt: string;
}

export type ChatRole = 'user' | 'assistant';

export interface WireChatMessage {
	role: ChatRole;
	content: string;
}

export interface ChatRequest {
	company_id: string;
	messages: WireChatMessage[];
	page_context: PageContext;
}

export interface ChatDonePayload {
	sources: string[];
}

export interface HintRequest {
	company_id: string;
	element: ElementDescriptor;
	page_context: PageContext;
}

export interface HintResponse {
	hint: string;
	source: string | null;
}

// Backend Pydantic caps — trim client-side, never rely on a 422
export const MAX_MESSAGES = 30;
export const MAX_MESSAGE_CHARS = 4000;
export const MAX_HEADINGS = 10;
export const MAX_INTERACTIVE_ELEMENTS = 60;
export const MAX_TEXT_EXCERPT_CHARS = 2000;
export const MAX_ELEMENT_TEXT_CHARS = 220;
export const MAX_SELECTOR_PATH_CHARS = 512;
export const MAX_URL_CHARS = 2048;

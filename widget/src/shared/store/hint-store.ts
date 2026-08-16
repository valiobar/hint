import { create } from 'zustand';
import {
	persist,
	createJSONStorage,
	type StateStorage,
} from 'zustand/middleware';
import { streamChat, ApiError } from '@/shared/api';
import type { WireChatMessage, ChatDonePayload } from '@/shared/api/types';
import { MAX_MESSAGES, MAX_MESSAGE_CHARS } from '@/shared/api/types';
import { extractPageContext } from '@/shared/lib/page-context';
import { WIDGET_CONFIG } from '@/shared/config';

// sessionStorage can throw in sandboxed iframes / strict privacy modes —
// fall back to in-memory storage so persistence degrades, never crashes.
const resolveStorage = (): StateStorage => {
	try {
		sessionStorage.setItem('__hint_probe__', '1');
		sessionStorage.removeItem('__hint_probe__');
		return sessionStorage;
	} catch {
		const memory = new Map<string, string>();
		return {
			getItem: (key) => memory.get(key) ?? null,
			setItem: (key, value) => {
				memory.set(key, value);
			},
			removeItem: (key) => {
				memory.delete(key);
			},
		};
	}
};

export interface UiChatMessage {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	sources?: string[];
	isFailed?: boolean;
}

export interface HintRectSnapshot {
	top: number;
	left: number;
	width: number;
	height: number;
}

export interface ActiveHint {
	rect: HintRectSnapshot;
	text: string | null;
}

export type DockSide = 'left' | 'right';

export interface WalkthroughStep {
	instruction: string;
	label: string | null;
}

export interface WalkthroughState {
	steps: WalkthroughStep[];
	activeStepIndex: number;
}

interface HintState {
	isOpen: boolean;
	isHintModeEnabled: boolean;
	isStreaming: boolean;
	isDisabled: boolean;
	messages: UiChatMessage[];
	chatError: string | null;
	activeHint: ActiveHint | null;
	dockSide: DockSide;
	/** Guide bar center Y as a fraction of the viewport height. */
	dockTopFraction: number;
	walkthrough: WalkthroughState | null;
	openPanel: () => void;
	closePanel: () => void;
	togglePanel: () => void;
	toggleHintMode: () => void;
	showHint: (rect: HintRectSnapshot, text: string | null) => void;
	hideHint: () => void;
	disableWidget: () => void;
	setDockPosition: (side: DockSide, topFraction: number) => void;
	sendMessage: (text: string) => Promise<void>;
	clearMessages: () => void;
	startWalkthrough: (steps: WalkthroughStep[]) => void;
	nextWalkthroughStep: () => void;
	prevWalkthroughStep: () => void;
	stopWalkthrough: () => void;
}

const toWireMessages = (messages: UiChatMessage[]): WireChatMessage[] =>
	messages
		.filter((m) => !m.isFailed && m.content.length > 0)
		.slice(-MAX_MESSAGES)
		.map((m) => ({
			role: m.role,
			content: m.content.slice(0, MAX_MESSAGE_CHARS),
		}));

const createId = (): string =>
	`msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const useHintStore = create<HintState>()(
	persist(
		(set, get) => ({
			isOpen: false,
			isHintModeEnabled: false,
			isStreaming: false,
			isDisabled: false,
			messages: [],
			chatError: null,
			activeHint: null,
			dockSide: 'right',
			dockTopFraction: 0.5,
			walkthrough: null,

			openPanel: () => set({ isOpen: true }),
			closePanel: () => set({ isOpen: false }),
			togglePanel: () => set((s) => ({ isOpen: !s.isOpen })),
			toggleHintMode: () =>
				set((s) => ({ isHintModeEnabled: !s.isHintModeEnabled })),
			showHint: (rect, text) => set({ activeHint: { rect, text } }),
			hideHint: () => set({ activeHint: null }),
			disableWidget: () =>
				set({
					isDisabled: true,
					isHintModeEnabled: false,
					activeHint: null,
					walkthrough: null,
				}),
			setDockPosition: (side, topFraction) =>
				set({ dockSide: side, dockTopFraction: topFraction }),
			startWalkthrough: (steps) => {
				if (steps.length < 2 || get().isDisabled) {
					return;
				}
				set({
					walkthrough: { steps, activeStepIndex: 0 },
					isOpen: false,
					activeHint: null,
				});
			},
			nextWalkthroughStep: () =>
				set((s) => {
					if (!s.walkthrough) {
						return s;
					}
					const next = s.walkthrough.activeStepIndex + 1;
					return next >= s.walkthrough.steps.length
						? { ...s, walkthrough: null }
						: {
								...s,
								walkthrough: {
									...s.walkthrough,
									activeStepIndex: next,
								},
							};
				}),
			prevWalkthroughStep: () =>
				set((s) =>
					s.walkthrough
						? {
								...s,
								walkthrough: {
									...s.walkthrough,
									activeStepIndex: Math.max(
										0,
										s.walkthrough.activeStepIndex - 1,
									),
								},
							}
						: s,
				),
			stopWalkthrough: () => set({ walkthrough: null }),

			clearMessages: () => {
				// Clearing mid-stream would orphan the in-flight assistant
				// message: patchAssistant targets it by id and would
				// silently no-op against an emptied list.
				if (get().isStreaming) {
					return;
				}
				set({ messages: [], chatError: null, walkthrough: null });
			},

			sendMessage: async (text) => {
				const trimmed = text.trim();
				if (!trimmed || get().isStreaming || get().isDisabled) {
					return;
				}
				const userMessage: UiChatMessage = {
					id: createId(),
					role: 'user',
					content: trimmed,
				};
				const assistantId = createId();
				set((s) => ({
					messages: [
						...s.messages,
						userMessage,
						{ id: assistantId, role: 'assistant', content: '' },
					],
					isStreaming: true,
					chatError: null,
					walkthrough: null,
				}));

				const patchAssistant = (patch: Partial<UiChatMessage>) =>
					set((s) => ({
						messages: s.messages.map((m) =>
							m.id === assistantId ? { ...m, ...patch } : m,
						),
					}));

				try {
					const events = await streamChat({
						company_id: WIDGET_CONFIG!.companyId,
						messages: toWireMessages(
							get().messages.slice(0, -1),
						),
						page_context: extractPageContext(),
					});
					for await (const event of events) {
						if (event.event === 'token') {
							set((s) => ({
								messages: s.messages.map((m) =>
									m.id === assistantId
										? {
												...m,
												content: m.content + event.data,
											}
										: m,
								),
							}));
						} else if (event.event === 'done') {
							const payload = JSON.parse(
								event.data,
							) as ChatDonePayload;
							patchAssistant({ sources: payload.sources });
						} else if (event.event === 'error') {
							patchAssistant({ isFailed: true });
						}
					}
				} catch (err) {
					if (err instanceof ApiError && err.status === 404) {
						get().disableWidget();
					}
					patchAssistant({ isFailed: true });
					set({
						chatError:
							err instanceof ApiError
								? err.detail
								: 'Something went wrong — please try again',
					});
				} finally {
					set({ isStreaming: false });
				}
			},
		}),
		{
			// Per-company key: two Hint-enabled apps on one origin stay separate
			name: `hint:chat:${WIDGET_CONFIG?.companyId ?? 'unknown'}`,
			storage: createJSONStorage(resolveStorage),
			version: 1,
			// Persist only durable state; transient flags always rehydrate fresh.
			// Dropping empty messages also discards a mid-stream placeholder
			// if the page reloaded while an answer was streaming.
			partialize: (s) => ({
				messages: s.messages
					.filter((m) => m.content.length > 0)
					.slice(-MAX_MESSAGES),
				isHintModeEnabled: s.isHintModeEnabled,
				dockSide: s.dockSide,
				dockTopFraction: s.dockTopFraction,
			}),
		},
	),
);

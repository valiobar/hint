import { beforeEach, describe, expect, it } from 'vitest';
import { useHintStore } from '@/shared/store/hint-store';

const seeded = [
	{ id: 'u1', role: 'user' as const, content: 'How do I export?' },
	{ id: 'a1', role: 'assistant' as const, content: 'Click "Export".' },
];

describe('clearMessages', () => {
	beforeEach(() => {
		useHintStore.setState({
			isStreaming: false,
			messages: seeded,
			chatError: 'old error',
			walkthrough: {
				steps: [
					{ instruction: 'a', label: null },
					{ instruction: 'b', label: null },
				],
				activeStepIndex: 0,
			},
		});
	});

	it('clears messages, chat error, and walkthrough', () => {
		useHintStore.getState().clearMessages();
		const state = useHintStore.getState();
		expect(state.messages).toEqual([]);
		expect(state.chatError).toBeNull();
		expect(state.walkthrough).toBeNull();
	});

	it('does nothing while a response is streaming', () => {
		useHintStore.setState({ isStreaming: true });
		useHintStore.getState().clearMessages();
		expect(useHintStore.getState().messages).toHaveLength(2);
	});
});

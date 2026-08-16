export interface SseEvent {
	event: string;
	data: string;
}

const parseFrame = (frame: string): SseEvent | null => {
	let event = 'message';
	const dataLines: string[] = [];
	for (const line of frame.split('\n')) {
		if (line.startsWith('event:')) {
			event = line.slice(6).trim();
		} else if (line.startsWith('data:')) {
			// single leading space is separator, not payload
			dataLines.push(line.slice(5).replace(/^ /, ''));
		}
	}
	if (dataLines.length === 0) {
		return null;
	}
	return { event, data: dataLines.join('\n') };
};

export async function* parseSseStream(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
			let separatorIndex = buffer.indexOf('\n\n');
			while (separatorIndex !== -1) {
				const parsed = parseFrame(buffer.slice(0, separatorIndex));
				buffer = buffer.slice(separatorIndex + 2);
				if (parsed) {
					yield parsed;
				}
				separatorIndex = buffer.indexOf('\n\n');
			}
		}
	} finally {
		reader.releaseLock();
	}
}

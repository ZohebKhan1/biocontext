const copyBytes = (value: Uint8Array): Uint8Array<ArrayBuffer> => {
	const copy = new Uint8Array(value.byteLength);
	copy.set(value);
	return copy;
};

const combineChunks = (
	chunks: readonly Uint8Array[],
	totalBytes: number
): Uint8Array<ArrayBuffer> => {
	const combined = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		combined.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return combined;
};

export const readResponseBytesBounded = async (
	response: Response,
	maximumBytes: number,
	label: string
): Promise<Uint8Array<ArrayBuffer>> => {
	const declaredLength = Number(response.headers.get('content-length'));
	if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
		throw new Error(`${label} exceeds ${maximumBytes} bytes`);
	}
	if (!response.body) {
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (bytes.byteLength > maximumBytes) throw new Error(`${label} exceeds ${maximumBytes} bytes`);
		return copyBytes(bytes);
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			totalBytes += value.byteLength;
			if (totalBytes > maximumBytes) {
				await reader.cancel(`${label} exceeds ${maximumBytes} bytes`);
				throw new Error(`${label} exceeds ${maximumBytes} bytes`);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	return combineChunks(chunks, totalBytes);
};

export const gunzipBounded = async (
	compressed: Uint8Array,
	maximumBytes: number,
	label: string
): Promise<Uint8Array<ArrayBuffer>> => {
	let reader: ReadableStreamDefaultReader<Uint8Array>;
	try {
		reader = new Blob([copyBytes(compressed)])
			.stream()
			.pipeThrough(new DecompressionStream('gzip'))
			.getReader();
	} catch (cause) {
		throw new Error(`${label} is not valid gzip data`, { cause });
	}
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			totalBytes += value.byteLength;
			if (totalBytes > maximumBytes) {
				await reader.cancel(`${label} expands beyond ${maximumBytes} bytes`);
				throw new Error(`${label} expands beyond ${maximumBytes} bytes`);
			}
			chunks.push(value);
		}
	} catch (cause) {
		if (cause instanceof Error && cause.message.startsWith(label)) throw cause;
		throw new Error(`${label} is not valid gzip data`, { cause });
	} finally {
		reader.releaseLock();
	}
	return combineChunks(chunks, totalBytes);
};

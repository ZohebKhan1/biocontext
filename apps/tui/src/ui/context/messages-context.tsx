import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode
} from 'react';
import { formatConversationHistory, type ThreadMessage } from '@biocontext/shared';
import { Effect } from 'effect';

import type { Chunk, CancelState, InputState, Message } from '../types.ts';
import { services, type ChunkUpdate } from '../services.ts';
import { runCliEffect } from '../../effect/runtime.ts';
import { copyToClipboard } from '../clipboard.ts';
import { formatError } from '../lib/format-error.ts';
import {
	createThread,
	loadThread,
	saveThread,
	type LocalThread,
	type LocalThreadMessage
} from '../thread-store.ts';
import { selectActiveResources } from '../lib/input-resource-scope.ts';
import { formatStartupSummary, isStartupSummary } from '../lib/startup-summary.ts';
import { formatStreamStats } from '../lib/stream-stats.ts';
import { useConfigContext } from './config-context.tsx';

type MessagesState = {
	messages: Message[];
	showConversationBanner: boolean;
	addSystemMessage: (content: string) => void;
	clearMessages: () => void;
	copyLastMessage: () => Promise<void>;
	copyAllMessages: () => Promise<void>;

	threadResources: string[];
	removeThreadResources: (resourceNames: readonly string[]) => void;

	isStreaming: boolean;
	cancelState: CancelState;

	send: (input: InputState, mentionedResources: string[], question: string) => Promise<void>;
	requestCancel: () => void;
	confirmCancel: () => Promise<void>;
	resumeThread: (threadId: string) => Promise<void>;
};

const MessagesContext = createContext<MessagesState | null>(null);

export const useMessagesContext = () => {
	const context = useContext(MessagesContext);
	if (!context) throw new Error('useMessagesContext must be used within MessagesProvider');
	return context;
};

const createDefaultMessageHistory = (startupSummary: string): Message[] => [
	{ role: 'system', content: startupSummary }
];

export const shouldShowConversationBannerForThread = (
	messages: readonly { role: Message['role'] }[]
): boolean => !messages.some((message) => message.role === 'user');

const updateStartupSummary = (messages: Message[], startupSummary: string): Message[] => {
	const index = messages.findIndex(
		(message) => message.role === 'system' && isStartupSummary(message.content)
	);
	if (index < 0) return [{ role: 'system', content: startupSummary }, ...messages];
	const current = messages[index];
	if (current?.role === 'system' && current.content === startupSummary) return messages;
	return messages.map((message, messageIndex) =>
		messageIndex === index ? { role: 'system', content: startupSummary } : message
	);
};

const DEFAULT_THREAD_RESOURCES = ['Bioconductor'];

const comparableResourceName = (value: string): string =>
	value
		.trim()
		.replace(/^@/u, '')
		.replace(/^bioconductor:/iu, '')
		.toLowerCase();

export const withoutRemovedThreadResources = (
	resources: readonly string[],
	removedNames: readonly string[]
): string[] => {
	const removed = new Set(removedNames.map(comparableResourceName));
	const remaining = resources.filter((resource) => !removed.has(comparableResourceName(resource)));
	return remaining.length > 0 ? remaining : [...DEFAULT_THREAD_RESOURCES];
};

const finalizedAssistantText = (content: Extract<Message, { role: 'assistant' }>['content']) => {
	if (typeof content === 'string') return content;
	if (content.type === 'text') return content.content;
	if (content.type !== 'chunks') return '';
	return content.chunks
		.filter((chunk): chunk is Extract<Chunk, { type: 'text' }> => chunk.type === 'text')
		.map((chunk) => chunk.text)
		.join('\n\n');
};

export const toStoredMessages = (items: Message[]): LocalThreadMessage[] => {
	const now = Date.now();
	return items.map((message) => {
		if (message.role === 'user') {
			return {
				role: 'user',
				content: message.content.map((s) => s.content).join(''),
				createdAt: now
			};
		}
		if (message.role === 'assistant') {
			return {
				role: 'assistant',
				content: finalizedAssistantText(message.content),
				canceled: message.canceled,
				createdAt: now
			};
		}
		return {
			role: 'system',
			content: message.content,
			createdAt: now
		};
	});
};

const toUiMessages = (items: LocalThreadMessage[]): Message[] =>
	items.map((message) => {
		if (message.role === 'user') {
			return {
				role: 'user',
				content: [{ type: 'text', content: String(message.content) }]
			};
		}
		if (message.role === 'assistant') {
			return {
				role: 'assistant',
				content: message.content,
				canceled: message.canceled
			};
		}
		return { role: 'system', content: message.content };
	});

const getUserMessageText = (message: Extract<Message, { role: 'user' }>) =>
	message.content.map((segment) => segment.content).join('');

const getAssistantMessageText = (message: Extract<Message, { role: 'assistant' }>) => {
	return finalizedAssistantText(message.content);
};

export const MessagesProvider = (props: { children: ReactNode }) => {
	const config = useConfigContext();
	const startupSummary = useMemo(
		() => formatStartupSummary(config.runtimeStatus),
		[config.runtimeStatus]
	);
	const initialThread = useMemo(() => createThread(), []);

	const [messages, setMessages] = useState<Message[]>(() =>
		createDefaultMessageHistory(startupSummary)
	);
	const [showConversationBanner, setShowConversationBanner] = useState(true);
	const [threadResources, setThreadResources] = useState<string[]>(DEFAULT_THREAD_RESOURCES);
	const [isStreaming, setIsStreaming] = useState(false);
	const [cancelState, setCancelState] = useState<CancelState>('none');
	const [threadId, setThreadId] = useState<string>(initialThread.id);
	const [threadCreatedAt, setThreadCreatedAt] = useState(initialThread.createdAt);

	const messagesRef = useRef(messages);
	const resourcesRef = useRef(threadResources);
	const cancelStateRef = useRef(cancelState);
	const threadIdRef = useRef(threadId);
	const threadCreatedAtRef = useRef(threadCreatedAt);
	const hasAskedQuestionRef = useRef(false);

	useEffect(() => {
		messagesRef.current = messages;
	}, [messages]);
	useEffect(() => {
		resourcesRef.current = threadResources;
	}, [threadResources]);
	useEffect(() => {
		cancelStateRef.current = cancelState;
	}, [cancelState]);
	useEffect(() => {
		threadIdRef.current = threadId;
	}, [threadId]);
	useEffect(() => {
		threadCreatedAtRef.current = threadCreatedAt;
	}, [threadCreatedAt]);
	useEffect(() => {
		setMessages((previous) => updateStartupSummary(previous, startupSummary));
	}, [startupSummary, threadId]);

	const addMessage = useCallback(
		(message: Message) => setMessages((prev) => [...prev, message]),
		[]
	);

	const addChunkToLastAssistant = useCallback((chunk: Chunk) => {
		setMessages((prev) => {
			const next = [...prev];
			for (let i = next.length - 1; i >= 0; i--) {
				const msg = next[i];
				if (
					msg?.role === 'assistant' &&
					typeof msg.content === 'object' &&
					msg.content.type === 'chunks'
				) {
					next[i] = {
						role: 'assistant',
						content: { type: 'chunks', chunks: [...msg.content.chunks, chunk] }
					};
					break;
				}
			}
			return next;
		});
	}, []);

	const updateChunkInLastAssistant = useCallback((id: string, updates: Partial<Chunk>) => {
		setMessages((prev) => {
			const next = [...prev];
			for (let i = next.length - 1; i >= 0; i--) {
				const msg = next[i];
				if (
					msg?.role === 'assistant' &&
					typeof msg.content === 'object' &&
					msg.content.type === 'chunks'
				) {
					const updatedChunks = msg.content.chunks.map((c: Chunk): Chunk => {
						if (c.id !== id) return c;
						if (c.type === 'text' && 'text' in updates) {
							return { ...c, text: updates.text as string };
						}
						if (c.type === 'reasoning' && 'text' in updates) {
							return { ...c, text: updates.text as string };
						}
						if (c.type === 'tool' && ('state' in updates || 'input' in updates)) {
							return {
								...c,
								...('state' in updates
									? { state: updates.state as 'pending' | 'running' | 'completed' }
									: {}),
								...('input' in updates ? { input: updates.input } : {})
							};
						}
						return c;
					});
					next[i] = {
						role: 'assistant',
						content: { type: 'chunks', chunks: updatedChunks }
					};
					break;
				}
			}
			return next;
		});
	}, []);

	const markLastAssistantMessageCanceled = useCallback(() => {
		setMessages((prev) => {
			const next = [...prev];
			for (let i = next.length - 1; i >= 0; i--) {
				const msg = next[i];
				if (msg?.role === 'assistant') {
					next[i] = { ...msg, canceled: true };
					break;
				}
			}
			return next;
		});
	}, []);

	const replaceLastAssistantChunks = useCallback((chunks: Chunk[]) => {
		const next = [...messagesRef.current];
		for (let index = next.length - 1; index >= 0; index -= 1) {
			const message = next[index];
			if (message?.role !== 'assistant') continue;
			next[index] = { ...message, content: { type: 'chunks', chunks } };
			break;
		}
		messagesRef.current = next;
		setMessages(next);
	}, []);

	const buildThreadSnapshot = useCallback(
		(overrides?: Partial<LocalThread>): LocalThread => ({
			id: overrides?.id ?? threadIdRef.current,
			title: overrides?.title,
			createdAt: overrides?.createdAt ?? threadCreatedAtRef.current,
			lastActivityAt: overrides?.lastActivityAt ?? Date.now(),
			resources: overrides?.resources ?? resourcesRef.current,
			messages: overrides?.messages ?? toStoredMessages(messagesRef.current)
		}),
		[]
	);

	const persistCurrentThread = useCallback(async () => {
		if (!hasAskedQuestionRef.current) return;
		await saveThread(buildThreadSnapshot());
	}, [buildThreadSnapshot]);

	const startNewThread = useCallback(async () => {
		const next = createThread();
		setThreadId(next.id);
		setThreadCreatedAt(next.createdAt);
		setMessages(createDefaultMessageHistory(startupSummary));
		setShowConversationBanner(true);
		setThreadResources(DEFAULT_THREAD_RESOURCES);
		hasAskedQuestionRef.current = false;
	}, [startupSummary]);

	const handleChunkUpdate = useCallback(
		(update: ChunkUpdate) => {
			if (update.type === 'add') {
				addChunkToLastAssistant(update.chunk);
			} else {
				updateChunkInLastAssistant(update.id, update.chunk);
			}
		},
		[addChunkToLastAssistant, updateChunkInLastAssistant]
	);

	const convertToThreadMessages = useCallback((): ThreadMessage[] => {
		return messagesRef.current
			.filter(
				(m): m is Exclude<Message, { role: 'system' }> =>
					m.role === 'user' || m.role === 'assistant'
			)
			.map((m): ThreadMessage => {
				if (m.role === 'user') {
					return { role: 'user', content: m.content.map((s) => s.content).join('') };
				}
				return { role: 'assistant', content: m.content, canceled: m.canceled };
			});
	}, []);

	const send = useCallback(
		async (input: InputState, mentionedResources: string[], question: string) => {
			hasAskedQuestionRef.current = true;

			const previousResources = resourcesRef.current;
			const updatedResources = selectActiveResources(resourcesRef.current, mentionedResources);
			resourcesRef.current = updatedResources;
			setThreadResources(updatedResources);

			const threadMessages = convertToThreadMessages();

			setMessages((prev) => [
				...prev,
				{ role: 'user', content: input } satisfies Message,
				{ role: 'assistant', content: { type: 'chunks', chunks: [] } } satisfies Message
			]);

			setIsStreaming(true);
			setCancelState('none');

			try {
				const questionWithHistory = formatConversationHistory(threadMessages, question);
				const response = await services.askQuestion(
					updatedResources,
					questionWithHistory,
					handleChunkUpdate
				);
				replaceLastAssistantChunks(response.chunks);

				if (cancelStateRef.current !== 'pending') {
					if (response.doneEvent) {
						const stats = formatStreamStats(response.doneEvent);
						if (stats) addMessage({ role: 'system', content: stats });
					}

					addMessage({ role: 'system', content: 'run /copy to copy message to clipboard' });
				}
			} catch (error) {
				resourcesRef.current = previousResources;
				setThreadResources(previousResources);
				if (cancelStateRef.current !== 'pending') {
					addMessage({ role: 'system', content: `Error: ${formatError(error)}` });
				}
			}

			void config.refreshRuntimeStatus();
			setIsStreaming(false);
			setCancelState('none');

			try {
				await runCliEffect(Effect.tryPromise(persistCurrentThread));
			} catch (error) {
				addMessage({ role: 'system', content: `Error: ${formatError(error)}` });
			}
		},
		[
			addMessage,
			config,
			convertToThreadMessages,
			handleChunkUpdate,
			persistCurrentThread,
			replaceLastAssistantChunks
		]
	);

	const requestCancel = useCallback(() => {
		setCancelState((prev) => (prev === 'none' ? 'pending' : prev));
	}, []);

	const confirmCancel = useCallback(async () => {
		await services.cancelCurrentRequest();
		markLastAssistantMessageCanceled();
		addMessage({ role: 'system', content: 'Request canceled.' });
		setIsStreaming(false);
		setCancelState('none');

		try {
			await runCliEffect(Effect.tryPromise(persistCurrentThread));
		} catch (error) {
			addMessage({ role: 'system', content: `Error: ${formatError(error)}` });
		}
	}, [addMessage, markLastAssistantMessageCanceled, persistCurrentThread]);

	const clearMessages = useCallback(() => {
		void (async () => {
			try {
				await runCliEffect(Effect.tryPromise(persistCurrentThread));
			} catch (error) {
				addMessage({ role: 'system', content: `Error: ${formatError(error)}` });
				return;
			}
			try {
				await runCliEffect(Effect.tryPromise(startNewThread));
			} catch (error) {
				addMessage({ role: 'system', content: `Error: ${formatError(error)}` });
			}
		})();
	}, [addMessage, persistCurrentThread, startNewThread]);

	const removeThreadResources = useCallback((resourceNames: readonly string[]) => {
		setThreadResources((current) => withoutRemovedThreadResources(current, resourceNames));
	}, []);

	const copyLastMessage = useCallback(async () => {
		const assistantMessage = [...messagesRef.current]
			.reverse()
			.find((message) => message.role === 'assistant');
		if (!assistantMessage || assistantMessage.role !== 'assistant') {
			addMessage({ role: 'system', content: 'No assistant response found to copy.' });
			return;
		}

		const assistantIndex = messagesRef.current.lastIndexOf(assistantMessage);
		const userMessage = messagesRef.current
			.slice(0, assistantIndex)
			.reverse()
			.find((message) => message.role === 'user');
		if (!userMessage || userMessage.role !== 'user') {
			addMessage({ role: 'system', content: 'No user question found for the latest response.' });
			return;
		}

		const payload = [
			'User:',
			getUserMessageText(userMessage),
			'',
			'Assistant:',
			getAssistantMessageText(assistantMessage)
		].join('\n');
		try {
			await runCliEffect(Effect.tryPromise(() => copyToClipboard(payload)));
		} catch (error) {
			addMessage({ role: 'system', content: `Error: ${formatError(error)}` });
			return;
		}

		addMessage({ role: 'system', content: 'Copied latest exchange to clipboard.' });
	}, [addMessage]);

	const copyAllMessages = useCallback(async () => {
		const parts = messagesRef.current.flatMap((message) => {
			if (message.role === 'user') return [`User:\n${getUserMessageText(message)}`];
			if (message.role === 'assistant') return [`Assistant:\n${getAssistantMessageText(message)}`];
			return [];
		});
		if (parts.length === 0) {
			addMessage({ role: 'system', content: 'No thread messages found to copy.' });
			return;
		}

		try {
			await runCliEffect(Effect.tryPromise(() => copyToClipboard(parts.join('\n\n'))));
		} catch (error) {
			addMessage({ role: 'system', content: `Error: ${formatError(error)}` });
			return;
		}

		addMessage({ role: 'system', content: 'Copied full thread to clipboard.' });
	}, [addMessage]);

	const resumeThread = useCallback(
		async (nextThreadId: string) => {
			if (nextThreadId === threadIdRef.current) return;

			try {
				await runCliEffect(Effect.tryPromise(persistCurrentThread));
			} catch (error) {
				addMessage({ role: 'system', content: `Error: ${formatError(error)}` });
				return;
			}

			let thread: Awaited<ReturnType<typeof loadThread>>;
			try {
				thread = await runCliEffect(Effect.tryPromise(() => loadThread(nextThreadId)));
			} catch (error) {
				addMessage({ role: 'system', content: `Error: ${formatError(error)}` });
				return;
			}

			if (!thread) {
				addMessage({ role: 'system', content: 'Thread not found.' });
				return;
			}

			hasAskedQuestionRef.current = thread.messages.some((m) => m.role === 'user');
			setThreadId(thread.id);
			setThreadCreatedAt(thread.createdAt);
			setMessages(toUiMessages(thread.messages));
			setShowConversationBanner(shouldShowConversationBannerForThread(thread.messages));
			setThreadResources(thread.resources.length > 0 ? thread.resources : DEFAULT_THREAD_RESOURCES);
		},
		[addMessage, persistCurrentThread]
	);

	useEffect(() => {
		void runCliEffect(Effect.tryPromise(persistCurrentThread)).catch(() => undefined);
	}, [persistCurrentThread]);

	const state = useMemo<MessagesState>(
		() => ({
			messages,
			showConversationBanner,
			addSystemMessage: (content) => addMessage({ role: 'system', content }),
			clearMessages,
			copyLastMessage,
			copyAllMessages,
			threadResources,
			removeThreadResources,
			isStreaming,
			cancelState,
			send,
			requestCancel,
			confirmCancel,
			resumeThread
		}),
		[
			messages,
			showConversationBanner,
			addMessage,
			clearMessages,
			copyLastMessage,
			copyAllMessages,
			threadResources,
			removeThreadResources,
			isStreaming,
			cancelState,
			send,
			requestCancel,
			confirmCancel,
			resumeThread
		]
	);

	return <MessagesContext.Provider value={state}>{props.children}</MessagesContext.Provider>;
};

import { useEffect, useMemo, useState } from 'react';

import { MarkdownText } from './markdown-text.tsx';
import { ConversationBanner } from './conversation-banner.tsx';
import { ToolActivityLight } from './tool-activity-light.tsx';
import { useMessagesContext } from '../context/messages-context.tsx';
import { useToast } from '../context/toast-context.tsx';
import { parseSources, type ParsedSource } from '../lib/citations.ts';
import { openBrowser } from '../lib/open-browser.ts';
import { hasAssistantText, isAssistantContentEmpty } from '../lib/message-display.ts';
import { formatToolTarget } from '../lib/tool-display.ts';
import { colors, getColor } from '../theme.ts';
import type { AssistantContent, Chunk } from '../types.ts';
import { formatSystemLabel, isStartupSummary } from '../lib/startup-summary.ts';
import { useConfigContext } from '../context/config-context.tsx';

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const LoadingSpinner = () => {
	const [frameIndex, setFrameIndex] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setFrameIndex((prev) => (prev + 1) % spinnerFrames.length);
		}, 80);
		return () => clearInterval(interval);
	}, []);

	return <text fg={colors.assistant}>{spinnerFrames[frameIndex]} </text>;
};

const toolColor = (toolName: string): string => {
	switch (toolName) {
		case 'search':
			return colors.toolSearch;
		case 'read':
		case 'read_many':
			return colors.toolRead;
		case 'grep':
			return colors.toolGrep;
		case 'glob':
			return colors.toolGlob;
		case 'list':
			return colors.toolList;
		default:
			return colors.textMuted;
	}
};

const ToolSummary = (props: {
	chunks: Extract<Chunk, { type: 'tool' }>[];
	isStreaming: boolean;
}) => {
	if (props.chunks.length === 0) return null;

	return (
		<box style={{ flexDirection: 'column', gap: 0 }}>
			{props.chunks.map((chunk) => (
				<box key={chunk.id} style={{ flexDirection: 'row', gap: 1 }}>
					<ToolActivityLight
						state={chunk.state}
						streamActive={props.isStreaming}
						startedAt={chunk.startedAt}
						completedAt={chunk.completedAt}
					/>
					<text fg={toolColor(chunk.toolName)}>{chunk.toolName}</text>
					<text fg={colors.text}>{`(${formatToolTarget(chunk)})`}</text>
				</box>
			))}
		</box>
	);
};

const FileChunk = (props: { chunk: Extract<Chunk, { type: 'file' }> }) => (
	<box style={{ flexDirection: 'row', gap: 1 }}>
		<text fg={colors.info}>📄</text>
		<text fg={colors.textMuted}>{props.chunk.filePath}</text>
	</box>
);

const ReasoningChunk = (props: {
	chunk: Extract<Chunk, { type: 'reasoning' }>;
	isStreaming: boolean;
}) => (
	<box style={{ flexDirection: 'column', gap: 0 }}>
		<box style={{ flexDirection: 'row', gap: 1 }}>
			<text fg={colors.textSubtle}>💭 thinking</text>
			{props.isStreaming ? <LoadingSpinner /> : null}
		</box>
		<text fg={colors.textSubtle}>{props.chunk.text}</text>
	</box>
);

const TextChunk = (props: { chunk: Extract<Chunk, { type: 'text' }>; isStreaming: boolean }) => {
	return <AssistantText content={props.chunk.text} streaming={props.isStreaming} />;
};

const SourceLinks = (props: { sources: ParsedSource[] }) => {
	const toast = useToast();
	if (props.sources.length === 0) return null;

	return (
		<box style={{ flexDirection: 'column', gap: 0 }}>
			<text fg={colors.info}>Sources</text>
			{props.sources.map((source, index) => (
				<box
					key={`${source.target}:${index}`}
					style={{ flexDirection: 'column' }}
					onMouseUp={
						source.remote
							? () => {
									void openBrowser(source.target)
										.then(() => toast.show(`Opened: ${source.target}`))
										.catch(() => toast.show('Failed to open URL'));
								}
							: undefined
					}
				>
					<text fg={colors.info}>
						{source.remote ? `- ${source.label} (${source.target})` : `- ${source.label}`}
					</text>
				</box>
			))}
		</box>
	);
};

const AssistantText = (props: { content: string; streaming: boolean }) => {
	const parsed = useMemo(() => parseSources(props.content), [props.content]);
	if (parsed.sources.length === 0) {
		return <MarkdownText content={props.content} streaming={props.streaming} />;
	}

	return (
		<box style={{ flexDirection: 'column', gap: 1 }}>
			{parsed.body ? <MarkdownText content={parsed.body} streaming={props.streaming} /> : null}
			<SourceLinks sources={parsed.sources} />
		</box>
	);
};

const ChunkRenderer = (props: { chunk: Chunk; isStreaming: boolean }) => {
	switch (props.chunk.type) {
		case 'tool':
			return <ToolSummary chunks={[props.chunk]} isStreaming={props.isStreaming} />;
		case 'file':
			return <FileChunk chunk={props.chunk} />;
		case 'reasoning':
			return <ReasoningChunk chunk={props.chunk} isStreaming={props.isStreaming} />;
		case 'text':
			return <TextChunk chunk={props.chunk} isStreaming={props.isStreaming} />;
		default:
			return null;
	}
};

type RenderItem =
	| { kind: 'chunk'; chunk: Chunk }
	| { kind: 'tool-summary'; chunks: Extract<Chunk, { type: 'tool' }>[] };

const ChunksRenderer = (props: {
	chunks: Chunk[];
	isStreaming: boolean;
	isCanceled?: boolean;
	textColor?: string;
}) => {
	const items = useMemo(() => {
		const next: RenderItem[] = [];
		let pendingTools: Extract<Chunk, { type: 'tool' }>[] = [];
		const flushTools = () => {
			if (pendingTools.length === 0) return;
			next.push({ kind: 'tool-summary', chunks: pendingTools });
			pendingTools = [];
		};

		for (const chunk of props.chunks) {
			if (chunk.type === 'tool') {
				pendingTools.push(chunk);
				continue;
			}
			flushTools();
			next.push({ kind: 'chunk', chunk });
		}
		flushTools();
		return next;
	}, [props.chunks]);

	const lastChunkIndex = useMemo(() => {
		for (let i = items.length - 1; i >= 0; i -= 1) {
			if (items[i]?.kind === 'chunk') return i;
		}
		return -1;
	}, [items]);

	return (
		<box style={{ flexDirection: 'column', gap: 1 }}>
			{items.map((item, idx) => {
				if (item.kind === 'tool-summary') {
					const firstId = item.chunks[0]?.id ?? 'none';
					const lastId = item.chunks.at(-1)?.id ?? 'none';
					return (
						<ToolSummary
							key={`tool-summary:${firstId}:${lastId}:${item.chunks.length}`}
							chunks={item.chunks}
							isStreaming={props.isStreaming}
						/>
					);
				}

				const chunk = item.chunk;
				const isLastChunk = idx === lastChunkIndex;

				if (props.isCanceled && chunk.type === 'text') {
					return (
						<text key={`chunk:${chunk.id}`} fg={props.textColor}>
							{chunk.text}
						</text>
					);
				}

				return (
					<ChunkRenderer
						key={`chunk:${chunk.id}`}
						chunk={chunk}
						isStreaming={props.isStreaming && isLastChunk}
					/>
				);
			})}
		</box>
	);
};

const AssistantMessage = (props: {
	content: AssistantContent;
	isStreaming: boolean;
	isCanceled?: boolean;
}) => {
	const textColor = props.isCanceled ? colors.textMuted : undefined;

	if (typeof props.content === 'string') {
		if (props.isCanceled) {
			return <text fg={textColor}>{props.content}</text>;
		}
		return <AssistantText content={props.content} streaming={props.isStreaming} />;
	}

	if (props.content.type === 'text') {
		if (props.isCanceled) {
			return <text fg={textColor}>{props.content.content}</text>;
		}
		return <AssistantText content={props.content.content} streaming={props.isStreaming} />;
	}

	if (props.content.type === 'chunks') {
		return (
			<ChunksRenderer
				chunks={props.content.chunks}
				isStreaming={props.isStreaming}
				isCanceled={props.isCanceled}
				textColor={textColor}
			/>
		);
	}

	return null;
};

export const Messages = () => {
	const messagesState = useMessagesContext();
	const config = useConfigContext();
	const systemLabel = formatSystemLabel({
		provider: config.selectedProvider || config.runtimeStatus?.provider,
		model: config.selectedModel || config.runtimeStatus?.model,
		reasoningEffort: config.selectedReasoningEffort ?? config.runtimeStatus?.reasoningEffort
	});

	const lastAssistantIndex = useMemo(() => {
		for (let i = messagesState.messages.length - 1; i >= 0; i--) {
			if (messagesState.messages[i]?.role === 'assistant') return i;
		}
		return -1;
	}, [messagesState.messages]);
	const startupSummaryMessage = messagesState.messages.find(
		(message) => message.role === 'system' && isStartupSummary(message.content)
	);
	const startupSummary =
		startupSummaryMessage?.role === 'system' ? startupSummaryMessage.content : '';

	return (
		<box style={{ flexGrow: 1, position: 'relative' }}>
			<scrollbox
				style={{
					flexGrow: 1,
					rootOptions: {
						border: true,
						borderColor: colors.border
					},
					contentOptions: {
						flexDirection: 'column',
						padding: 1,
						gap: 2
					},
					stickyScroll: true,
					stickyStart: 'bottom'
				}}
			>
				{messagesState.showConversationBanner ? (
					<ConversationBanner startupSummary={startupSummary} />
				) : null}
				{messagesState.messages.map((m, index) => {
					if (m.role === 'user') {
						return (
							<box key={`user:${index}`} style={{ flexDirection: 'column', gap: 1 }}>
								<text fg={colors.accent}>You </text>
								<text>
									{m.content.map((part, i) => (
										<span key={i} style={{ fg: getColor(part.type) }}>
											{part.content}
										</span>
									))}
								</text>
							</box>
						);
					}

					if (m.role === 'system') {
						return (
							<box key={`sys:${index}`} style={{ flexDirection: 'column', gap: 1 }}>
								<text fg={colors.info}>{systemLabel}</text>
								<text fg={colors.text} content={`${m.content}`} />
							</box>
						);
					}

					const isCanceled = m.canceled === true;
					const isStreaming = messagesState.isStreaming && index === lastAssistantIndex;
					const showThinking = isStreaming && !hasAssistantText(m.content);
					if (!isStreaming && !isCanceled && isAssistantContentEmpty(m.content)) return null;

					return (
						<box key={`ai:${index}`} style={{ flexDirection: 'column', gap: 1 }}>
							{showThinking ? (
								<box style={{ flexDirection: 'row' }}>
									<LoadingSpinner />
									<text fg={colors.assistant}>Agent thinking...</text>
								</box>
							) : (
								<text fg={isCanceled ? colors.textMuted : colors.assistant}>
									{isCanceled ? '◆ AI · canceled' : '◆ AI'}
								</text>
							)}
							<AssistantMessage
								content={m.content}
								isStreaming={isStreaming}
								isCanceled={isCanceled}
							/>
						</box>
					);
				})}
			</scrollbox>
		</box>
	);
};

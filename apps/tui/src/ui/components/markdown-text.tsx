import { useMemo } from 'react';
import { CodeRenderable, getTreeSitterClient } from '@opentui/core';

import { normalizeFenceLang } from '../lib/markdown-fence-lang.ts';
import { normalizeTerminalMarkdown } from '../lib/markdown-format.ts';
import { colors } from '../theme.ts';
import { codeSyntaxStyle, GITHUB_DARK_CODE_COLORS, syntaxStyle } from '../syntax-theme.ts';

export interface MarkdownTextProps {
	content: string;
	streaming?: boolean;
}

export const MarkdownText = (props: MarkdownTextProps) => {
	const treeSitterClient = useMemo(() => getTreeSitterClient(), []);
	const content = useMemo(
		() => normalizeTerminalMarkdown(normalizeFenceLang(props.content)),
		[props.content]
	);

	return (
		<markdown
			content={content}
			syntaxStyle={syntaxStyle}
			treeSitterClient={treeSitterClient}
			conceal
			streaming={Boolean(props.streaming)}
			renderNode={(token, context) => {
				if (token.type !== 'code') return null;

				const r = context.defaultRender();
				if (!r) return r;

				if (r instanceof CodeRenderable) {
					// Keep the surrounding Markdown in the TUI palette; only fenced
					// code receives the editor-style syntax colors.
					r.syntaxStyle = codeSyntaxStyle;
					r.fg = GITHUB_DARK_CODE_COLORS.default;
					r.bg = colors.bgSubtle;
					r.paddingLeft = 1;
					r.paddingRight = 1;
					// Keep long R calls and URLs inside the terminal viewport.
					r.wrapMode = 'char';
					r.truncate = false;
					r.streaming = Boolean(props.streaming);
				}

				return r;
			}}
		/>
	);
};

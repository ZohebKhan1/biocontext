import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useKeyboard } from '@opentui/react';
import { Effect } from 'effect';

import { runCliEffect } from '../../effect/runtime.ts';
import { useConfigContext } from '../context/config-context.tsx';
import { useMessagesContext } from '../context/messages-context.tsx';
import { formatError } from '../lib/format-error.ts';
import { services } from '../services.ts';
import { colors } from '../theme.ts';
import type { BioconductorPackageSummary, BioconductorResourceInput } from '../../client/index.ts';
import type { Repo } from '../types.ts';

const MAX_VISIBLE = 8;
const SEARCH_LIMIT = 60;
const DEBOUNCE_MS = 160;

interface BioconductorPackageBrowserProps {
	onClose: () => void;
}

/** Keep the selected row centred without letting the window run past either end. */
export const getVisibleStart = (selectedIndex: number, total: number): number => {
	if (total <= MAX_VISIBLE) return 0;
	const centered = selectedIndex - Math.floor(MAX_VISIBLE / 2);
	return Math.max(0, Math.min(centered, total - MAX_VISIBLE));
};

/** Preserve custom source overrides while normalizing legacy boolean flags away. */
export const createBioconductorResourceInput = (
	packageName: string,
	existing?: Repo
): BioconductorResourceInput => ({
	type: 'bioconductor',
	name: packageName,
	package: existing?.package ?? packageName,
	...(existing?.release ? { release: existing.release } : {}),
	...(existing?.documents ? { documents: existing.documents } : {}),
	...(existing?.includeCurated === undefined ? {} : { includeCurated: existing.includeCurated }),
	...(typeof existing?.source === 'string' ? { source: existing.source } : {}),
	...(typeof existing?.source === 'string' && existing.sourceBranch
		? { sourceBranch: existing.sourceBranch }
		: {}),
	...(existing?.sourceCommit ? { sourceCommit: existing.sourceCommit } : {}),
	...(existing?.specialNotes ? { specialNotes: existing.specialNotes } : {})
});

const truncate = (value: string, max: number) =>
	value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value;

/**
 * Search the full Bioconductor index and install a package's searchable
 * documentation. Successful installation also makes the package available in
 * local-only @mention autocomplete and pins its settings in the config.
 *
 * The panel is a fixed size on purpose. Every row is exactly one line, the list
 * is always padded to MAX_VISIBLE, and the detail and status lines are always
 * rendered, so moving the selection or typing never reflows the layout.
 */
export const BioconductorPackageBrowser = (props: BioconductorPackageBrowserProps) => {
	const config = useConfigContext();
	const messages = useMessagesContext();

	const [query, setQuery] = useState('');
	const [results, setResults] = useState<BioconductorPackageSummary[]>([]);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [release, setRelease] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	// Guards against a slow earlier request overwriting a newer result set.
	const requestId = useRef(0);

	const runSearch = useCallback(async (nextQuery: string) => {
		const id = ++requestId.current;
		setLoading(true);
		setError(null);
		try {
			const response = await runCliEffect(
				Effect.tryPromise(() => services.searchBioconductorPackages(nextQuery, { limit: SEARCH_LIMIT }))
			);
			if (id !== requestId.current) return;
			setResults(response.packages);
			setRelease(response.release);
			setSelectedIndex(0);
			setLoading(false);
		} catch (cause) {
			if (id !== requestId.current) return;
			setError(formatError(cause));
			setResults([]);
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		const timer = setTimeout(() => void runSearch(query), query ? DEBOUNCE_MS : 0);
		return () => clearTimeout(timer);
	}, [query, runSearch]);

	const configuredNames = useMemo(
		() => new Set(config.repos.map((repo) => repo.name.toLowerCase())),
		[config.repos]
	);
	const localPackageNames = useMemo(
		() => new Set(config.localBioconductorPackageNames.map((name) => name.toLowerCase())),
		[config.localBioconductorPackageNames]
	);

	const visibleStart = getVisibleStart(selectedIndex, results.length);
	const visible = results.slice(visibleStart, visibleStart + MAX_VISIBLE);
	const selected = results[selectedIndex];

	const configuredResource = selected
		? config.repos.find((repo) => repo.name.toLowerCase() === selected.name.toLowerCase())
		: undefined;
	const configuredBioconductorResource =
		configuredResource?.type === 'bioconductor' ? configuredResource : undefined;
	const isConfigured = configuredBioconductorResource !== undefined;
	const sourceUrl =
		typeof configuredBioconductorResource?.source === 'string'
			? configuredBioconductorResource.source
			: selected?.sourceUrl;

	/**
	 * Add the package, or update it in place when it is already configured.
	 *
	 * Updating rather than rejecting is what lets someone add source to a package
	 * they onboarded earlier without removing and re-adding it.
	 */
	const submitSelected = async () => {
		if (!selected || busy) return;
		if (configuredResource && configuredResource.type !== 'bioconductor') {
			setError(
				`The name ${selected.name} is already used by a ${configuredResource.type} resource. Rename that resource, then run /add again.`
			);
			return;
		}

		setBusy(true);
		try {
			const resource = createBioconductorResourceInput(selected.name, configuredBioconductorResource);
			const repoState = {
				name: selected.name,
				type: 'bioconductor' as const,
				url: selected.name,
				branch: 'main',
				package: resource.package,
				...(resource.release ? { release: resource.release } : {}),
				...(resource.documents ? { documents: resource.documents } : {}),
				...(resource.includeCurated === undefined
					? {}
					: { includeCurated: resource.includeCurated }),
				...('source' in resource ? { source: resource.source } : {}),
				...(resource.sourceBranch ? { sourceBranch: resource.sourceBranch } : {}),
				...(resource.sourceCommit ? { sourceCommit: resource.sourceCommit } : {}),
				...(resource.specialNotes ? { specialNotes: resource.specialNotes } : {})
			};

			if (isConfigured) {
				await runCliEffect(Effect.tryPromise(() => services.updateResource(resource)));
				config.addRepo(repoState);
				messages.addSystemMessage(
					`Reinstalled ${selected.name} ${selected.version} with mandatory source from ${sourceUrl ?? 'the package index'}. Mention it with @${selected.name}.`
				);
			} else {
				await runCliEffect(Effect.tryPromise(() => services.addResource(resource)));
				config.addRepo(repoState);
				messages.addSystemMessage(
					`Installed ${selected.name} ${selected.version} with mandatory source from ${sourceUrl ?? 'the package index'}. Mention it with @${selected.name}.`
				);
			}
			await Promise.all([config.refreshLocalBioconductorPackageNames(), config.refreshRuntimeStatus()]);
			props.onClose();
		} catch (cause) {
			setError(formatError(cause));
			setBusy(false);
		}
	};

	// Text editing belongs to the <input>; this only handles navigation, so the
	// two never race over the same keypress.
	useKeyboard((key) => {
		if (busy) return;

		if (key.name === 'escape') {
			props.onClose();
			return;
		}
		if (key.name === 'up') {
			setSelectedIndex((prev) => Math.max(0, prev - 1));
			return;
		}
		if (key.name === 'down') {
			setSelectedIndex((prev) => Math.min(Math.max(0, results.length - 1), prev + 1));
			return;
		}
	});

	const detailLine = (() => {
		if (error) return truncate(error, 76);
		if (loading && results.length === 0) return 'Loading the Bioconductor index…';
		if (!selected) return query.trim() ? `No package matches "${truncate(query, 40)}".` : ' ';
		return truncate(selected.title || 'No title published.', 76);
	})();

	const sourceLine = (() => {
		if (!sourceUrl) return 'source: exact Bioconductor archive';
		const label =
			typeof configuredBioconductorResource?.source === 'string'
				? 'custom_git'
				: (selected?.sourceKind ?? 'bioconductor_archive');
		return truncate(`source: required — ${label} ${sourceUrl}`, 76);
	})();

	const countLine = busy
		? isConfigured
			? 'Reinstalling… '
			: 'Installing… '
		: results.length > 0
			? `${selectedIndex + 1}/${results.length}${release ? ` · ${release} ` : ' '}`
			: ' ';

	return (
		<box
			style={{
				position: 'absolute',
				bottom: 6,
				left: 0,
				width: '100%',
				zIndex: 120,
				backgroundColor: colors.bgRaised,
				border: true,
				borderColor: colors.accent,
				flexDirection: 'column',
				padding: 1
			}}
		>
			<box style={{ flexDirection: 'row', height: 1 }}>
				<text fg={colors.textMuted} content=" Bioconductor packages" style={{ flexGrow: 1 }} />
				<text fg={colors.textSubtle} content={countLine} wrapMode="none" truncate />
			</box>

			<input
				placeholder="Search by name, title, or topic…"
				placeholderColor={colors.textSubtle}
				textColor={colors.text}
				value={query}
				onInput={(value) => {
					setQuery(value);
					setError(null);
				}}
				onSubmit={() => void submitSelected()}
				focused
				style={{ width: '100%' }}
			/>

			{/* Always MAX_VISIBLE single-line rows, so the panel never resizes. */}
			{Array.from({ length: MAX_VISIBLE }, (_, offset) => {
				const pkg = visible[offset];
				if (!pkg) {
					return <text key={`blank-${offset}`} content="" style={{ height: 1 }} />;
				}
				const index = visibleStart + offset;
				const isSelected = index === selectedIndex;
				const configured = configuredNames.has(pkg.name.toLowerCase());
				const local = localPackageNames.has(pkg.name.toLowerCase());
				return (
					<box key={pkg.name} style={{ flexDirection: 'row', height: 1 }}>
						<text
							fg={isSelected ? colors.accent : colors.text}
							content={`${isSelected ? '> ' : '  '}${pkg.name}`}
							wrapMode="none"
							truncate
							style={{ width: 32 }}
						/>
						<text
							fg={colors.textSubtle}
							content={pkg.version}
							wrapMode="none"
							truncate
							style={{ width: 14 }}
						/>
						<text
							fg={colors.textSubtle}
							content={`${pkg.repositoryLabel}${local ? ' · local' : configured ? ' · configured' : ''}`}
							wrapMode="none"
							truncate
							style={{ flexGrow: 1 }}
						/>
					</box>
				);
			})}

			<text
				fg={error ? colors.error : colors.textSubtle}
				content={` ${detailLine}`}
				wrapMode="none"
				truncate
				style={{ height: 1 }}
			/>
			<text
				fg={colors.accent}
				content={` ${sourceLine}`}
				wrapMode="none"
				truncate
				style={{ height: 1 }}
			/>
		</box>
	);
};

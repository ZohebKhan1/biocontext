import { Cause, Exit } from 'effect';

import packageJson from '../package.json';
import { launchTui, type TuiOptions } from './launch.ts';
import { formatCliError } from './effect/errors.ts';
import { createCliRuntime } from './effect/runtime.ts';

declare const __VERSION__: string;
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : (packageJson.version ?? '0.0.0');

const HELP = `biocontext ${VERSION}

Source-grounded Bioconductor package research in a macOS terminal UI.

Usage:
  biocontext [options]

Options:
  --thinking       show model reasoning (default)
  --no-thinking    hide model reasoning
  --tools          show retrieval tool activity (default)
  --no-tools       hide retrieval tool activity
  --sub-agent      hide reasoning and tool activity
  -h, --help       show this help
  -v, --version    show the version

Inside the TUI:
  Ask a question directly; @Bioconductor is selected automatically.
  Use @ to select local package documentation; use /add to install another package.
  Use /connect to choose and authenticate a model provider.
  Use /add to search Bioconductor and install package documentation.
  Use /remove <Package> to remove validated managed package data.
  Use /add to add a CRAN package, Git, or local resource.
`;

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
	console.log(HELP);
	process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
	console.log(VERSION);
	process.exit(0);
}

const supportedFlags = new Set([
	'--thinking',
	'--no-thinking',
	'--tools',
	'--no-tools',
	'--sub-agent'
]);
const unsupported = args.find((arg) => !supportedFlags.has(arg));
if (unsupported) {
	console.error(`error: unsupported argument '${unsupported}'`);
	console.error("Run 'biocontext --help' for usage.");
	process.exit(1);
}

const options: TuiOptions = {
	thinking: !args.includes('--no-thinking'),
	tools: !args.includes('--no-tools'),
	subAgent: args.includes('--sub-agent')
};

const runtime = createCliRuntime();
const launchExit = await runtime.runPromiseExit(launchTui(options));
await runtime.dispose();

if (Exit.isFailure(launchExit)) {
	console.error('Error:', formatCliError(Cause.squash(launchExit.cause)));
	process.exit(1);
}

import { type BunPlugin } from 'bun';
import { transformAsync } from '@babel/core';

export default {
	name: 'biocontext-react-compiler',
	setup(build) {
		build.onLoad({ filter: /\.[tj]sx?$/ }, async (args) => {
			// Only run the compiler for the React TUI code.
			if (!/[\\/]src[\\/]tui[\\/]/.test(args.path)) return;

			const source = await Bun.file(args.path).text();
			const result = await transformAsync(source, {
				filename: args.path,
				// React Compiler runs as a Babel plugin.
				plugins: [['babel-plugin-react-compiler', {}]],
				presets: [
					['@babel/preset-typescript', {}],
					[
						'@babel/preset-react',
						{
							runtime: 'automatic',
							importSource: '@opentui/react'
						}
					]
				],
				sourceMaps: 'inline',
				babelrc: false,
				configFile: false
			});

			return {
				contents: result?.code ?? source,
				loader: 'js'
			};
		});
	}
} satisfies BunPlugin;

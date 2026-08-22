import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { homewardServer } from './src/lib/server/ws-plugin.ts';

export default defineConfig(({ mode }) => {
	// Loaded with an empty prefix so unprefixed, server-only secrets (AI_API_KEY)
	// are available here. They are passed explicitly to the game server and never
	// exposed to the client bundle.
	const env = loadEnv(mode, process.cwd(), '');

	return {
		plugins: [
			tailwindcss(),
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},

				// adapter-node, because the game needs one long-lived process: the hub
				// holds matches in memory and MatchRunner drives a ten-minute chain of
				// timers. `server.ts` serves the emitted handler and mounts /ws onto it.
				adapter: adapter()
			}),
			homewardServer(env)
		]
	};
});

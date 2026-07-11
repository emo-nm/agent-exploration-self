import { defineConfig } from '@flue/cli/config';

export default defineConfig({
	target: 'node',
});

// Keep the dev watcher off the runtime SQLite files (db.ts writes ./data/flue.db
// and its -wal/-shm); without this the file-backed store triggers a dev
// reload loop on every write. Recorded in the baseline notes. Exported as a
// plain object so the config file needs no direct `vite` dependency.
export const vite = {
	server: {
		watch: {
			ignored: ['**/data/**'],
		},
	},
};

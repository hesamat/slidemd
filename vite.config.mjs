import { defineConfig } from 'vite';
import { imageUploadPlugin } from './tools/vite-plugin-upload.mjs';

const noOpen = process.env.WEBDECK_NO_OPEN === '1' || process.env.WEBDECK_NO_OPEN === 'true';

// Ports are set by tools/dev.mjs (which auto-finds free ports). Defaults
// here cover standalone `vite` invocations (npm run dev:vite).
const vitePort = Number(process.env.WEBDECK_VITE_PORT) || 8000;
const cliPort = Number(process.env.WEBDECK_CLI_PORT) || 8001;

export default defineConfig({
    plugins: [imageUploadPlugin()],
    optimizeDeps: {
        exclude: ['@codemirror/language-data'],
    },
    server: {
        host: '127.0.0.1',
        port: vitePort,
        open: noOpen ? false : '/index.html',
        fs: {
            // Allow serving from symlinked node_modules outside the worktree
            // (e.g. when using git worktrees with a shared node_modules).
            allow: ['..'],
        },
        watch: {
            ignored: /[/\\]images[/\\]/,
        },
        proxy: {
            // changeOrigin must stay OFF: the CLI server's isSameOrigin()
            // compares the browser's Origin header against the Host it
            // receives. Rewriting Host to the CLI port would make every
            // write (POST /api/deck) fail the check with a 403.
            '/api': {
                target: `http://127.0.0.1:${cliPort}`,
            },
            '/images': {
                target: `http://127.0.0.1:${cliPort}`,
            },
        },
    },
});

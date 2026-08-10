import { defineConfig } from 'vite';
import { imageUploadPlugin } from './tools/vite-plugin-upload.mjs';

export default defineConfig({
    plugins: [imageUploadPlugin()],
    optimizeDeps: {
        exclude: ['@codemirror/language-data'],
    },
    server: {
        port: 8000,
        open: '/index.html',
        watch: {
            ignored: /[/\\]images[/\\]/,
        },
        proxy: {
            // changeOrigin must stay OFF: the CLI server's isSameOrigin()
            // compares the browser's Origin header against the Host it
            // receives. Rewriting Host to localhost:8001 would make every
            // write (POST /api/deck) fail the check with a 403.
            '/api': {
                target: 'http://localhost:8001',
            },
            '/images': {
                target: 'http://localhost:8001',
            },
        },
    },
});

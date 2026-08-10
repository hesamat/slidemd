import { defineConfig } from 'vite';
import { imageUploadPlugin } from './tools/vite-plugin-upload.mjs';

const noOpen = process.env.WEBDECK_NO_OPEN === '1' || process.env.WEBDECK_NO_OPEN === 'true';

export default defineConfig({
    plugins: [imageUploadPlugin()],
    optimizeDeps: {
        exclude: ['@codemirror/language-data'],
    },
    server: {
        host: '127.0.0.1',
        port: 8000,
        open: noOpen ? false : '/index.html',
        watch: {
            ignored: /[/\\]images[/\\]/,
        },
        proxy: {
            '/api': {
                target: 'http://localhost:8001',
                changeOrigin: true,
            },
            '/images': {
                target: 'http://localhost:8001',
                changeOrigin: true,
            },
        },
    },
});

import { defineConfig } from 'vite';
import { imageUploadPlugin } from './tools/vite-plugin-upload.mjs';

export default defineConfig({
    plugins: [imageUploadPlugin()],
    optimizeDeps: {
        exclude: ['@codemirror/language-data'],
    },
    server: {
        port: 8002,
        open: '/index.html',
        watch: {
            ignored: /[/\\]images[/\\]/,
        },
        proxy: {
            '/api': {
                target: 'http://localhost:8003',
                changeOrigin: true,
            },
            '/images': {
                target: 'http://localhost:8003',
                changeOrigin: true,
            },
        },
    },
});

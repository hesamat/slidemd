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

import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        port: 8000,
        open: '/index.html',
        proxy: {
            '/api': {
                target: 'http://localhost:8001',
                changeOrigin: true,
            },
            '/assets': {
                target: 'http://localhost:8001',
                changeOrigin: true,
            },
        },
    },
});

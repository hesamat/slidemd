import { defineConfig } from 'vite';
import { imageUploadPlugin } from './tools/vite-plugin-upload.mjs';

export default defineConfig({
    plugins: [imageUploadPlugin()],
    server: {
        port: 8000,
        open: '/index.html',
        proxy: {
            '/api': {
                target: 'http://localhost:8001',
                changeOrigin: true,
                bypass(req) {
                    // Let the Vite plugin handle uploads, image listing, and static image serving
                    if (req.url === '/api/upload-image' || req.url === '/api/images') {
                        return false;
                    }
                },
            },
        },
    },
});

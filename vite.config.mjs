import { defineConfig } from 'vite';
import { imageUploadPlugin } from './tools/vite-plugin-upload.mjs';

export default defineConfig({
    plugins: [imageUploadPlugin()],
    server: {
        port: 8000,
        open: '/index.html',
    },
});

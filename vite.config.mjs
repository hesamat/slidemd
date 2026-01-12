import { defineConfig } from 'vite';
import { viteDynamicD2Plugin } from './tools/vite-d2-plugin.mjs';

export default defineConfig({
    server: {
        port: 8000,
        open: '/index.html?role=presenter',
    },
    plugins: [
        viteDynamicD2Plugin(),
    ]
});

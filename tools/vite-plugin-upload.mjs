/**
 * Vite plugin stub.
 *
 * Upload and image listing are handled by the CLI dev server (port 8001).
 * The Vite proxy in vite.config.mjs forwards /api/* and /images/* to it.
 */

/**
 * @returns {import('vite').Plugin}
 */
export function imageUploadPlugin() {
    return {
        name: 'vite-plugin-upload',
        configureServer() {
            // No-op — all API and image routes are proxied to the CLI server.
        },
    };
}

import { D2 } from '@terrastruct/d2';

let d2Instance = null;

async function getD2Instance() {
    if (!d2Instance) {
        d2Instance = new D2();
    }
    return d2Instance;
}

function decodeHtmlEntities(html) {
    return html
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
}

async function renderD2BlocksInHtml(htmlText, { saltPrefix = 'webdeck_d2', startIndex = 0 } = {}) {
    const html = String(htmlText || '');
    const re = /<div class="d2">([\s\S]*?)<\/div>/gi;
    let out = '';
    let last = 0;
    let i = startIndex;

    const d2 = await getD2Instance();

    re.lastIndex = 0;
    let m;
    while ((m = re.exec(html))) {
        out += html.slice(last, m.index);
        last = re.lastIndex;

        const src = decodeHtmlEntities(m[1]).trim();
        const salt = `${saltPrefix}_${i++}`;

        // If the block already contains rendered SVG/HTML (or is empty), don't try to compile.
        // This prevents D2 worker errors like "missing 'diagram' field in input JSON".
        if (!src || src.startsWith('<') || /<svg\b/i.test(src)) {
            out += `<div class="d2">${m[1]}</div>`;
            continue;
        }

        try {
            const compiled = await d2.compile(src, {
                pad: 24,
                center: true,
                noXMLTag: true,
                salt,
            });

            const svg = await d2.render(compiled.diagram, {
                ...(compiled.renderOptions || {}),
                pad: 24,
                center: true,
                noXMLTag: true,
                salt,
            });

            out += `<div class="d2">${svg || ''}</div>`;
        } catch (e) {
            console.error('D2 render error:', e);
            out += `<div class="d2"><pre style="color:#dc2626; white-space:pre-wrap;">D2 render failed: ${String(e)}</pre></div>`;
        }
    }

    out += html.slice(last);
    return out;
}

export function viteDynamicD2Plugin() {
    return {
        name: 'vite-dynamic-d2',

        async transformIndexHtml(html) {
            return await renderD2BlocksInHtml(html);
        },

        configureServer(server) {
            return () => {
                server.middlewares.use('/api/render-d2', async (req, res) => {
                    if (req.method !== 'POST') {
                        res.statusCode = 405;
                        res.end('Method not allowed');
                        return;
                    }

                    let body = '';
                    req.on('data', (chunk) => {
                        body += chunk.toString();
                    });

                    req.on('end', async () => {
                        try {
                            const { html } = JSON.parse(body);
                            const rendered = await renderD2BlocksInHtml(html);
                            res.statusCode = 200;
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({ html: rendered }));
                        } catch (e) {
                            res.statusCode = 500;
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({ error: e.message }));
                        }
                    });
                });
            };
        },
    };
}

export async function terminateD2() {
    if (d2Instance && d2Instance.worker && typeof d2Instance.worker.terminate === 'function') {
        await d2Instance.worker.terminate();
        d2Instance = null;
    }
}

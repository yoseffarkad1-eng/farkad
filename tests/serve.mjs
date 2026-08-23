// A static file server, in Node, with no dependencies.
//
// The browser suite used to need a second terminal running python3 -m http.server, which
// meant `npm ci && npm run test:smoke` from a fresh clone did nothing but fail. A service
// worker needs a real origin - it does not register over file:// - so the suite cannot
// simply open the files.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Returns { url, close }. Port 0 lets the OS pick, so two runs at once do not collide
// and a stale server from an earlier run cannot be mistaken for this one.
export function serve(root, port = 0) {
    const server = createServer(async (request, response) => {
        try {
            // normalize() then a prefix check: without it, a request for
            // /../../etc/passwd would be served, and this thing runs on a developer's
            // machine with their own files under it.
            const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
            let file = normalize(join(root, path === '/' ? '/index.html' : path));
            if (!file.startsWith(normalize(root))) {
                response.writeHead(403).end('no');
                return;
            }

            const info = await stat(file).catch(() => null);
            if (info && info.isDirectory()) file = join(file, 'index.html');

            const body = await readFile(file);
            response.writeHead(200, {
                'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
                // The suite deploys a "new version" mid-run and expects to see it. A
                // cached response would make that test pass or fail on the browser's mood.
                'Cache-Control': 'no-store',
                // The service worker is the point of half these tests, and it will not
                // register without this in some configurations.
                'Service-Worker-Allowed': '/'
            });
            response.end(body);
        } catch (error) {
            response.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
        }
    });

    return new Promise(resolve => {
        server.listen(port, '127.0.0.1', () => {
            const { port: actual } = server.address();
            resolve({
                url: `http://127.0.0.1:${actual}`,
                close: () => new Promise(done => server.close(done))
            });
        });
    });
}

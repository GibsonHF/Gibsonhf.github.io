'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = Number(process.env.PORT || 8080);
const ROOT = __dirname;
const DB_PATH = '/home/gibson/IdeaProjects/rs3cache_extractor/worldReachableTiles.db';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.xml': 'application/xml; charset=utf-8',
    '.db': 'application/octet-stream',
};

function sendFile(res, filePath) {
    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stat.size,
            'Cache-Control': 'no-cache',
        });
        fs.createReadStream(filePath).pipe(res);
    });
}

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url);
    const requestPath = decodeURIComponent(parsedUrl.pathname || '/');

    if (requestPath === '/worldReachableTiles.db') {
        return sendFile(res, DB_PATH);
    }

    const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, '');
    let filePath = path.join(ROOT, safePath);

    if (requestPath.endsWith('/')) {
        filePath = path.join(filePath, 'index.html');
    }

    fs.stat(filePath, (err, stat) => {
        if (!err && stat.isDirectory()) {
            return sendFile(res, path.join(filePath, 'index.html'));
        }
        return sendFile(res, filePath);
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`Server running at http://127.0.0.1:${PORT}`);
    console.log(`Serving DB from ${DB_PATH}`);
});

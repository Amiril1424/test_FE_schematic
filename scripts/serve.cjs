const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml',
  '.png':'image/png', '.gif':'image/gif', '.json':'application/json', '.woff2':'font/woff2' };
const port = Number(process.env.PORT || 8080);
http.createServer((req,res) => {
  try {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (relative === '/' ? '/index.html' : relative));
    if (!file.startsWith(root + path.sep) || path.relative(root,file).split(path.sep).some(part => part.startsWith('.'))) {
      res.writeHead(403); res.end(); return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(400); res.end(); }
}).listen(port, '127.0.0.1', () => console.log(`Schematic: http://127.0.0.1:${port}`));

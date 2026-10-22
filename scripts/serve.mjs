import {createServer} from 'node:http';
import {readFile, realpath} from 'node:fs/promises';
import {resolve, relative, extname, sep} from 'node:path';

const root = await realpath(process.cwd());
const allowed = new Set(['index.html','demo.js','demo.css','dist','assets','examples']);
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.avif':'image/avif'};
const port = Number(process.env.PORT ?? 25996);
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    const path = decodeURIComponent(url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname);
    const first = path.split('/')[1];
    if (!allowed.has(first)) throw new Error('Not public');
    const file = await realpath(resolve(root, `.${path}`));
    const resolvedRelative = relative(root,file);
    if (resolvedRelative.startsWith('..') || !allowed.has(resolvedRelative.split(sep)[0])) throw new Error('Not public');
    const body = await readFile(file);
    response.writeHead(200, {'Content-Type':mime[extname(file)] ?? 'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    response.end(body);
  } catch {
    response.writeHead(404, {'Content-Type':'text/plain'});response.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}/ (public demo assets only)`));

// Local metadata-only integration harness; never proxies audio or changes production validation.
import http from 'node:http';
import { readFileSync, existsSync, statSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
export function createPreview({ webRoot = 'www', dataRoot = '../radio-bee-data/dist/v1', requests = [] } = {}) {
  const web = realpathSync(webRoot),
    data = realpathSync(dataRoot);
  return http.createServer((request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) return response.writeHead(405).end();
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const metadata = pathname.startsWith('/__catalogue/v1/'),
        root = metadata ? data : web;
      const relative = metadata ? pathname.slice('/__catalogue/v1/'.length) : pathname.replace(/^\/radio-bee\//, '');
      let file = path.resolve(root, relative.replace(/^\//, ''));
      if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
      if (!existsSync(file) || statSync(file).isDirectory()) {
        if (metadata) return response.writeHead(404).end();
        file = path.join(root, 'index.html');
      }
      if (!realpathSync(file).startsWith(root + path.sep)) return response.writeHead(403).end();
      const mime = {
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.json': 'application/json',
        '.woff2': 'font/woff2',
        '.html': 'text/html',
      };
      response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      response.setHeader('Cache-Control', 'no-store');
      if (metadata) requests.push({ path: relative, bytes: statSync(file).size });
      let body = readFileSync(file);
      if (!metadata && file === path.join(root, 'index.html'))
        body = Buffer.from(
          body.toString().replace(
            '</head>',
            `<script>
   const originalCatalogueFetch=window.fetch.bind(window);
   window.fetch=(input,options)=>{const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    const base='https://actionanand.github.io/radio-bee-data/v1/';
    return originalCatalogueFetch(url.startsWith(base)?'/__catalogue/v1/'+url.slice(base.length):input,options);
   };
  </script></head>`,
          ),
        );
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(404).end();
    }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createPreview({ webRoot: process.env.RADIOBEE_WEB_ROOT, dataRoot: process.env.RADIOBEE_DATA_ROOT });
  const port = Number(process.env.RADIOBEE_PREVIEW_PORT || 4312);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw Error('Invalid preview port');
  server.listen(port, '127.0.0.1', () =>
    console.log(
      `Built-data integration: http://localhost:${port}/radio-bee/home. Actual HTTP data; no seed or audio relay.`,
    ),
  );
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
}

// Serve the production Pages artifact locally. Optional metadata-only review harness; never proxies audio.
const fs = require('fs'),
  http = require('http'),
  path = require('path');
if (process.platform !== 'linux') throw Error('Run through WSL2 Linux Node');
const args = process.argv.slice(2);
const option = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const port = Number(option('--port') || 3063);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid preview port');
const root = path.resolve('www');
const snapshotPath = option('--snapshot');
if (snapshotPath && !path.resolve(snapshotPath).startsWith(process.cwd() + path.sep))
  throw Error('Snapshot must be client-local');
const review = args.includes('--review-playback');
if (review && !snapshotPath) throw Error('Review playback requires an explicit snapshot');
const catalogBase = 'https://actionanand.github.io/radio-bee-data/v1/';
const harness = snapshotPath
  ? `<script>
const nativeFetch=window.fetch.bind(window);
window.fetch=(input,options)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  return nativeFetch(url.startsWith(${JSON.stringify(catalogBase)})?'/__review_catalogue/'+url.slice(${catalogBase.length}):input,options);
};
document.addEventListener('DOMContentLoaded',()=>{
  const observer=new MutationObserver(()=>{
    const home=document.querySelector('.home-content'), clear=document.querySelector('.filters button'), listen=document.querySelector('[data-category=listenNow]');
    if(home&&clear&&listen){
      observer.disconnect();
      const banner=document.createElement('p');
      banner.textContent='LOCAL REVIEW — unpublished catalogue metadata. Original stream permissions are unchanged.';
      banner.style.cssText='padding:12px;background:#e9efdc;color:#173a32;font:14px sans-serif';
      home.prepend(banner);
      ${review ? 'clear.click();listen.click();' : ''}
    }
  });
  observer.observe(document.body,{childList:true,subtree:true});
});</script>`
  : '';
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.startsWith('/__review_catalogue/')) {
    if (!snapshotPath) return res.writeHead(404).end();
    const catalog = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    const file = pathname.slice('/__review_catalogue/'.length);
    const key = Object.keys(catalog.manifest.files).find(key => catalog.manifest.files[key] === file);
    const locale = ['en', 'ta', 'sa'].find(locale => file === catalog.manifest.localizationRoot + locale + '.json');
    const value =
      file === 'index.json' ? catalog.manifest : key ? catalog[key] : locale ? catalog.localization[locale] : null;
    if (!value) return res.writeHead(404).end();
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(value));
  }
  let file = path.resolve(
    root,
    decodeURIComponent(pathname)
      .replace(/^\/radio-bee\//, '')
      .replace(/^\//, '') || 'index.html',
  );
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  const ext = path.extname(file);
  res.setHeader(
    'Content-Type',
    {
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.webp': 'image/webp',
      '.woff2': 'font/woff2',
    }[ext] || 'text/html',
  );
  res.setHeader('Cache-Control', 'no-store');
  const body = fs.readFileSync(file);
  res.end(ext === '.html' ? body.toString().replace('<head>', '<head>' + harness) : body);
});
server.listen(port, '0.0.0.0', () =>
  console.log(
    `RadioBee ${snapshotPath ? 'LOCAL REVIEW' : 'published catalogue'} preview: http://localhost:${port}/radio-bee/home`,
  ),
);

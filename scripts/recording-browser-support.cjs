// Shared manual-browser harness support. No production imports or app configuration changes.
const fs = require('node:fs');
const path = require('node:path');
async function exportDownload(browser, context, page, destination, trigger) {
  const browserDir = process.env.RADIOBEE_BROWSER_DOWNLOAD_DIR;
  const nodeDir = process.env.RADIOBEE_NODE_DOWNLOAD_DIR;
  if (!!browserDir !== !!nodeDir) throw Error('Specify both browser and Node download directories');
  if (!browserDir) {
    const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
    await download.saveAs(destination);
    return { transport: 'playwright', bytes: fs.statSync(destination).size };
  }
  // CDP may connect Linux Node to Windows Chrome. Playwright's Linux temporary
  // artifact path is not a valid Windows download directory. Observe a genuine
  // completed browser download in an explicitly mapped directory instead.
  if (!path.win32.isAbsolute(browserDir)) throw Error('Browser download directory must be absolute');
  fs.mkdirSync(nodeDir, { recursive: true });
  const target = await context.newCDPSession(page);
  const { targetInfo } = await target.send('Target.getTargetInfo');
  await target.detach();
  const session = await browser.newBrowserCDPSession();
  let timer, guid;
  const completion = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(Error('Browser download did not complete')), 30_000);
    session.on('Browser.downloadWillBegin', event => {
      if (!guid && event.url.startsWith('blob:')) guid = event.guid;
    });
    session.on('Browser.downloadProgress', event => {
      if (event.guid !== guid) return;
      if (event.state === 'canceled') reject(Error('Chrome canceled the download'));
      if (event.state === 'completed') resolve(event);
    });
  });
  try {
    await session.send('Browser.setDownloadBehavior', {
      behavior: 'allowAndName',
      downloadPath: browserDir,
      browserContextId: targetInfo.browserContextId,
      eventsEnabled: true,
    });
    const [finished] = await Promise.all([completion, trigger()]);
    const downloaded = path.join(nodeDir, finished.guid);
    fs.copyFileSync(downloaded, destination);
    return { transport: 'cdp-completed-file', state: finished.state, bytes: fs.statSync(destination).size };
  } finally {
    clearTimeout(timer);
    await session.detach();
  }
}
module.exports = { exportDownload };

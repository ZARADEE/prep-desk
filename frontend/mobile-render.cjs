// Trusted local renderer. Text and math are escaped; no remote content or scripts run.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const katex = require('katex');
const [source, output] = process.argv.slice(2).filter(value => !value.startsWith('--'));
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
function render(text) {
  const expression = /\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g;
  let previous = 0, html = '', match;
  while ((match = expression.exec(text))) {
    html += escape(text.slice(previous, match.index)).replace(/\n/g, '<br>');
    html += katex.renderToString(match[1] || match[2] || match[3] || match[4], { displayMode: !!(match[1] || match[3]), throwOnError: false, trust: false, strict: false });
    previous = expression.lastIndex;
  }
  return html + escape(text.slice(previous)).replace(/\n/g, '<br>');
}
app.whenReady().then(async () => {
  try {
    const data = JSON.parse(fs.readFileSync(source, 'utf8'));
    const cssPath = path.join(path.dirname(require.resolve('katex')), 'katex.min.css');
    let css = fs.readFileSync(cssPath, 'utf8').replace(/url\(([^)]+)\)/g, (_, url) => `url("${pathToFileURL(path.resolve(path.dirname(cssPath), url.replace(/["']/g, ''))).href}")`);
    const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src file:;"><style>${css}*{box-sizing:border-box}body{width:720px;margin:0;padding:28px;background:white;color:#172332;font:26px/1.8 Arial,'Microsoft YaHei',sans-serif;overflow-wrap:anywhere}section{margin-bottom:18px}.katex-display{overflow:visible}.katex{font-size:1.12em}</style><body>${data.parts.map(text => `<section>${render(String(text || ''))}</section>`).join('')}</body></html>`;
    const file = source + '.html'; fs.writeFileSync(file, html);
    const win = new BrowserWindow({ show: false, width: 740, height: 800, webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
    await win.loadFile(file);
    const height = await win.webContents.executeJavaScript('document.fonts.ready.then(()=>Math.ceil(document.body.scrollHeight))');
    if (height > 16000) throw new Error('Question exceeds image height limit');
    win.setContentSize(740, Math.max(100, height));
    await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const image = await win.webContents.capturePage({ x:0, y:0, width:720, height:Math.max(100,height) });
    fs.writeFileSync(output, image.toPNG()); win.destroy(); app.exit(0);
  } catch (error) { console.error(String(error)); app.exit(1); }
});

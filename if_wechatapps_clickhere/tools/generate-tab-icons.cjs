const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '../..');
const React = require(path.join(repo, 'frontend/node_modules/react'));
const { renderToStaticMarkup } = require(path.join(repo, 'frontend/node_modules/react-dom/server'));
const icons = require(path.join(repo, 'frontend/node_modules/lucide-react'));
const output = path.resolve(__dirname, '../assets/tab');
const items = [
  ['home', icons.House],
  ['compose', icons.Files],
  ['wrong', icons.BookX],
  ['timer', icons.Timer]
];

async function draw(window, name, Icon, selected) {
  const color = selected ? '#172332' : '#78868a';
  const svg = renderToStaticMarkup(React.createElement(Icon, {
    size: 58, color, strokeWidth: 2.5, absoluteStrokeWidth: false
  }));
  const background = selected ? '#ffd54f' : 'transparent';
  const html = '<!doctype html><html><body style="margin:0;background:transparent">' +
    '<div style="width:96px;height:96px;display:flex;align-items:center;justify-content:center">' +
    '<div style="width:76px;height:76px;display:flex;align-items:center;justify-content:center;' +
    'background:' + background + ';border-radius:7px">' + svg + '</div></div></body></html>';
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise(resolve => setTimeout(resolve, 100));
  const bitmap = await window.webContents.capturePage();
  const filename = name + (selected ? '-active' : '') + '.png';
  fs.writeFileSync(path.join(output, filename), bitmap.toPNG());
  console.log(filename, bitmap.getSize());
}

app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true });
  const window = new BrowserWindow({
    width: 96, height: 96, show: false, frame: false, transparent: true,
    webPreferences: { offscreen: true }
  });
  try {
    for (const [name, Icon] of items) {
      await draw(window, name, Icon, false);
      await draw(window, name, Icon, true);
    }
  } finally {
    window.destroy();
    app.quit();
  }
}).catch(error => {
  console.error(error);
  app.exit(1);
});

const sync = require('./sync.js');
const KEY = 'paper-helper-assets-v1';
const pending = {};
function inventory() { try { return wx.getStorageSync(KEY) || {}; } catch (_) { return {}; } }
function cached(id, kind) {
  const item = inventory()[id + ':' + kind];
  if (!item) return null;
  try { wx.getFileSystemManager().accessSync(item.path); return item; } catch (_) { return null; }
}
async function ensure(id, kind, refresh) {
  const key = id + ':' + kind;
  if (!refresh && cached(id, kind)) return cached(id, kind).path;
  if (pending[key]) return pending[key];
  pending[key] = (async () => {
    const meta = await sync.request('/mobile/assets/' + encodeURIComponent(id) + '/' + kind);
    const old = cached(id, kind);
    if (old && old.md5 === meta.md5) return old.path;
    const active = sync.connection();
    const file = await new Promise((resolve, reject) => wx.downloadFile({ url: active.apiBase + meta.path,
      header: { 'X-Paper-Helper-Mobile-Token': active.token || '', 'X-Paper-Helper-Sync-Token': active.token || '' },
      timeout: 60000, success: result => result.statusCode === 200 ? resolve(result.tempFilePath) : reject(new Error('图片下载失败')), fail: reject }));
    const info = await new Promise((resolve, reject) => wx.getFileInfo({ filePath: file, digestAlgorithm: 'md5', success: resolve, fail: reject }));
    if (info.size !== meta.bytes || info.digest !== meta.md5) throw new Error('图片校验失败，请重试下载');
    const saved = await new Promise((resolve, reject) => wx.saveFile({ tempFilePath: file, success: value => resolve(value.savedFilePath), fail: reject }));
    const all = inventory(); all[key] = { path: saved, md5: meta.md5, bytes: meta.bytes };
    wx.setStorageSync(KEY, all);
    if (old && old.path !== saved) wx.removeSavedFile({ filePath: old.path, fail() {} });
    return saved;
  })();
  try { return await pending[key]; } finally { delete pending[key]; }
}
function remove(ids) {
  const all = inventory();
  ids.forEach(id => ['question','analysis'].forEach(kind => { const key = id + ':' + kind; if (all[key]) { wx.removeSavedFile({ filePath: all[key].path, fail() {} }); delete all[key]; } }));
  wx.setStorageSync(KEY, all);
}
module.exports = { ensure, cached, inventory, remove };

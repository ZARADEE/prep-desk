const config = require('../data/sync-config.js');

const DEVICE_KEY = 'paper-helper-mini-sync-device-v1';
const CONNECTION_KEY = 'paper-helper-mini-connection-v1';
let deviceId = '';
function connection() {
  try { return Object.assign({}, config, wx.getStorageSync(CONNECTION_KEY) || {}); }
  catch (_) { return config || {}; }
}
function configure(link, token) {
  const match = String(link || '').trim().match(/^(https?:\/\/[^\s/?#]+)(?:\/api)?/);
  if (!match || match[1].includes('@')) throw new Error('请输入电脑启动窗口中的 HTTP/HTTPS 链接');
  const embedded = String(link).match(/[?&]access_token=([^&#]+)/);
  const value = { apiBase: match[1] + '/api', token: token || (embedded ? decodeURIComponent(embedded[1]) : '') };
  wx.setStorageSync(CONNECTION_KEY, value);
  return value;
}

function getDeviceId() {
  if (deviceId) return deviceId;
  try { deviceId = wx.getStorageSync(DEVICE_KEY) || ''; } catch (_) {}
  if (!deviceId) {
    deviceId = 'mini-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
    try { wx.setStorageSync(DEVICE_KEY, deviceId); } catch (_) {}
  }
  return deviceId;
}

function enabled() {
  return !!(connection().apiBase && typeof wx.request === 'function');
}

function request(path, method, data) {
  if (!enabled()) return Promise.reject(new Error('local sync is not configured'));
  return new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/json' };
    const active = connection();
    if (active.token) { headers['X-Paper-Helper-Sync-Token'] = active.token; headers['X-Paper-Helper-Mobile-Token'] = active.token; }
    wx.request({
      url: active.apiBase.replace(/\/$/, '') + path,
      method: method || 'GET',
      data,
      header: headers,
      timeout: 60000,
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300 && response.data && response.data.ok !== false) resolve(response.data);
        else { const detail = response.data && response.data.detail; const error = new Error(typeof detail === 'string' ? detail : detail && detail.message || '请求失败：' + response.statusCode); error.status = response.statusCode; error.detail = detail; reject(error); }
      },
      fail: reject
    });
  });
}

function pull(keys) {
  const suffix = keys && keys.length ? '&keys=' + encodeURIComponent(keys.join(',')) : '';
  return request('/sync/state?device_id=' + encodeURIComponent(getDeviceId()) + suffix, 'GET');
}

function push(changes, baseValues) {
  return request('/sync/state', 'POST', { device_id: getDeviceId(), changes, base_values: baseValues || {} });
}

module.exports = { enabled, getDeviceId, pull, push, request, connection, configure };

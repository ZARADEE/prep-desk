const config = require('../data/sync-config.js');

const DEVICE_KEY = 'paper-helper-mini-sync-device-v1';
let deviceId = '';

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
  return !!(config && config.apiBase && typeof wx.request === 'function');
}

function request(path, method, data) {
  if (!enabled()) return Promise.reject(new Error('local sync is not configured'));
  return new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/json' };
    if (config.token) headers['X-Paper-Helper-Sync-Token'] = config.token;
    wx.request({
      url: config.apiBase.replace(/\/$/, '') + path,
      method,
      data,
      header: headers,
      timeout: 5000,
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300 && response.data && response.data.ok !== false) resolve(response.data);
        else reject(new Error('sync request failed: ' + response.statusCode));
      },
      fail: reject
    });
  });
}

function pull(keys) {
  const suffix = keys && keys.length ? '&keys=' + encodeURIComponent(keys.join(',')) : '';
  return request('/sync/state?device_id=' + encodeURIComponent(getDeviceId()) + suffix, 'GET');
}

function push(changes) {
  return request('/sync/state', 'POST', { device_id: getDeviceId(), changes });
}

module.exports = { enabled, getDeviceId, pull, push };

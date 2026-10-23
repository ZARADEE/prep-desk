const store = require('./store.js');
const TIMER_PAGE = '/pages/timer/index';

function isLocked(timer) {
  return !!(timer && timer.mode === 'focus' && timer.focusLocked);
}

function leave() {
  const timer = store.read().timer;
  const now = Date.now();
  if (!isLocked(timer) || timer.backgroundAt) return;
  const remaining = timer.running ? Math.max(0, Math.ceil((timer.endAt - now) / 1000)) : timer.remaining;
  store.save({ timer: Object.assign({}, timer, {
    backgroundAt: now, interruptions: (timer.interruptions || 0) + 1,
    remaining, running: false, endAt: 0
  }) });
}

function returnToApp() {
  const timer = store.read().timer;
  if (!timer || !timer.backgroundAt) return;
  const elapsed = Math.max(0, Date.now() - timer.backgroundAt);
  store.save({ timer: Object.assign({}, timer, {
    backgroundAt: 0, awaySeconds: (timer.awaySeconds || 0) + Math.floor(elapsed / 1000)
  }) });
}

function restorePage() {
  if (!isLocked(store.read().timer)) return false;
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  if (!current || current.route !== TIMER_PAGE.slice(1)) {
    wx.switchTab({ url: TIMER_PAGE });
    return true;
  }
  return false;
}

module.exports = { isLocked, leave, returnToApp, restorePage };

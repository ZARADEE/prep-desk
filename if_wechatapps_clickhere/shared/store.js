const KEY = 'paper-helper-mini-v1';
const sync = require('./sync.js');
const SYNC_KEYS = ['todos', 'target', 'wrong', 'history', 'practiceSession', 'practiceFilters', 'timer'];
let memory = {};
let pendingWrite = false;
let retryAt = 0;
let warned = false;
let syncTimer = null;
let syncing = false;

function localWrite(value) {
  try {
    wx.setStorageSync(KEY, value);
    pendingWrite = false;
    retryAt = 0;
  } catch (_) {
    pendingWrite = true;
    retryAt = Date.now() + 10000;
    if (!warned) {
      warned = true;
      wx.showToast({ title: '本机存储不可用，进度仅暂存本次运行', icon: 'none', duration: 4000 });
      console.warn('Local storage is unavailable; progress is held in memory until a later save succeeds.');
    }
  }
}

function syncPayload(value) {
  const changes = {};
  SYNC_KEYS.forEach(key => { if (value[key] !== undefined) changes[key] = value[key]; });
  return changes;
}

function scheduleSync(value) {
  if (!sync.enabled()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { sync.push(syncPayload(value)).catch(() => {}); }, 350);
}

function read() {
  if (pendingWrite) return memory;
  try {
    const value = wx.getStorageSync(KEY);
    memory = value && typeof value === 'object' ? value : {};
  } catch (_) {}
  return memory;
}

function save(patch) {
  const next = Object.assign({}, read(), patch);
  memory = next;
  if (!(pendingWrite && Date.now() < retryAt)) localWrite(next);
  scheduleSync(next);
  return next;
}

async function syncNow() {
  if (!sync.enabled() || syncing) return { enabled: false, online: false };
  syncing = true;
  try {
    const response = await sync.pull(SYNC_KEYS);
    const next = Object.assign({}, read());
    Object.keys(response.state || {}).forEach(key => {
      if (SYNC_KEYS.includes(key)) next[key] = response.state[key].value;
    });
    memory = next;
    localWrite(next);
    return { enabled: true, online: true, updatedAt: Date.now() };
  } catch (_) {
    return { enabled: true, online: false };
  } finally { syncing = false; }
}

function getWrong() { return read().wrong || {}; }
function getHistory() { return read().history || []; }
function setAnswer(question, selected, correct) {
  const state = read();
  const history = (state.history || []).slice(-499);
  history.push({ id: question.id, subject: question.subject, selected, correct, at: Date.now() });
  const wrong = state.wrong || {};
  if (!correct) {
    const previous = wrong[question.id] || {};
    wrong[question.id] = { id: question.id, subject: question.subject, root: question.root,
      count: (previous.count || 0) + 1, at: Date.now() };
  } else if (wrong[question.id]) {
    delete wrong[question.id];
  }
  save({ history, wrong });
}

module.exports = { read, save, syncNow, syncEnabled: sync.enabled, getWrong, getHistory, setAnswer };

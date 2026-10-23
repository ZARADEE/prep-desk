const KEY = 'paper-helper-mini-v1';
const sync = require('./sync.js');
const SYNC_KEYS = ['todos', 'target', 'notes', 'mastery', 'goals', 'preferences', 'sketches'];
let memory = {};
let pendingWrite = false;
let retryAt = 0;
let warned = false;
let syncTimer = null;
let syncing = false;
let lastSync = 0;
let syncError = '';
const listeners = new Set();
function status() {
  const count = Object.keys(memory._syncDirty || {}).length + (memory.outbox || []).length;
  return { localSaved: !pendingWrite, pending: count, lastSync, error: syncError,
    label: pendingWrite ? '本机保存失败 · 点此重试' : syncing ? '已存本机 · 正在同步' :
      sync.enabled() && count ? '已存本机 · 待同步 ' + count + ' 项' : lastSync ? '已存电脑' : '已存本机' };
}
function notify() { listeners.forEach(listener => listener(status())); }
function subscribe(listener) { listeners.add(listener); listener(status()); return () => listeners.delete(listener); }

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
  notify();
}

function syncPayload(value) {
  const changes = {};
  SYNC_KEYS.forEach(key => { if (value[key] !== undefined) changes[key] = value[key]; });
  return changes;
}

function scheduleSync(value) {
  if (!sync.enabled()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncNow(); }, 350);
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
  next._syncDirty = Object.assign({}, next._syncDirty);
  SYNC_KEYS.forEach(key => { if (Object.prototype.hasOwnProperty.call(patch, key)) next._syncDirty[key] = Date.now() + Math.random(); });
  memory = next;
  if (!(pendingWrite && Date.now() < retryAt)) localWrite(next);
  scheduleSync(next);
  return next;
}

async function syncNow() {
  if (!sync.enabled() || syncing) return { enabled: false, online: false };
  syncing = true;
  notify();
  try {
    const before = read();
    const dirty = Object.assign({}, before._syncDirty);
    const outbox = (before.outbox || []).slice();
    for (const event of outbox) {
      await sync.request(event.path, event.method || 'POST', event.body);
      memory = Object.assign({}, read(), { outbox: (read().outbox || []).filter(item => item.id !== event.id) });
      localWrite(memory);
    }
    if (Object.keys(dirty).length) {
      const changes = {};
      Object.keys(dirty).forEach(key => { changes[key] = before[key]; });
      const pushed = await sync.push(changes, before._syncBase || {});
      const current = read();
      const remaining = Object.assign({}, current._syncDirty);
      Object.keys(dirty).forEach(key => { if (remaining[key] === dirty[key]) delete remaining[key]; });
      const bases = Object.assign({}, current._syncBase);
      Object.keys(pushed.state || {}).forEach(key => { bases[key] = pushed.state[key].value; });
      const merged = {};
      Object.keys(changes).forEach(key => { if (!remaining[key] && pushed.state[key]) merged[key] = pushed.state[key].value; });
      memory = Object.assign({}, current, merged, { _syncDirty: remaining, _syncBase: bases, syncConflict: null });
      localWrite(memory);
    }
    const response = await sync.pull(SYNC_KEYS);
    const next = Object.assign({}, read());
    Object.keys(response.state || {}).forEach(key => {
      if (SYNC_KEYS.includes(key) && !(next._syncDirty || {})[key]) {
        next[key] = response.state[key].value;
        next._syncBase = Object.assign({}, next._syncBase, { [key]: response.state[key].value });
      }
    });
    memory = next;
    localWrite(next);
    lastSync = Date.now(); syncError = '';
    return { enabled: true, online: true, updatedAt: Date.now() };
  } catch (error) {
    syncError = String(error.message || error);
    if (error.status === 409 && error.detail && error.detail.key) {
      memory = Object.assign({}, read(), { syncConflict: error.detail }); localWrite(memory);
    }
    return { enabled: true, online: false };
  } finally { syncing = false; notify(); }
}

function retrySave() { memory = read(); localWrite(memory); if (!pendingWrite) syncNow(); return status(); }
function enqueue(event) {
  const outbox = read().outbox || [];
  if (!outbox.some(item => item.id === event.id)) save({ outbox: outbox.concat(event) });
}
function resolveConflict(useLocal) {
  const state = read(), conflict = state.syncConflict;
  if (!conflict) return;
  const patch = { _syncBase: Object.assign({}, state._syncBase, { [conflict.key]: conflict.current }), syncConflict: null };
  patch[conflict.key] = useLocal ? state[conflict.key] : conflict.current;
  save(patch); syncNow();
}

function getWrong() { return read().wrong || {}; }
function getHistory() { return read().history || []; }
function setAnswer(question, selected, correct, eventId) {
  const state = read();
  const history = (state.history || []).slice();
  if (eventId && history.some(item => item.eventId === eventId)) return;
  history.push({ id: question.id, eventId: eventId || 'answer-' + Date.now() + '-' + Math.random(), subject: question.subject, selected, correct, at: Date.now() });
  const wrong = state.wrong || {};
  if (!correct) {
    const previous = wrong[question.id] || {};
    wrong[question.id] = { id: question.id, subject: question.subject, root: question.root,
      count: (previous.count || 0) + 1, state: 'pending', at: Date.now() };
  } else if (wrong[question.id]) {
    wrong[question.id] = Object.assign({}, wrong[question.id], { state: 'passed', passedAt: Date.now() });
  }
  save({ history, wrong });
  const notes = Object.assign({}, read().notes);
  if (!notes[question.id]) notes[question.id] = { favorite: false, cause: '', note: '' };
  save({ notes });
  const active = state.practiceSession;
  if (question.type === 'choice' && active) enqueue({ id: eventId || active.id + ':' + question.id,
    path: '/sync/practice/answer', body: { device_id: sync.getDeviceId(), client_session_id: active.id,
      question_id: question.id, selected_options: selected, subject: question.subject, question_bank_id: question.bank,
      question_ids: active.items.map(item => item.id) } });
}

module.exports = { read, save, syncNow, syncEnabled: sync.enabled, getWrong, getHistory, setAnswer, status, subscribe, retrySave, enqueue, resolveConflict };

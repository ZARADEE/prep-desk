const store = require('./store.js');

function navigate(session, replace) {
  const item = session.items[session.index];
  const options = { url: '/' + item.root + '/index?session=' + session.id,
    fail: () => wx.showToast({ title: '页面打开失败，可返回后继续练习', icon: 'none' }) };
  if (replace) wx.redirectTo(options);
  else wx.navigateTo(options);
}

function start(items, title, origin, replace) {
  if (!items.length) return false;
  const session = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 8), title, origin,
    items: items.map(item => ({ id: item.id, root: item.root })),
    index: 0, answers: {}, drafts: {}, startedAt: Date.now()
  };
  store.save({ practiceSession: session });
  navigate(session, replace);
  return true;
}

function update(patch) {
  const current = store.read().practiceSession;
  if (!current) return null;
  const next = Object.assign({}, current, patch);
  store.save({ practiceSession: next });
  return next;
}

function resume() {
  const current = store.read().practiceSession;
  if (!current || current.finishedAt || !current.items[current.index]) return false;
  navigate(current);
  return true;
}

module.exports = { start, update, resume };

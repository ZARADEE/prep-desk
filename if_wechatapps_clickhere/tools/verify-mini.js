const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const data = {};
const navigation = [];
const ui = [];
let modalResult = { confirm: true, cancel: false };
let currentRoute = 'pages/home/index';
global.getCurrentPages = () => [{ route: currentRoute }];
global.wx = {
  getStorageSync(key) { return data[key]; },
  setStorageSync(key, value) { data[key] = value; },
  showToast() {},
  navigateTo(value) { navigation.push({ type: 'to', url: value.url }); },
  redirectTo(value) { navigation.push({ type: 'redirect', url: value.url }); },
  navigateBack() { navigation.push({ type: 'back' }); },
  switchTab(value) { navigation.push({ type: 'tab', url: value.url }); },
  hideTabBar() { ui.push('hide-tabs'); },
  showTabBar() { ui.push('show-tabs'); },
  setKeepScreenOn(value) { ui.push(value.keepScreenOn ? 'screen-on' : 'screen-off'); if (value.success) value.success(); },
  setNavigationBarTitle() {},
  vibrateShort() {},
  showModal(value) { if (value.success) value.success(modalResult); if (value.complete) value.complete(); }
};
global.Page = page => { global.lastPage = page; };

function instance(definition) {
  const page = Object.assign({}, definition);
  page.data = JSON.parse(JSON.stringify(definition.data));
  page.setData = patch => {
    Object.keys(patch).forEach(key => {
      const parts = key.split('.');
      let target = page.data;
      while (parts.length > 1) target = target[parts.shift()];
      target[parts[0]] = patch[key];
    });
  };
  return page;
}

function loadPage(name) {
  require('../pages/' + name + '/index.js');
  return instance(global.lastPage);
}

const catalog = require('../data/catalog.js');
const index = require('../data/question-index.js');
const store = require('../shared/store.js');
const sessions = require('../shared/session.js');
const practice = require('../shared/practice-controller.js');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));

manifest.tabBar.list.forEach(tab => {
  [tab.iconPath, tab.selectedIconPath].forEach(icon => {
    assert.ok(icon && fs.existsSync(path.join(root, icon)), icon + ' is missing');
    assert.ok(fs.statSync(path.join(root, icon)).size < 40 * 1024, icon + ' is too large');
  });
});
assert.strictEqual(index.length, 8137);
assert.strictEqual(index.filter(question => question.ungradable).length, 12);
assert.strictEqual(catalog.parts.length, manifest.subPackages.length);
assert.strictEqual(index.length, catalog.parts.reduce((sum, part) => sum + part.count, 0));
assert.ok(fs.statSync(path.join(root, 'data/question-index.js')).size < 2 * 1024 * 1024);
assert.ok(fs.statSync(path.join(root, 'data/question-index.js')).size +
  fs.statSync(path.join(root, 'data/catalog.js')).size + 100 * 1024 < 2 * 1024 * 1024);
catalog.parts.forEach(part => {
  assert.ok(part.bytes < 2 * 1024 * 1024, part.root + ' exceeds package limit');
  assert.strictEqual(require(path.join(root, part.root, 'questions.js')).length, part.count);
  const template = fs.readFileSync(path.join(root, 'tools/practice-template.wxml'), 'utf8');
  const packageTemplate = fs.readFileSync(path.join(root, part.root, 'index.wxml'), 'utf8');
  assert.ok(packageTemplate.includes('<question-content question-id="{{question.id}}"'), part.root + ' has no formula / original image renderer');
  assert.strictEqual(fs.readFileSync(path.join(root, part.root, 'index.wxss'), 'utf8'),
    fs.readFileSync(path.join(root, 'tools/practice-template.wxss'), 'utf8'));
});

const home = loadPage('home');
home.onLoad();
assert.strictEqual(home.data.banks.length, catalog.banks.length);
assert.ok(home.data.available > 0);
home.selectBank({ currentTarget: { dataset: { id: 'bank-math-one' } } });
home.selectMode({ currentTarget: { dataset: { mode: 'subjective' } } });
const fillIndex = home.data.subtypeNames.indexOf('填空题');
assert.ok(fillIndex > 0);
home.pickSubtype({ detail: { value: fillIndex } });
home.start();
assert.ok(store.read().practiceSession.items.every(item =>
  index.find(question => question.id === item.id).type === 'fill'));
home.onShow();
assert.ok(home.data.resumable);
home.resume();
assert.strictEqual(navigation.at(-1).type, 'to');
home.selectBank({ currentTarget: { dataset: { id: 'bank-computer-408' } } });
home.selectMode({ currentTarget: { dataset: { mode: 'choice' } } });
home.pickMajor({ detail: { value: 1 } });
home.pickSub({ detail: { value: 1 } });
home.editCount({ detail: { value: '15' } });
assert.ok(home.data.available > 0);
home.start();
let active = store.read().practiceSession;
assert.strictEqual(active.items.length, Math.min(15, home.data.available));
assert.ok(navigation.at(-1).url.startsWith('/' + active.items[0].root));
active.items.forEach(item => {
  const question = index.find(entry => entry.id === item.id);
  assert.strictEqual(question.bank, home.data.bankId);
  assert.strictEqual(question.type, 'choice');
  assert.ok(!question.ungradable);
  assert.strictEqual(question.tags[0], home.data.major);
  assert.strictEqual(question.tags[1], home.data.sub);
});

const first = active.items[0];
const questionPage = instance(practice.create(require(path.join(root, first.root, 'questions.js')), first.root));
questionPage.onLoad({ session: active.id });
assert.strictEqual(questionPage.data.question.id, first.id);
questionPage.toggleSheet();
assert.ok(questionPage.data.sheetOpen && questionPage.data.sheet[0].current);
questionPage.openQuestion({ currentTarget: { dataset: { index: 0 } } });
assert.ok(!questionPage.data.sheetOpen);
const raw = require(path.join(root, first.root, 'questions.js')).find(item => item.id === first.id);
practice.answerKeys(raw.answer).forEach(key => questionPage.choose({ currentTarget: { dataset: { key } } }));
questionPage.submit();
assert.strictEqual(questionPage.data.result.correct, true);
assert.strictEqual(store.getHistory().length, 1);

const other = index.find(item => item.root !== first.root && item.type === 'choice');
sessions.start([first, other], '跨包练习', 'home');
active = store.read().practiceSession;
const crossFirst = instance(practice.create(require(path.join(root, first.root, 'questions.js')), first.root));
crossFirst.onLoad({ session: active.id });
crossFirst.next();
assert.strictEqual(navigation.at(-1).type, 'redirect');
assert.ok(navigation.at(-1).url.startsWith('/' + other.root));
const crossSecond = instance(practice.create(require(path.join(root, other.root, 'questions.js')), other.root));
crossSecond.onLoad({ session: active.id });
assert.strictEqual(crossSecond.data.question.id, other.id);
crossSecond.previous();
assert.ok(navigation.at(-1).url.startsWith('/' + first.root));

const subjective = index.find(item => item.type !== 'choice');
sessions.start([subjective], '主观题', 'home');
active = store.read().practiceSession;
const subjectivePage = instance(practice.create(require(path.join(root, subjective.root, 'questions.js')), subjective.root));
subjectivePage.onLoad({ session: active.id });
subjectivePage.inputDraft({ detail: { value: '作答草稿' } });
assert.strictEqual(subjectivePage.currentDraft, '作答草稿');
subjectivePage.onHide();
assert.strictEqual(store.read().practiceSession.drafts[subjective.id + ':text'], '作答草稿');
subjectivePage.reveal();
assert.ok(subjectivePage.data.result.subjective);
subjectivePage.grade({ currentTarget: { dataset: { correct: 'false' } } });
assert.ok(store.getWrong()[subjective.id]);
subjectivePage.next();
assert.strictEqual(subjectivePage.data.answeredCount, 1);
home.onShow();
assert.ok(!home.data.resumable);

const wrong = loadPage('wrong');
wrong.onShow();
assert.ok(wrong.data.groups.some(group => group.subject === store.getWrong()[subjective.id].subject));
wrong.openGroup({ currentTarget: { dataset: { subject: store.getWrong()[subjective.id].subject } } });
assert.ok(store.read().practiceSession.items.some(item => item.id === subjective.id));

const compose = loadPage('compose');
compose.onLoad();
assert.strictEqual(compose.data.templates.length, catalog.templates.length);
catalog.templates.forEach((template, selected) => {
  compose.setData({ selected });
  compose.build();
  assert.strictEqual(compose.data.paper.total,
    template.sections.reduce((sum, section) => sum + section.count, 0), template.name);
  assert.ok(!compose.data.message.includes('不足'), template.name + ': ' + compose.data.message);
});
const paper = store.read().currentPaper;
compose.startPaper();
assert.strictEqual(store.read().practiceSession.items.length, paper.questions.length);
assert.ok(navigation.at(-1).url.startsWith('/' + paper.questions[0].root));

const homeMarkup = fs.readFileSync(path.join(root, 'pages/home/index.wxml'), 'utf8');
assert.ok(!homeMarkup.includes('今天，也能做几题'));
assert.ok(!homeMarkup.includes('题库 {{index + 1}}'));
const practiceMarkup = fs.readFileSync(path.join(root, 'tools/practice-template.wxml'), 'utf8');
assert.ok(practiceMarkup.includes('bindinput="inputDraft"'));
assert.ok(practiceMarkup.includes('hover-class="tap-pressed"'));
assert.ok(fs.readFileSync(path.join(root, 'tools/practice-template.wxss'), 'utf8').includes('height:88rpx'));

// Storage failure must not interrupt navigation or discard this run's answers.
const originalStorage = { get: wx.getStorageSync, set: wx.setStorageSync, toast: wx.showToast };
const realNow = Date.now;
let clock = realNow();
let notices = 0;
let attempts = 0;
try {
  Date.now = () => clock;
  wx.getStorageSync = () => { throw new Error('storage unavailable'); };
  wx.setStorageSync = () => { attempts++; throw new Error('storage unavailable'); };
  wx.showToast = () => { notices++; };
  home.onLoad();
  home.selectMode({ currentTarget: { dataset: { mode: 'choice' } } });
  home.start();
  const temporarySession = store.read().practiceSession;
  const temporaryQuestion = temporarySession.items[0];
  const temporaryPage = instance(practice.create(require(path.join(root, temporaryQuestion.root, 'questions.js')), temporaryQuestion.root));
  temporaryPage.onLoad({ session: temporarySession.id });
  const temporaryRaw = require(path.join(root, temporaryQuestion.root, 'questions.js')).find(item => item.id === temporaryQuestion.id);
  practice.answerKeys(temporaryRaw.answer).forEach(key => temporaryPage.choose({ currentTarget: { dataset: { key } } }));
  temporaryPage.submit();
  assert.strictEqual(temporaryPage.data.result.correct, true);
  home.onShow();
  home.resume();
  assert.ok(navigation.at(-1).url.includes(temporarySession.id));
  assert.strictEqual(notices, 1);
  assert.strictEqual(attempts, 1);
  wx.getStorageSync = originalStorage.get;
  wx.setStorageSync = originalStorage.set;
  clock += 10001;
  store.save({});
  delete require.cache[require.resolve('../shared/store.js')];
  const restoredStore = require('../shared/store.js');
  assert.strictEqual(restoredStore.read().practiceSession.id, temporarySession.id);
  assert.ok(restoredStore.read().practiceSession.answers[temporaryQuestion.id]);
} finally {
  Date.now = realNow;
  wx.getStorageSync = originalStorage.get;
  wx.setStorageSync = originalStorage.set;
  wx.showToast = originalStorage.toast;
}
console.log('Mini Program flow OK:', index.length, 'questions,', catalog.parts.length,
  'packages, home filters, cross-package practice, draft persistence, touch targets, subjective grading, wrong book, paper, and storage recovery');

const focus = require('../shared/focus.js');
const timer = loadPage('timer');
const originalNow = Date.now;
let now = 1800000000000;
try {
  Date.now = () => now;
  currentRoute = 'pages/timer/index';
  timer.onLoad();
  timer.editMinutes({ detail: { value: '1' } });
  timer.toggle();
  assert.strictEqual(timer.data.focusLocked, true);
  assert.ok(ui.includes('hide-tabs') && ui.includes('screen-on'));
  timer.toggle();
  timer.reset();
  timer.changeMode({ currentTarget: { dataset: { mode: 'short' } } });
  assert.strictEqual(timer.data.running, true);
  assert.strictEqual(timer.data.mode, 'focus');
  modalResult = { confirm: false, cancel: true };
  timer.endFocus();
  assert.strictEqual(timer.data.focusLocked, true);
  modalResult = { confirm: true, cancel: false };
  now += 5000;
  timer.endFocus();
  assert.strictEqual(timer.data.focusLocked, false);
  assert.strictEqual(timer.data.lastSession.status, 'cancelled');
  assert.strictEqual(timer.data.lastSession.elapsedSeconds, 5);
  assert.strictEqual(timer.data.completed, 0);
  assert.deepStrictEqual(ui.slice(-2), ['show-tabs', 'screen-off']);

  timer.toggle();
  now += 10000;
  focus.leave();
  focus.leave();
  timer.onHide();
  assert.strictEqual(store.read().timer.interruptions, 1);
  assert.strictEqual(store.read().timer.backgroundAt, now);
  assert.strictEqual(store.read().timer.running, false);
  assert.strictEqual(store.read().timer.remaining, 50);
  now += 12000;
  focus.returnToApp();
  timer.onShow();
  assert.strictEqual(timer.data.remaining, 50);
  assert.strictEqual(timer.data.running, false);
  assert.strictEqual(timer.data.focusLocked, true);
  assert.strictEqual(timer.data.interruptions, 1);
  assert.strictEqual(timer.data.awaySeconds, 12);
  currentRoute = 'pages/home/index';
  assert.strictEqual(focus.restorePage(), true);
  assert.strictEqual(navigation.at(-1).url, '/pages/timer/index');
  currentRoute = 'pages/timer/index';
  assert.strictEqual(focus.restorePage(), false);

  timer.resumeFocus();
  now += 5000;
  focus.leave();
  timer.onHide();
  assert.strictEqual(store.read().timer.running, false);
  assert.strictEqual(store.read().timer.remaining, 45);
  now += 12000;
  focus.returnToApp();
  timer.onShow();
  assert.strictEqual(timer.data.completed, 0);
  assert.strictEqual(timer.data.remaining, 45);
  assert.strictEqual(timer.data.focusLocked, true);
  assert.strictEqual(timer.data.running, false);
  timer.resumeFocus();
  assert.strictEqual(timer.data.running, true);
  now += 45000;
  timer.tick();
  assert.strictEqual(timer.data.completed, 1);
  assert.strictEqual(timer.data.focusLocked, false);
  assert.strictEqual(timer.data.lastSession.status, 'completed');
  assert.strictEqual(timer.data.lastSession.elapsedSeconds, 60);
  assert.strictEqual(timer.data.lastSession.interruptions, 2);
  assert.strictEqual(timer.data.lastSession.awaySeconds, 24);
  timer.tick();
  assert.strictEqual(timer.data.completed, 1);
  assert.strictEqual(focus.restorePage(), false);

  timer.toggle();
  assert.strictEqual(timer.data.remaining, 60);
  assert.strictEqual(timer.data.focusLocked, true);
  timer.endFocus();
  timer.editMinutes({ detail: { value: '1440.9' } });
  assert.strictEqual(timer.data.minutes, 1440);
  assert.strictEqual(timer.data.display, '1440:00');
  timer.changeMode({ currentTarget: { dataset: { mode: 'short' } } });
  timer.toggle();
  assert.strictEqual(timer.data.focusLocked, false);
  now += 5000;
  timer.toggle();
  assert.strictEqual(timer.data.running, false);
  assert.strictEqual(timer.data.remaining, 295);
} finally {
  timer.onUnload();
  Date.now = originalNow;
}
console.log('Focus lock OK: locked routes, wake lock, cancellation, background pause and resume, departure accounting, expiry, restart and rest pause');

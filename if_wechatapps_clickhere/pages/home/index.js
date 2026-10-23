const catalog = require('../../data/catalog.js');
const index = require('../../data/question-index.js');
const store = require('../../shared/store.js');
const practice = require('../../shared/practice-controller.js');
const session = require('../../shared/session.js');
const focus = require('../../shared/focus.js');

const modes = [{ key: 'choice', name: '选择题' }, { key: 'subjective', name: '主观题' }];
const subjectiveTypes = [
  { key: 'solution', name: '解答题' },
  { key: 'fill', name: '填空题' },
  { key: 'short_answer', name: '简答题' }
];
const banks = catalog.banks.map(bank => Object.assign({}, bank, {
  count: index.filter(question => question.bank === bank.id).length
}));

function matches(question, bankId, mode, major, sub, subtype) {
  return question.bank === bankId &&
    (mode === 'choice' ? question.type === 'choice' && !question.ungradable : question.type !== 'choice') &&
    (!major || question.tags[0] === major) && (!sub || question.tags[1] === sub) &&
    (!subtype || question.type === subtype);
}

function scopes(pool, position) {
  const counts = {};
  pool.forEach(question => {
    const value = question.tags[position];
    if (value) counts[value] = (counts[value] || 0) + 1;
  });
  return Object.keys(counts).sort((a, b) => a.localeCompare(b, 'zh-CN'))
    .map(name => ({ name, count: counts[name] }));
}

Page({
  data: {
    banks, modes, bankId: banks[0] ? banks[0].id : '', mode: 'choice',
    major: '', sub: '', subtype: '', majors: [], subs: [],
    majorNames: ['全部'], subNames: ['全部'], subtypeNames: ['全部'],
    majorIndex: 0, subIndex: 0, subtypeIndex: 0, available: 0,
    count: 10, actualCount: 0, wrongCount: 0, todos: [], newTodo: '',
    resumable: false, resumeTitle: '', resumeProgress: ''
  },
  onLoad() {
    const saved = store.read().practiceFilters || {};
    this.setData({
      bankId: banks.some(bank => bank.id === saved.bankId) ? saved.bankId : this.data.bankId,
      mode: saved.mode === 'subjective' ? 'subjective' : 'choice',
      major: saved.major || '', sub: saved.sub || '', subtype: saved.subtype || '',
      count: saved.count || 10
    });
    this.refreshFilters();
  },
  onShow() {
    if (focus.restorePage()) return;
    const state = store.read();
    const active = state.practiceSession;
    this.setData({ wrongCount: Object.keys(state.wrong || {}).length,
      todos: (state.todos || []).map(item => Object.assign({}, item)),
      resumable: !!(active && !active.finishedAt && active.items[active.index]),
      resumeTitle: active ? active.title : '',
      resumeProgress: active ? (active.index + 1) + ' / ' + active.items.length : '' });
  },
  refreshFilters() {
    const { bankId, mode } = this.data;
    const bankPool = index.filter(question => matches(question, bankId, mode, '', '', ''));
    const availableTypes = subjectiveTypes.filter(type => bankPool.some(question => question.type === type.key));
    const subtype = availableTypes.some(type => type.key === this.data.subtype) ? this.data.subtype : '';
    const pool = bankPool.filter(question => !subtype || question.type === subtype);
    const majors = scopes(pool, 0);
    const major = majors.some(item => item.name === this.data.major) ? this.data.major : '';
    const subs = scopes(pool.filter(question => !major || question.tags[0] === major), 1);
    const sub = subs.some(item => item.name === this.data.sub) ? this.data.sub : '';
    const available = pool.filter(question => matches(question, bankId, mode, major, sub, subtype)).length;
    this.setData({ majors, subs, major, sub, subtype, available,
      majorNames: ['全部'].concat(majors.map(item => item.name)),
      subNames: ['全部'].concat(subs.map(item => item.name)),
      subtypeNames: ['全部'].concat(availableTypes.map(type => type.name)),
      majorIndex: major ? majors.findIndex(item => item.name === major) + 1 : 0,
      subIndex: sub ? subs.findIndex(item => item.name === sub) + 1 : 0,
      subtypeIndex: subtype ? availableTypes.findIndex(type => type.key === subtype) + 1 : 0,
      actualCount: Math.min(available, Math.max(1, Math.min(100, Number(this.data.count) || 10))) });
    store.save({ practiceFilters: { bankId, mode, major, sub, subtype, count: this.data.count } });
  },
  selectBank(event) {
    this.setData({ bankId: event.currentTarget.dataset.id, major: '', sub: '', subtype: '' });
    this.refreshFilters();
  },
  selectMode(event) {
    this.setData({ mode: event.currentTarget.dataset.mode, major: '', sub: '', subtype: '' });
    this.refreshFilters();
  },
  pickMajor(event) {
    const value = Number(event.detail.value);
    this.setData({ major: value ? this.data.majors[value - 1].name : '', sub: '' });
    this.refreshFilters();
  },
  pickSub(event) {
    const value = Number(event.detail.value);
    this.setData({ sub: value ? this.data.subs[value - 1].name : '' });
    this.refreshFilters();
  },
  pickSubtype(event) {
    const value = Number(event.detail.value);
    const types = subjectiveTypes.filter(type => this.data.subtypeNames.includes(type.name));
    this.setData({ subtype: value ? types[value - 1].key : '', major: '', sub: '' });
    this.refreshFilters();
  },
  editCount(event) {
    const count = Math.max(1, Math.min(100, Number(event.detail.value) || 10));
    this.setData({ count });
    this.refreshFilters();
  },
  start() {
    const { bankId, mode, major, sub, subtype, actualCount } = this.data;
    const pool = index.filter(question => matches(question, bankId, mode, major, sub, subtype));
    const bank = banks.find(item => item.id === bankId);
    const chosen = practice.shuffle(pool).slice(0, actualCount);
    if (!session.start(chosen, bank ? bank.subject : '刷题', 'home')) {
      wx.showToast({ title: '当前范围没有题目', icon: 'none' });
    }
  },
  resume() { session.resume(); },
  inputTodo(event) { this.setData({ newTodo: event.detail.value }); },
  addTodo() {
    const value = this.data.newTodo.trim();
    if (!value) return;
    const todos = this.data.todos.concat({ id: Date.now(), text: value, done: false });
    store.save({ todos });
    this.setData({ todos, newTodo: '' });
  },
  toggleTodo(event) {
    const id = Number(event.currentTarget.dataset.id);
    const todos = this.data.todos.map(todo => todo.id === id ?
      Object.assign({}, todo, { done: !todo.done }) : todo);
    store.save({ todos }); this.setData({ todos });
  }
});

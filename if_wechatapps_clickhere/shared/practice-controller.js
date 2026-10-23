const store = require('./store.js');
const sessions = require('./session.js');

function answerKeys(answer) {
  const text = String(answer || '').toUpperCase().replace(/[ＡＢＣＤ]/g, c =>
    ({ 'Ａ': 'A', 'Ｂ': 'B', 'Ｃ': 'C', 'Ｄ': 'D' })[c]);
  const labeled = text.match(/(?:正确答案|参考答案|答案)\s*[:：]?\s*([A-D]{1,4})/);
  const compact = text.replace(/[^A-D]/g, '');
  const found = labeled ? labeled[1] : compact.length > 0 && compact.length <= 4 ? compact : '';
  return found.split('').filter((key, index, all) => all.indexOf(key) === index).sort();
}

function plain(value) {
  return String(value || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[图片请在桌面版查看]')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|^#+\s?/gm, '')
    .replace(/\\\(|\\\)/g, '')
    .trim();
}

function shuffle(items) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i]; result[i] = result[j]; result[j] = temp;
  }
  return result;
}

function create(questions, root) {
  const byId = {};
  questions.forEach(question => { byId[question.id] = question; });
  return {
    data: {
      title: '', origin: 'home', index: 0, total: 0, question: null,
      selected: [], draft: '', result: null, done: false,
      answeredCount: 0, correctCount: 0, wrongCount: 0,
      sheet: [], sheetOpen: false, progressWidth: '0%', error: '', retryCount: 0
    },

    onLoad(options) {
      const session = store.read().practiceSession;
      if (!session || session.id !== options.session) {
        this.setData({ error: '练习已失效，请返回重新开始。' });
        return;
      }
      this.sessionId = session.id;
      if (session.finishedAt) { this.showSummary(session); return; }
      this.showQuestion();
    },

    onHide() { this.persistDraft(); },
    onUnload() { this.persistDraft(); },

    showQuestion() {
      const session = store.read().practiceSession;
      if (!session || session.id !== this.sessionId) return;
      const item = session.items[session.index];
      if (!item) return;
      if (item.root !== root) {
        wx.redirectTo({ url: '/' + item.root + '/index?session=' + session.id });
        return;
      }
      const raw = byId[item.id];
      if (!raw) {
        this.setData({ error: '题目读取失败，请返回重新开始。', question: null });
        return;
      }
      const attempt = (session.answers || {})[raw.id];
      const selected = attempt ? attempt.selected || [] : (session.drafts || {})[raw.id] || [];
      const result = attempt ? Object.assign({}, attempt, {
        expected: answerKeys(raw.answer).join('、'),
        answer: plain(raw.answer), analysis: plain(raw.analysis)
      }) : null;
      const optionList = (raw.options || []).map(option => ({
        key: option.key, text: plain(option.text), selected: selected.includes(option.key)
      }));
      const sheet = session.items.map((entry, position) => {
        const answer = (session.answers || {})[entry.id];
        const answered = !!(answer && (!answer.subjective || answer.graded));
        return { number: position + 1, index: position, current: position === session.index,
          answered, pending: !!answer && !answered, wrong: answered && !answer.correct };
      });
      this.setData({
        title: session.title, origin: session.origin, index: session.index,
        total: session.items.length, selected, result, done: false, sheet, error: '',
        answeredCount: sheet.filter(entry => entry.answered).length,
        progressWidth: Math.round((session.index + 1) * 100 / session.items.length) + '%',
        draft: (session.drafts || {})[raw.id + ':text'] || '',
        question: { id: raw.id, type: raw.type, stem: plain(raw.stem),
          chapter: raw.chapter || '', tags: (raw.tags || []).join(' / '),
          options: optionList, multiple: answerKeys(raw.answer).length > 1 }
      });
      this.currentDraft = (session.drafts || {})[raw.id + ':text'] || '';
    },

    choose(event) {
      if (this.data.result || !this.data.question) return;
      const key = event.currentTarget.dataset.key;
      const selected = this.data.question.multiple
        ? (this.data.selected.includes(key) ? this.data.selected.filter(item => item !== key) : this.data.selected.concat(key))
        : [key];
      const current = store.read().practiceSession;
      const drafts = Object.assign({}, current.drafts, { [this.data.question.id]: selected });
      sessions.update({ drafts });
      this.setData({ selected, 'question.options': this.data.question.options.map(option =>
        Object.assign({}, option, { selected: selected.includes(option.key) })) });
    },

    persistDraft(value, questionId, sessionId) {
      clearTimeout(this.draftSaveTimer);
      const current = store.read().practiceSession;
      const id = questionId || (this.data.question && this.data.question.id);
      if (!current || current.id !== this.sessionId || !id || !byId[id] || byId[id].type === 'choice' ||
          (sessionId && current.id !== sessionId)) return;
      const draft = value === undefined
        ? this.currentDraft === undefined ? this.data.draft : this.currentDraft
        : value;
      this.setData({ draft });
      sessions.update({ drafts: Object.assign({}, current.drafts,
        { [id + ':text']: draft }) });
    },

    inputDraft(event) {
      const draft = event.detail.value;
      const current = store.read().practiceSession;
      const questionId = this.data.question && this.data.question.id;
      if (!current || !questionId) return;
      this.currentDraft = draft;
      clearTimeout(this.draftSaveTimer);
      this.draftSaveTimer = setTimeout(() => {
        this.persistDraft(draft, questionId, current.id);
      }, 250);
    },

    editDraft(event) {
      const draft = event.detail.value;
      this.currentDraft = draft;
      this.persistDraft(draft);
    },

    saveResult(result, record) {
      this.persistDraft();
      const current = store.read().practiceSession;
      const answers = Object.assign({}, current.answers, { [this.data.question.id]: result });
      sessions.update({ answers });
      if (record) {
        const raw = byId[this.data.question.id];
        store.setAnswer(Object.assign({}, raw, { root }), result.selected || [], result.correct);
      }
      this.showQuestion();
    },

    submit() {
      if (this.data.result) return;
      if (!this.data.selected.length) {
        wx.showToast({ title: '请先选择答案', icon: 'none' });
        return;
      }
      const raw = byId[this.data.question.id];
      const expected = answerKeys(raw.answer);
      const selected = this.data.selected.slice().sort();
      this.saveResult({ selected, correct: selected.join('') === expected.join('') }, true);
    },

    reveal() {
      if (this.data.result) return;
      this.saveResult({ selected: [], subjective: true, graded: false }, false);
    },

    grade(event) {
      if (!this.data.result || !this.data.result.subjective || this.data.result.graded) return;
      const correct = event.currentTarget.dataset.correct === 'true';
      this.saveResult({ selected: [], subjective: true, graded: true, correct }, true);
    },

    finish() {
      this.persistDraft();
      const session = store.read().practiceSession;
      if (!session || session.id !== this.sessionId) return;
      const missing = session.items.filter(item => {
        const answer = (session.answers || {})[item.id];
        return !answer || (answer.subjective && !answer.graded);
      });
      if (missing.length) {
        wx.showModal({ title: '结束练习？',
          content: '还有 ' + missing.length + ' 题未作答或未自评，结束后仍可重练这些题目。',
          confirmText: '仍然结束', cancelText: '继续作答',
          success: result => {
            if (result.confirm) this.complete();
            else if (result.cancel) this.jump(session.items.findIndex(item => item.id === missing[0].id));
          } });
        return;
      }
      this.complete();
    },

    complete() {
      const session = store.read().practiceSession;
      if (!session || session.id !== this.sessionId) return;
      const finished = sessions.update({ finishedAt: Date.now() });
      this.showSummary(finished);
    },

    showSummary(session) {
      const answers = Object.values(session.answers || {}).filter(item => !item.subjective || item.graded);
      this.setData({ done: true, question: null, answeredCount: answers.length,
        title: session.title, origin: session.origin, total: session.items.length,
        retryCount: session.items.length - answers.filter(item => item.correct).length,
        correctCount: answers.filter(item => item.correct).length,
        wrongCount: answers.filter(item => !item.correct).length });
    },

    retry() {
      const session = store.read().practiceSession;
      if (!session || session.id !== this.sessionId) return;
      const items = session.items.filter(item => {
        const answer = (session.answers || {})[item.id];
        return !answer || (answer.subjective && !answer.graded) || !answer.correct;
      });
      sessions.start(items, session.title + ' · 重练', session.origin, true);
    },

    toggleSheet() { this.setData({ sheetOpen: !this.data.sheetOpen }); },
    openQuestion(event) {
      this.setData({ sheetOpen: false });
      this.jump(Number(event.currentTarget.dataset.index));
    },

    jump(index) {
      const session = store.read().practiceSession;
      if (index < 0 || index >= session.items.length) return;
      this.persistDraft();
      sessions.update({ index });
      const next = session.items[index];
      if (next.root !== root) {
        wx.redirectTo({ url: '/' + next.root + '/index?session=' + session.id });
      } else {
        this.showQuestion();
      }
    },
    next() {
      const session = store.read().practiceSession;
      if (session.index + 1 >= session.items.length) this.finish();
      else this.jump(session.index + 1);
    },
    previous() { this.jump(store.read().practiceSession.index - 1); },
    backHome() {
      const origin = ['home', 'compose', 'wrong'].includes(this.data.origin) ? this.data.origin : 'home';
      wx.switchTab({ url: '/pages/' + origin + '/index' });
    }
  };
}

module.exports = { create, answerKeys, plain, shuffle };

const store = require('../../shared/store.js');
const sessions = require('../../shared/session.js');
const index = require('../../data/question-index.js');
const focus = require('../../shared/focus.js');

Page({
  data: { groups: [], total: 0 },
  onShow() {
    if (focus.restorePage()) return;
    const wrong = store.getWrong();
    const groups = {};
    index.forEach(question => {
      const entry = wrong[question.id];
      if (!entry || question.ungradable) return;
      const subject = entry.subject;
      if (!groups[subject]) groups[subject] = { subject, count: 0 };
      groups[subject].count += 1;
    });
    this.setData({ groups: Object.values(groups), total: Object.keys(wrong).length });
  },
  openGroup(event) {
    const subject = event.currentTarget.dataset.subject;
    const wrong = store.getWrong();
    const items = index.filter(question => !question.ungradable && wrong[question.id] && wrong[question.id].subject === subject);
    sessions.start(items, subject + ' · 错题', 'wrong');
  }
});

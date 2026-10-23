const catalog = require('../../data/catalog.js');
const index = require('../../data/question-index.js');
const store = require('../../shared/store.js');
const practice = require('../../shared/practice-controller.js');
const sessions = require('../../shared/session.js');
const focus = require('../../shared/focus.js');
const sync = require('../../shared/sync.js');

function choose(items, count) { return practice.shuffle(items).slice(0, count); }

function isMatch(question, section, template) {
  if (question.bank !== template.question_bank_id || question.type !== section.type) return false;
  if (question.ungradable) return false;
  const filters = section.filters || {};
  if (filters.chapter && question.chapter !== filters.chapter) return false;
  if (filters.tags && !filters.tags.every(tag => question.tags.includes(tag))) return false;
  if (filters.required_tags && !filters.required_tags.every(tag => question.tags.includes(tag))) return false;
  if (filters.answer_mode && filters.answer_mode !== question.mode) return false;
  return true;
}

Page({
  data: { templates: [], selected: 0, title: '', paper: null, message: '' },
  onLoad() {
    this.setData({ templates: catalog.templates.map(template => ({
      id: template.id, name: template.name, subject: template.subject,
      minutes: template.duration_minutes, score: template.total_score
    })) });
  },
  onShow() {
    if (focus.restorePage()) return;
    const paper = store.read().currentPaper;
    const selected = paper ? catalog.templates.findIndex(template => template.id === paper.templateId) : -1;
    if (selected >= 0) this.setData({ selected, paper: { title: paper.title, total: paper.questions.length } });
    this.refreshExams();
  },
  async refreshExams() { if (!sync.enabled()) return; try { const value = await sync.request('/mobile/exams'); this.setData({ exams: value.items, examMode: true }); } catch (error) { this.setData({ message: error.message }); } },
  openExam(event) { const id = event.currentTarget.dataset.id; wx.navigateTo({ url: '/pages/exam/index' + (id ? '?id=' + encodeURIComponent(id) : '') }); },
  editDuration(event) { this.setData({ examMinutes: Math.max(1, Math.min(1440, Number(event.detail.value) || 90)) }); },
  async startTimed() { if (!sync.enabled()) { this.setData({ message: '整卷限时考试需要连接电脑；可先进行离线普通练习。' }); return; } const template = catalog.templates[this.data.selected]; if (!template) return; this.setData({ building: true, message: '' }); try { const settings = template.distribution_rules?.settings || {}; const response = await sync.request('/papers/compose', 'POST', { template_id: template.id, title: this.data.title.trim() || template.name, seed: Date.now(), required_tags: settings.required_tags || [] }); if (!response.validation?.valid) throw new Error(response.validation?.errors?.join('；') || '题库题量不足，未开始考试。'); this.setData({ timedPaper: response, timedPaperTitle: response.title }); } catch (error) { this.setData({ message: error.message || '组卷失败' }); } finally { this.setData({ building: false }); } },
  confirmTimed(event) { const paper = this.data.timedPaper; if (!paper || !this.data.examMinutes) return; wx.showModal({ title: '开始限时模考？', content: paper.title + ' · ' + paper.questions.length + ' 题 · ' + this.data.examMinutes + ' 分钟。开始后倒计时不可暂停。', confirmText: '开始模考', success: async result => { if (!result.confirm) return; this.setData({ building: true }); try { const exam = await sync.request('/exams', 'POST', { paper_id: paper.id, duration_minutes: this.data.examMinutes }); wx.navigateTo({ url: '/pages/exam/index?id=' + encodeURIComponent(exam.id) }); } catch (error) { this.setData({ message: error.message }); } finally { this.setData({ building: false }); } } }); },
  pickTemplate(event) { this.setData({ selected: Number(event.detail.value), paper: null, message: '' }); },
  editTitle(event) { this.setData({ title: event.detail.value }); },
  build() {
    const template = catalog.templates[this.data.selected];
    if (!template) { wx.showToast({ title: '暂无模板', icon: 'none' }); return; }
    const used = {};
    const selected = [];
    const issues = [];
    (template.sections || []).forEach(section => {
      const matching = index.filter(q => !used[q.id] && isMatch(q, section, template));
      const count = Number(section.count) || 0;
      const items = choose(matching, count);
      if (items.length < count) issues.push((section.title || section.type) + ' 缺 ' + (count - items.length) + ' 题');
      items.forEach(item => { used[item.id] = true; selected.push(item); });
    });
    if (!selected.length) {
      this.setData({ message: '该模板未能匹配到题目，请换一个模板。', paper: null });
      return;
    }
    const title = this.data.title.trim() || template.name;
    const paper = { id: 'local-' + Date.now(), title, templateId: template.id,
      questions: selected, createdAt: Date.now() };
    store.save({ currentPaper: paper });
    this.setData({ paper: { title, total: selected.length },
      message: issues.length ? '题目不足：' + issues.join('；') : '' });
  },
  startPaper() {
    const paper = store.read().currentPaper;
    if (!paper) return;
    sessions.start(paper.questions, paper.title, 'compose');
  }
});

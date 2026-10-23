const store = require('../../shared/store.js');
const focus = require('../../shared/focus.js');
const MODES = [
  { key: 'focus', name: '专注', minutes: 25 },
  { key: 'short', name: '短休息', minutes: 5 },
  { key: 'long', name: '长休息', minutes: 15 }
];

function display(seconds) {
  const value = Math.max(0, Math.ceil(Number(seconds) || 0));
  return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
}

Page({
  data: { modes: MODES, mode: 'focus', modeName: '专注', minutes: 25, display: '25:00',
    running: false, completed: 0, remaining: 1500, focusLocked: false,
    interruptions: 0, awaySeconds: 0, lastSession: null, screenWarning: '' },
  onLoad() { this.restore(); },
  onShow() {
    clearInterval(this.interval);
    focus.returnToApp();
    this.restore();
    this.tick();
    this.syncLock();
    this.interval = setInterval(() => this.tick(), 1000);
  },
  onHide() { clearInterval(this.interval); this.releaseScreen(); },
  onUnload() { clearInterval(this.interval); this.releaseScreen(); },
  restore() {
    const timer = store.read().timer || {};
    const mode = MODES.find(item => item.key === timer.mode) || MODES[0];
    const minutes = Math.max(1, Math.min(1440, Math.floor(Number(timer.minutes) || mode.minutes)));
    this.setData({ mode: mode.key, modeName: mode.name, minutes,
      remaining: Number.isFinite(timer.remaining) && timer.remaining >= 0 ? Math.ceil(timer.remaining) : minutes * 60,
      completed: timer.completed || 0, running: !!timer.running, endAt: timer.endAt || 0,
      focusLocked: mode.key === 'focus' && !!timer.focusLocked,
      interruptions: timer.interruptions || 0, awaySeconds: timer.awaySeconds || 0,
      startedAt: timer.startedAt || 0, lastSession: timer.lastSession || null });
    this.setData({ display: display(this.data.remaining) });
  },
  persist() {
    const previous = store.read().timer || {};
    store.save({ timer: Object.assign({}, previous, {
      mode: this.data.mode, minutes: this.data.minutes, remaining: this.data.remaining,
      running: this.data.running, endAt: this.data.endAt || 0, completed: this.data.completed,
      focusLocked: this.data.focusLocked, interruptions: this.data.interruptions,
      awaySeconds: this.data.awaySeconds, startedAt: this.data.startedAt || 0,
      lastSession: this.data.lastSession, backgroundAt: 0
    }) });
  },
  syncLock() {
    if (this.data.focusLocked) {
      wx.hideTabBar({ animation: false });
      wx.setNavigationBarTitle({ title: '专注进行中' });
      wx.setKeepScreenOn({ keepScreenOn: true,
        success: () => this.setData({ screenWarning: '' }),
        fail: () => this.setData({ screenWarning: '未能保持亮屏，请检查手机的自动锁屏设置。' }) });
    } else {
      wx.showTabBar({ animation: false });
      wx.setNavigationBarTitle({ title: '专注计时' });
      this.releaseScreen();
    }
  },
  releaseScreen() { wx.setKeepScreenOn({ keepScreenOn: false }); },
  tick() {
    if (!this.data.running) {
      this.setData({ display: display(this.data.remaining) }); return;
    }
    const seconds = Math.max(0, Math.ceil((this.data.endAt - Date.now()) / 1000));
    if (seconds === 0) {
      const completed = this.data.completed + (this.data.mode === 'focus' ? 1 : 0);
      const patch = { running: false, focusLocked: false, remaining: 0, display: '00:00', completed, endAt: 0 };
      if (this.data.mode === 'focus') patch.lastSession = this.result('completed');
      this.setData(patch);
      this.persist();
      this.syncLock();
      wx.vibrateShort({ type: 'medium' });
      wx.showModal({ title: '计时结束', content: this.data.mode === 'focus' ? '本轮专注已完成，页面已解锁。' : '本轮休息已结束。', showCancel: false });
      return;
    }
    if (seconds !== this.data.remaining) this.setData({ remaining: seconds, display: display(seconds) });
  },
  result(status) {
    const elapsed = status === 'completed' ? this.data.minutes * 60 :
      Math.max(0, this.data.minutes * 60 - this.data.remaining);
    return { status, minutes: this.data.minutes, elapsedSeconds: elapsed,
      interruptions: this.data.interruptions, awaySeconds: this.data.awaySeconds, at: Date.now() };
  },
  changeMode(event) {
    if (this.data.focusLocked) return;
    const mode = MODES.find(item => item.key === event.currentTarget.dataset.mode);
    if (!mode || mode.key === this.data.mode) return;
    this.confirmReset(() => {
      this.setData({ mode: mode.key, modeName: mode.name, minutes: mode.minutes,
        remaining: mode.minutes * 60, display: display(mode.minutes * 60), running: false, endAt: 0 });
      this.persist();
    });
  },
  editMinutes(event) {
    if (this.data.running || this.data.focusLocked) return;
    const value = Math.max(1, Math.min(1440, Math.floor(Number(event.detail.value) || 1)));
    this.setData({ minutes: value, remaining: value * 60, display: display(value * 60) });
    this.persist();
  },
  toggle() {
    if (this.data.focusLocked) return;
    if (this.data.running) {
      this.tick();
      if (!this.data.running) return;
      this.setData({ running: false, endAt: 0 });
    } else {
      const remaining = this.data.remaining > 0 ? this.data.remaining : this.data.minutes * 60;
      this.setData({ running: true, remaining, display: display(remaining),
        endAt: Date.now() + remaining * 1000, focusLocked: this.data.mode === 'focus',
        startedAt: Date.now(), interruptions: 0, awaySeconds: 0, screenWarning: '' });
    }
    this.persist();
    this.syncLock();
  },
  resumeFocus() {
    if (!this.data.focusLocked || this.data.running) return;
    if (this.data.remaining <= 0) {
      const completed = this.data.completed + 1;
      this.setData({ running: false, focusLocked: false, remaining: 0, display: '00:00',
        completed, endAt: 0, lastSession: this.result('completed') });
      this.persist();
      this.syncLock();
      wx.showModal({ title: '专注完成', content: '本轮专注已完成，页面已解锁。', showCancel: false });
      return;
    }
    this.setData({ running: true, endAt: Date.now() + this.data.remaining * 1000, screenWarning: '' });
    this.persist();
    this.syncLock();
  },
  endFocus() {
    this.tick();
    if (!this.data.focusLocked || this.ending) return;
    this.ending = true;
    wx.showModal({ title: '提前结束专注？',
      content: '本轮将记为提前结束，不计入已完成轮数。', confirmText: '结束本轮', cancelText: '继续专注',
      success: response => {
        this.tick();
        if (!response.confirm || !this.data.focusLocked) return;
        this.setData({ lastSession: this.result('cancelled'), running: false, focusLocked: false,
          remaining: this.data.minutes * 60, display: display(this.data.minutes * 60), endAt: 0 });
        this.persist();
        this.syncLock();
      },
      complete: () => { this.ending = false; }
    });
  },
  reset() {
    if (this.data.focusLocked) return;
    this.confirmReset(() => {
      this.setData({ running: false, endAt: 0, remaining: this.data.minutes * 60,
        display: display(this.data.minutes * 60) });
      this.persist();
    });
  },
  confirmReset(action) {
    if (!this.data.running && this.data.remaining === this.data.minutes * 60) { action(); return; }
    wx.showModal({ title: '重新计时？', content: '本轮计时进度将被重置。',
      success: result => { if (result.confirm) action(); } });
  }
});

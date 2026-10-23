const assets = require('../../shared/assets.js');
const sync = require('../../shared/sync.js');
Component({
  properties: { questionId: String, kind: { type: String, value: 'question' }, text: String },
  data: { image: '', error: '', loading: false },
  observers: { 'questionId, kind': function () { this.load(); } },
  lifetimes: { detached() { this.generation = (this.generation || 0) + 1; } },
  methods: {
    async load() {
      const id = this.data.questionId, kind = this.data.kind;
      if (!id) return;
      const generation = this.generation = (this.generation || 0) + 1;
      const cached = assets.cached(id, kind);
      this.setData({ image: cached ? cached.path : '', error: '', loading: !cached });
      if (cached) { this.setData({ loading: false }); return; }
      if (!sync.enabled()) { this.setData({ loading: false, error: '连接电脑后可获取完整公式与原版图片，下载后可离线查看。' }); return; }
      try { const path = await assets.ensure(id, kind); if (this.generation === generation) this.setData({ image: path, loading: false }); }
      catch (error) { if (this.generation === generation) this.setData({ error: error.message || '图片读取失败，可重试', loading: false }); }
    },
    preview() { if (this.data.image) wx.previewImage({ urls: [this.data.image], current: this.data.image }); },
    failed() { this.setData({ image: '', error: '图片不可用，请重新下载' }); },
    connect() { wx.navigateTo({ url: '/pages/tools/index' }); },
    async retry() { try { await assets.ensure(this.data.questionId, this.data.kind, true); this.load(); } catch (error) { this.setData({ error: error.message || '请检查连接与可用存储空间' }); } }
  }
});

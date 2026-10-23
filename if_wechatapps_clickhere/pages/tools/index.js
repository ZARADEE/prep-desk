const sync = require('../../shared/sync.js');
const store = require('../../shared/store.js');
const index = require('../../data/question-index.js');
const assets = require('../../shared/assets.js');
Page({
  data: { link: '', token: '', connected: false, syncing: false, message: '', query: '', subject: '', year: '', kind: 'all', years: [], subjects: [], results: [], total: 0, page: 1, offline: false,
    notice: '题干和题号搜索来自此设备内置的 8,137 道题。图片与公式下载需要连接电脑，并可保存到本机离线查看。',
    reviewItemId: 0, copy: false },
  onLoad(options) { if (options && options.connect) this.setData({ link: decodeURIComponent(options.connect) });
    const ids = index.filter(item => !item.ungradable).slice(0, 1600);
    this.setData({ years: [...new Set(ids.map(item => { const match = item.id.match(/(?:19|20)d{2}/); return match ? match[0] : ''; }).filter(Boolean))].sort(), subjects: [...new Set(ids.map(item => item.bank))], connected: sync.enabled() }); },
  onShow() { this.setData({ connected: sync.enabled(), offline: !sync.enabled() }); },
  editLink(event) { this.setData({ link: event.detail.value }); },
  editToken(event) { this.setData({ token: event.detail.value }); },
  connect() { try { sync.configure(this.data.link, this.data.token); this.setData({ connected: true, message: '连接信息已安全保存在本机；令牌不会进入导出的学习备份。' }); store.syncNow(); } catch (error) { this.setData({ message: error.message || '连接失败' }); } },
  disconnect() { wx.removeStorageSync('paper-helper-mini-connection-v1'); this.setData({ connected: false, token: '', message: '已断开；离线题库仍可使用。' }); },
  syncNow() { this.setData({ syncing: true }); store.syncNow().then(() => this.setData({ syncing: false, message: store.status().label })); },
  clear() { this.setData({ query: '', subject: '', year: '', kind: 'all', results: [], total: 0, page: 1 }); },
  setQuery(event) { this.setData({ query: event.detail.value }); },
  setSubject(event) { this.setData({ subject: event.detail.value }); },
  setYear(event) { this.setData({ year: event.detail.value }); },
  setKind(event) { this.setData({ kind: event.currentTarget.dataset.kind }); },
  search() { const term = this.data.query.trim().toLowerCase(); let items = index.filter(item => { if (this.data.subject && item.bank !== this.data.subject) return false; if (this.data.kind === 'favorites' && !store.read().notes?.[item.id]?.favorite) return false; if (this.data.kind === 'notes' && !store.read().notes?.[item.id]?.note && !store.read().notes?.[item.id]?.cause) return false; if (this.data.kind === 'wrong' && !store.getWrong()[item.id]) return false; if (this.data.year && !item.id.includes(this.data.year)) return false; if (!term) return true; if (item.id.toLowerCase().includes(term)) return true; try { const q = require('../../' + item.root + '/questions.js').find(q => q.id === item.id); return (q?.stem || '').toLowerCase().includes(term); } catch (_) { return false; } }); this.setData({ results: items.slice(0, 100).map(item => ({ id: item.id, root: item.root, type: item.type, bank: item.bank, favorite: !!store.read().notes?.[item.id]?.favorite, note: store.read().notes?.[item.id]?.note || '', wrong: !!store.getWrong()[item.id] })), total: items.length }); },
  favorite(event) { const id = event.currentTarget.dataset.id; const notes = Object.assign({}, store.read().notes); notes[id] = Object.assign({ favorite: false, cause: '', note: '' }, notes[id], { favorite: !notes[id]?.favorite }); store.save({ notes }); this.search(); },
  editNote(event) { this.noteDraft = { id: event.currentTarget.dataset.id, value: event.detail.value }; },
  saveNote(event) { const { id, value } = this.noteDraft || {}; if (!id) return; const notes = Object.assign({}, store.read().notes); notes[id] = Object.assign({ favorite: false, cause: '', note: '' }, notes[id], { note: value.slice(0, 2000) }); store.save({ notes }); wx.showToast({ title: '笔记已存本机', icon: 'success' }); },
  openQuestion(event) { const id = event.currentTarget.dataset.id, item = index.find(value => value.id === id); if (!item) return; wx.navigateTo({ url: '/' + item.root + '/index?session=' + this.makeSession(item) }); },
  makeSession(item) { const session = { id: 'review-' + Date.now(), title: '收藏 / 搜索', origin: 'home', items: [{ id: item.id, root: item.root }], index: 0, answers: {}, drafts: {}, startedAt: Date.now() }; store.save({ practiceSession: session }); return session.id; },
  downloadQuestion(event) { const id = event.currentTarget.dataset.id; assets.ensure(id, 'question').then(() => wx.showToast({ title: '题面已缓存', icon: 'success' })).catch(error => this.setData({ message: error.message })); },
  async exportBackup() { try { const result = await sync.request('/mobile/backup'); const file = wx.env.USER_DATA_PATH + '/paper-helper-backup-' + Date.now() + '.json'; wx.getFileSystemManager().writeFileSync(file, JSON.stringify(result), 'utf8'); await wx.setClipboardData({ data: file }); this.setData({ message: '完整个人学习备份已生成：' + file + '（文件路径已复制）' }); } catch (error) { this.setData({ message: error.message || '备份导出失败' }); } },
  chooseBackup() { const api = wx.canIUse('chooseMessageFile') ? wx.chooseMessageFile : wx.chooseImage; api({ count: 1, success: response => { const path = response.tempFiles[0].path; try { const value = JSON.parse(wx.getFileSystemManager().readFileSync(path, 'utf8')); this.setData({ pendingBackup: value, backupCount: Object.values(value.tables || {}).reduce((sum, rows) => sum + (rows?.length || 0), 0), message: '备份版本 ' + value.schema + ' · ' + Object.keys(value.tables || {}).length + ' 类记录；当前数据未修改。' }); } catch (_) { this.setData({ message: '文件不是有效的学习备份，当前数据未修改。' }); } } }); },
  importBackup() { sync.request('/mobile/backup/import', 'POST', { backup: this.data.pendingBackup, apply: true }).then(result => this.setData({ message: '已合并 ' + result.counts.learning_notes + ' 条复盘记录；同编号的当前记录予以保留。' })).catch(error => this.setData({ message: error.message || '备份校验或合并失败，当前记录未修改。' })); },
  selectDocument() { wx.chooseMessageFile({ count: 1, type: 'file', extension: ['json'], success: value => { const file = value.tempFiles[0].path; const raw = wx.getFileSystemManager().readFileSync(file, 'utf8'); const data = JSON.parse(raw); const questions = data.questions || []; this.setData({ packPreview: { title: data.title || '随身题包', count: questions.length, bytes: data.text_bytes || raw.length, version: data.version } }); this.pack = data; } }); },
  importPack() { const pack = this.pack; if (!pack || pack.schema !== 1) return; try { const key = 'paper-helper-study-packs-v1', saved = wx.getStorageSync(key) || []; if (!saved.some(item => item.version === pack.version)) saved.push(pack); wx.setStorageSync(key, saved); this.setData({ message: '離線題包已安裝：' + pack.title }); } catch (_) { this.setData({ message: '题包写入失败：请先在管理中清理旧版题包。' }); } },
  clearAssets() { wx.showModal({ title: '删除题面缓存？', content: '会删除已下载图片，题库与作答记录保留。', success: result => { if (result.confirm) { assets.remove(Object.keys(assets.inventory()).map(key => key.split(':')[0])); this.setData({ message: '已删除图片缓存；题库和学习记录保留。' }); } } }); },
  onShareAppMessage() { return { title: '个人学习数据备份', path: '/pages/home/index' }; }
});

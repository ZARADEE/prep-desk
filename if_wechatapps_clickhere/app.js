const focus = require('./shared/focus.js');
const store = require('./shared/store.js');

App({
  onHide() { focus.leave(); },
  onShow() { focus.returnToApp(); store.syncNow(); }
});

const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
const SP = '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/';
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
const MOCK = `(() => {
  const store = JSON.parse(localStorage.getItem('__fs') || 'null') || {'players/u_ghost': {name: '', t: 1, days: {}}, 'players/u_idle': {name: 'Idle', t: 1, days: {}}, 'players/u_bro': {name: 'Logan', t: 1, days: {'${today}': {classic_smart: {a: 2, first: 'loss', firstLost: 6, fl: 2, w: 1}}}}};
  window.__fs = store; const save = () => localStorage.setItem('__fs', JSON.stringify(store)); const subs = [];
  const snap = p => ({id: p.split('/').pop(), exists: p in store, data: () => store[p], ref: {parent: {id: p.split('/').slice(-2)[0]}}});
  const doc = p => ({id: p.split('/').pop(), get: async () => snap(p), set: async (b, o) => { store[p] = o && o.merge ? {...(store[p] || {}), ...b} : b; save(); subs.forEach(f => f()); },
    update: async b => { store[p] = {...store[p], ...b}; save(); }, delete: async () => { delete store[p]; save(); }, onSnapshot: n => { n(snap(p)); return () => {}; }});
  const col = p => { const run = () => ({docs: Object.keys(store).filter(k => k.startsWith(p + '/') && k.split('/').length === p.split('/').length + 1).map(snap)});
    const q = {limit: () => q, orderBy: () => q, where: () => q, get: async () => run(), onSnapshot: n => { const f = () => n(run()); subs.push(f); setTimeout(f, 30); return () => {}; }}; return q; };
  const user = {uid: localStorage.getItem('__uid') || 'u_me', providerData: []};
  window.firebase = {initializeApp() {}, auth: Object.assign(() => ({currentUser: user, onAuthStateChanged: cb => setTimeout(() => cb(user), 50), signInAnonymously: async () => user}), {GoogleAuthProvider: function () {}}),
    firestore: () => ({doc, collection: col})};
})();`;
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 860}}); await ctx.addInitScript(MOCK);
  const p = await ctx.newPage(); await p.route(/fonts\.|gstatic/, r => r.abort()); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8766/'); await p.waitForSelector('#namein', {timeout: 15000});
  await p.waitForTimeout(800); console.log('my doc before naming:', await p.evaluate(() => JSON.stringify(window.__fs['players/u_me'] || null)));
  await p.screenshot({path: SP + 'web1.png'});
  await p.fill('#namein', 'Ben'); await p.click('#nameform button[type=submit]'); await p.waitForTimeout(500);
  console.log('sync:', await p.$eval('#sync', e => e.textContent));
  await p.click('#start'); await p.waitForTimeout(300);
  await p.waitForSelector('button[data-move]', {timeout: 20000}); await p.click('button[data-move="1"]'); await p.click('#use');
  await p.waitForSelector('#run', {timeout: 30000}); await p.click('#run'); await p.click('#run-yes'); await p.waitForTimeout(800);
  console.log('strip:', await p.$eval('#friends-strip', e => e.innerText.replace(/\n/g, ' | ')));
  await p.click('[data-tab="friends"]'); await p.waitForTimeout(400);
  console.log('acct:', await p.$eval('#acct', e => e.innerText.replace(/\n/g, ' | ')));
  console.log('my player doc:', await p.evaluate(() => JSON.stringify(window.__fs['players/u_me'])));
  console.log('my docs:', await p.evaluate(() => Object.keys(window.__fs).filter(k => k.startsWith('users/')).join(', ')));
  await p.screenshot({path: SP + 'web2.png', fullPage: true});
  console.log('errors', errs); await b.close(); })();

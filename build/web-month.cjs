const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
const SP = '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/';
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
const MOCK = `(() => {
  const store = JSON.parse(localStorage.getItem('__fs') || 'null') || window.__SEED || {'players/u_ghost': {name: '', t: 1, days: {}}, 'players/u_idle': {name: 'Idle', t: 1, days: {}}, 'players/u_bro': {name: 'Logan', t: 1, days: {'${today}': {classic_smart: {a: 2, first: 'loss', firstLost: 6, fl: 2, w: 1}}}}};
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

const mk = (date, n, result, lost, rp) => ({date, mode: 'classic', diff: 'smart', n, result, lost, redLeft: result === 'win' ? 0 : 3, turns: 10, lead: 'X', at: Date.parse(date + 'T12:00') + n, kos: {}, fainted: [], redKos: {}, ...(rp ? {rp} : {})});
const SEED = {'players/u_me': {name: 'Ben', t: 1, days: {}},
  'users/u_me/docs/att_2026-10-16': {list: [mk('2026-10-16', 1, 'loss', 6, '0|m1;m1'), mk('2026-10-16', 2, 'win', 2, '0|m2;m2')]},
  'users/u_me/docs/att_2026-10-17': {list: [mk('2026-10-17', 1, 'win', 1, '0|m3'), mk('2026-10-17', 2, 'win', 0, '0|m4')]},
  'users/u_me/docs/prefs': {mode: 'classic', diff: 'smart', fast: true, leads: {}, t: 1}};
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 860}});
  await ctx.addInitScript(`window.__SEED = ${JSON.stringify(SEED)};`); await ctx.addInitScript(MOCK);
  const p = await ctx.newPage(); await p.route(/fonts\.|gstatic/, r => r.abort()); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8766/'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('dailyred:v1:name', 'Ben'); }); await p.reload(); await p.waitForSelector('#start'); await p.waitForTimeout(1500);
  const docs = () => p.evaluate(() => Object.fromEntries(Object.entries(window.__fs).filter(([k]) => k.startsWith('users/')).map(([k, v]) => [k, v.list ? v.list.map(a => `${a.date}#${a.n}${a.rp ? '+rp' : ''}`).join(',') : 'other'])));
  console.log('after first load:', JSON.stringify(await docs()));
  await p.click('#tab-stats'); await p.waitForTimeout(200);
  console.log('stats:', await p.$eval('main', e => e.innerText.slice(0, 260).replace(/\n/g, ' | ')));
  // fresh device: no local copy, only cloud
  await p.evaluate(() => { const fs = localStorage.getItem('__fs'); localStorage.clear(); localStorage.setItem('__fs', fs); localStorage.setItem('dailyred:v1:name', 'Ben'); });
  await p.reload(); await p.waitForSelector('#start'); await p.waitForTimeout(1500);
  console.log('fresh device attempts:', await p.evaluate(() => JSON.parse(localStorage.getItem('dailyred:v1:attempts')).map(a => `${a.date}#${a.n}${a.rp ? '+rp' : ''}`).join(',')));
  console.log('my public replays:', await p.evaluate(() => JSON.stringify(window.__fs['players/u_me'].rp)));
  console.log('docs now:', JSON.stringify(await docs()));
  console.log('errors', errs); await b.close(); })();

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


const now = Date.now();
const SEED = {
  'players/u_me': {name: 'Brock', t: 1, days: {}},
  'users/u_me/docs/prefs': {mode: 'classicD', diff: 'simple', fast: true, leads: {}, t: now - 1000},
  [`users/u_me/docs/cur2_${today}_classicD_simple`]: {lead: [0, 1], choices: ['default', 'default'], t: now - 2000},
  ['users/u_me/docs/atm_' + today.slice(0, 7)]: {list: [{date: today, mode: 'classic', diff: 'smart', n: 1, result: 'loss', lost: 6, redLeft: 4, turns: 9, lead: 'X', at: now - 5000, kos: {}, fainted: [], redKos: {}}]},
};
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 1200, height: 900}});
  await ctx.addInitScript(`window.__SEED = ${JSON.stringify(SEED)};`); await ctx.addInitScript(MOCK);
  const p = await ctx.newPage(); await p.route(/fonts\.|gstatic/, r => r.abort()); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8766/');
  // this desktop: older prefs on classic smart singles, with a stale unfinished battle saved locally earlier
  await p.evaluate(({today, now}) => { localStorage.clear(); localStorage.setItem('dailyred:v1:name', 'Brock');
    localStorage.setItem('dailyred:v1:prefs', JSON.stringify({mode: 'classic', diff: 'smart', fast: true, leads: {}, t: now - 60000}));
    localStorage.setItem(`dailyred:v2:current:${today}:classic:smart`, JSON.stringify({lead: 0, choices: ['move 1', 'move 1'], t: now - 60000})); }, {today, now});
  await p.reload(); await p.waitForTimeout(2500);
  console.log('shows:', await p.$eval('.bstrip', e => e.innerText.replace(/\n/g, ' | ')).catch(() => 'no battle on screen'));
  console.log('stale local battle removed:', await p.evaluate(t => localStorage.getItem(`dailyred:v2:current:${t}:classic:smart`) === null, today));
  console.log('errors', errs); await b.close(); })();

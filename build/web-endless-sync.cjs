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
  await p.goto('http://localhost:8766/'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('dailyred:v1:name', 'Brock'); }); await p.reload(); await p.waitForSelector('#start'); await p.waitForTimeout(800);
  // phone: start a run, win battle 1, play two turns of battle 2
  await p.click('#tab-endless'); await p.click('#e-start'); await p.click('#e-battle'); await p.waitForSelector('button[data-move]', {timeout: 30000});
  await p.evaluate(() => window.__drDebug.winBattle()); await p.click('#e-next'); await p.click('#e-battle');
  const settle = async () => { for (let i = 0; i < 400 && !(await p.$('#open-party, #party, .result')); i++) { const mb = await p.$('#msgbox'); if (mb) await mb.click().catch(() => {}); await p.waitForTimeout(30); } };
  for (let k = 0; k < 2; k++) { await settle(); if (!(await p.$('#open-party'))) break; await p.click('button[data-move="1"]'); await p.click('#use'); for (let i = 0; i < 300 && !(await p.$('#open-party, #party, .result')); i++) { const mb = await p.$('#msgbox'); if (mb) await mb.click().catch(() => {}); await p.waitForTimeout(30); } }
  const phone = await p.$eval('.bstrip', e => e.innerText.replace(/\n/g, ' '));
  const phoneTeam = await p.$$eval('.team .mon h3', es => es.map(e => e.textContent.replace(/Lead.*/, '')).join(','));
  await p.waitForTimeout(800);
  console.log('cloud has run:', await p.evaluate(() => !!window.__fs['users/u_me/docs/endless_cur']));
  // desktop: same account, nothing saved locally
  await p.evaluate(() => { const fs = localStorage.getItem('__fs'); localStorage.clear(); localStorage.setItem('__fs', fs); localStorage.setItem('dailyred:v1:name', 'Brock'); });
  await p.reload(); await p.waitForSelector('#start'); await p.waitForTimeout(1500);
  await p.click('#tab-endless'); await p.waitForTimeout(500);
  const desk = await p.$eval('.bstrip', e => e.innerText.replace(/\n/g, ' ')).catch(() => 'no battle: ' + (async () => '')());
  const deskTeam = await p.$$eval('.team .mon h3', es => es.map(e => e.textContent.replace(/Lead.*/, '')).join(','));
  console.log('phone  :', phone, '\ndesktop:', desk, '\nsame team:', phoneTeam === deskTeam);
  console.log('errors', errs); await b.close(); })();

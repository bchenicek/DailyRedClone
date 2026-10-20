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


const SEED = {
  'players/u_bro': {name: 'Logan', t: 1, days: {[today]: {classic_smart: {a: 2, first: 'loss', firstLost: 6, fl: 2, w: 1, bl: 0}}, '2026-10-18': {classic_smart: {a: 1, first: 'win', firstLost: 0, fl: 1, w: 1, bl: 0}}}, rp: {[today]: {classic_smart: '0|m1'}, '2026-10-18': {classic_smart: '0|m1'}}},
  'players/u_pal': {name: 'Adam', t: 1, days: {[today]: {classic_smart: {a: 1, first: 'loss', firstLost: 6, fl: null, w: 0}}}, rp: {[today]: {classic_smart: '0|m2'}}},
};
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 860}});
  await ctx.addInitScript(`window.__SEED = ${JSON.stringify(SEED)};`); await ctx.addInitScript(MOCK);
  const p = await ctx.newPage(); await p.route(/fonts\.|gstatic/, r => r.abort()); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8766/'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('dailyred:v1:name', 'Brock'); }); await p.reload(); await p.waitForSelector('#start'); await p.waitForTimeout(800);
  // lose one attempt (Simple-less: just run out a battle with first moves)
  await p.click('#start'); await p.click('[data-speed="fast"]');
  for (let i = 0; i < 3000 && !(await p.$('.result')); i++) {
    const sh = await p.$('#p-shift:not([disabled])'); if (sh) { await sh.click({timeout: 1500}).catch(() => {}); continue; }
    const pk = await p.$('.party .pm:not(.fnt):not(.act):not(.psel)'); if (pk) { await pk.click({timeout: 1500}).catch(() => {}); continue; }
    const use = await p.$('#use'); if (use) { await use.click({timeout: 1500}).catch(() => {}); continue; }
    const mv = await p.$('button[data-move]:not([disabled])'); if (mv) { await mv.click({timeout: 1500}).catch(() => {}); continue; }
    const mb = await p.$('#msgbox'); if (mb) await mb.click().catch(() => {}); await p.waitForTimeout(20);
  }
  console.log('my result:', await p.$eval('.result .rs', e => e.textContent));
  await p.click('[data-tab="friends"]'); await p.waitForTimeout(400);
  await p.click(`[data-cal="${today}"]`); await p.waitForTimeout(200);
  console.log('today:', await p.$eval('#cal-detail', e => e.innerText.replace(/\n/g, ' | ')));
  await p.screenshot({path: '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/locked.png'});
  await p.click('.watch.locked'); await p.waitForTimeout(150);
  console.log('popover after tap:', await p.$eval('.lockpop', e => getComputedStyle(e).display + ' | ' + e.innerText.replace(/\n/g, ' ')));
  await p.$eval('.watch.locked', e => e.scrollIntoView({block: 'center'}));
  await p.screenshot({path: '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/lockpop.png'});
  await p.click('h2'); await p.waitForTimeout(100);
  console.log('closed after tapping elsewhere:', await p.$eval('.lockpop', e => getComputedStyle(e).display));
  await p.click('[data-cal="2026-10-18"]'); await p.waitForTimeout(200);
  console.log('Oct 18 (never played):', await p.$eval('#cal-detail', e => e.innerText.replace(/\n/g, ' | ')));
  console.log('errors', errs); await b.close(); })();

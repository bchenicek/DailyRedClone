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
const playOut = async p => {
  await p.click('#start'); await p.click('[data-speed="fast"]');
  for (let i = 0; i < 3000; i++) {
    if (await p.$('.result')) break;
    const sh = await p.$('#p-shift:not([disabled])'); if (sh) { await sh.click({timeout: 1500}).catch(() => {}); continue; }
    const pk = await p.$('.party .pm:not(.fnt):not(.act):not(.psel)'); if (pk) { await pk.click({timeout: 1500}).catch(() => {}); continue; }
    const use = await p.$('#use'); if (use) { await use.click({timeout: 1500}).catch(() => {}); continue; }
    const mvs = await p.$$('button[data-move]:not([disabled])'); if (mvs.length) { await mvs[Math.floor(Math.random() * mvs.length)].click({timeout: 1500}).catch(() => {}); continue; }
    const mb = await p.$('#msgbox'); if (mb) await mb.click().catch(() => {});
    await p.waitForTimeout(20);
  }
  return p.$eval('.result .rs', e => e.textContent);
};
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 860}}); await ctx.addInitScript(MOCK);
  const p = await ctx.newPage(); await p.route(/fonts\.|gstatic/, r => r.abort()); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8766/'); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.waitForSelector('#namein', {timeout: 15000}); await p.fill('#namein', 'Ben'); await p.click('#nameform button[type=submit]'); await p.waitForTimeout(500);
  const r1 = await playOut(p); console.log('Ben played:', r1);
  await p.waitForTimeout(800);
  console.log('Ben rp in shared doc:', await p.evaluate(() => JSON.stringify(window.__fs['players/u_me'].rp).slice(0, 120)));
  // become a different player on the same mock backend
  await p.evaluate(() => { const fs = localStorage.getItem('__fs'); localStorage.clear(); localStorage.setItem('__fs', fs); localStorage.setItem('__uid', 'u_kid'); });
  await p.reload(); await p.waitForSelector('#namein', {timeout: 15000}); await p.fill('#namein', 'Kid'); await p.click('#nameform button[type=submit]'); await p.waitForTimeout(500);
  await p.click('[data-tab="friends"]'); await p.waitForTimeout(400);
  const today = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await p.click(`[data-cal="${today}"]`); await p.waitForTimeout(200);
  console.log('before playing, detail:', await p.$eval('#cal-detail', e => e.innerText.replace(/\n/g, ' | ')), '| watch buttons:', (await p.$$('[data-watch]')).length);
  await p.click('[data-tab="play"]'); await p.waitForTimeout(200); await p.click('#start'); await p.waitForSelector('button[data-move]', {timeout: 30000}); await p.click('button[data-move="1"]'); await p.click('#use'); await p.waitForSelector('#run', {timeout: 30000}); await p.click('#run'); await p.click('#run-yes'); await p.waitForTimeout(500);
  await p.click('[data-tab="friends"]'); await p.waitForTimeout(400);
  console.log('after, detail:', await p.$eval('#cal-detail', e => e.innerText.replace(/\n/g, ' | ')));
  await p.screenshot({path: SP + 'web-watch-cal.png'});
  const btn = await p.$('[data-watch="u_me"]'); await btn.click(); await p.waitForTimeout(400);
  console.log('banner:', await p.$eval('#practice', e => e.innerText.replace(/\n/g, ' | ')));
  await p.screenshot({path: SP + 'web-watch-play.png'});
  for (let i = 0; i < 3000 && !(await p.$('.result')); i++) { const mb = await p.$('#msgbox'); if (mb) await mb.click().catch(() => {}); await p.waitForTimeout(20); }
  const r2 = await p.$eval('.result .rs', e => e.textContent);
  console.log('replay of Ben:', r2, '| matches:', r1 === r2);
  console.log('errors', errs); await b.close(); })();

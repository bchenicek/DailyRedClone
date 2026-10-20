const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
const SP = '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/';
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
const FAKE = `
(() => { const store = JSON.parse(localStorage.getItem('__fakedb') || 'null') || {
    'players/u_bro': {t: 1, days: {'${today}': {classic_smart: {a: 3, first: 'loss', firstLost: 6, fl: 3, w: 2}}, '2026-10-16': {classic_smart: {a: 5, first: 'win', firstLost: 2, fl: 5, w: 3}}}},
    'players/u_pal': {t: 1, days: {'${today}': {classic_smart: {a: 1, first: 'win', firstLost: 1, fl: null, w: 1}}}} };
  const persist = () => localStorage.setItem('__fakedb', JSON.stringify(store));
  const subs = [];
  const docRef = path => ({ path, set: async b => { store[path] = JSON.parse(JSON.stringify(b)); persist(); subs.forEach(f => f()); }, delete: async () => { delete store[path]; persist(); } });
  const q = p => { const run = () => { const docs = Object.keys(store).filter(k => k.startsWith(p + '/') && k.split('/').length === p.split('/').length + 1).map(k => ({id: k.split('/').pop(), exists: true, data: () => store[k]})); return {docs, size: docs.length, empty: !docs.length}; };
    const o = { limit: () => o, get: async () => run(), onSnapshot: (next) => { const f = () => next(run()); subs.push(f); setTimeout(f, 50); return () => {}; } }; return o; };
  const db = { doc: docRef, collection: q };
  const user = { id: async () => 'u_me', profiles: async ids => Object.fromEntries(ids.map(i => [i, {id: i, name: {u_bro: 'Logan', u_pal: 'Sam', u_me: 'Me'}[i] || '', avatarUrl: '', color: i === 'u_bro' ? '#c8332f' : '#3a6ad6'}])) };
  window.claude = { use: async n => (await new Promise(r => setTimeout(r, 200)), n === 'db' ? db : n === 'user' ? user : null) };
})();`;
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 900}});
  await ctx.addInitScript(FAKE);
  const p = await ctx.newPage(); await p.route(/fonts\./, r => r.abort()); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start'); await p.evaluate(() => { localStorage.clear(); }); await p.reload(); await p.waitForSelector('#start'); await p.waitForTimeout(900);
  console.log('hidden strip:', await p.$eval('#friends-strip', e => e.innerText.replace(/\n/g, ' | ')));
  await p.click('#start'); await p.waitForTimeout(300); await p.click('[data-speed="fast"]');
  await p.waitForSelector('button[data-move]', {timeout: 20000}); await p.click('button[data-move="1"]'); await p.click('#use'); await p.waitForSelector('#run', {timeout: 30000}); await p.click('#run'); await p.click('#run-yes'); await p.waitForTimeout(600);
  console.log('revealed strip:', await p.$eval('#friends-strip', e => e.innerText.replace(/\n/g, ' | ')));
  await (await p.$('#friends-strip')).screenshot({path: SP + 'fr1.png'});
  await p.click('[data-tab="friends"]'); await p.waitForTimeout(300); await p.click('[data-cal="2026-10-16"]'); await p.waitForTimeout(200);
  await (await p.$('#calendar')).screenshot({path: SP + 'cal.png'});
  console.log('detail:', await p.$eval('#cal-detail', e => e.innerText.replace(/\n/g, ' | ')));
  console.log('stats:', await p.$eval('#friends-stats', e => e.innerText.replace(/\n/g, ' | ')));
  console.log('my board doc:', await p.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('__fakedb'))['players/u_me'])));
  console.log('errors', errs); await b.close(); })();

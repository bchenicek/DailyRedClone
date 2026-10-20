// Simulates the viewer's db with an in-memory store to exercise sync + merge.
const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
const FAKE = `
(() => { const store = JSON.parse(localStorage.getItem('__fakedb') || '{}');
  const persist = () => localStorage.setItem('__fakedb', JSON.stringify(store));
  const docRef = path => ({ path, id: path.split('/').pop(),
    get: async () => ({id: path.split('/').pop(), exists: path in store, data: () => store[path], metadata: {}}),
    set: async b => { store[path] = JSON.parse(JSON.stringify(b)); persist(); }, delete: async () => { delete store[path]; persist(); } });
  const db = { doc: docRef, collection: p => { const q = { limit: () => q, get: async () => { const docs = Object.keys(store).filter(k => k.startsWith(p + '/') && k.split('/').length === p.split('/').length + 1).map(k => ({id: k.split('/').pop(), exists: true, data: () => store[k]})); return {docs, size: docs.length, empty: !docs.length}; } }; return q; } };
  const user = { id: async () => 'u_test' };
  window.claude = { use: async n => (await new Promise(r => setTimeout(r, 300)), n === 'db' ? db : n === 'user' ? user : null) };
})();`;
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 760}});
  await ctx.addInitScript(FAKE);
  const p = await ctx.newPage(); await p.route(/fonts\./, r => r.abort()); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('#start'); await p.waitForTimeout(800);
  console.log('sync line:', await p.$eval('#sync', e => e.textContent));
  await p.click('#start'); await p.waitForTimeout(500); await p.click('[data-speed="fast"]');
  for (let i = 0; i < 3; i++) { const mv = await p.waitForSelector('button[data-move]:not([disabled])'); await mv.click(); await mv.click().catch(() => {}); await p.waitForTimeout(2500); }
  await p.click('#run'); await p.click('#run-yes'); await p.waitForTimeout(500);
  await p.click('#start'); await p.waitForTimeout(500);
  for (let i = 0; i < 2; i++) { const mv = await p.waitForSelector('button[data-move]:not([disabled])'); await mv.click(); await mv.click().catch(() => {}); await p.waitForTimeout(2500); }
  const turnBefore = await p.$eval('.turnlbl', e => e.textContent);
  // wipe browser storage but keep the fake account store: simulates the browser losing its data
  await p.evaluate(() => { const f = localStorage.getItem('__fakedb'); localStorage.clear(); localStorage.setItem('__fakedb', f); });
  await p.reload(); await p.waitForTimeout(2500);
  console.log('after wipe -> battle resumed:', await p.$eval('.turnlbl', e => e.textContent).catch(() => 'no battle'), '(was', turnBefore + ')');
  console.log('fake store docs:', await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('__fakedb'))).join(', ')));
  await p.click('#run'); await p.click('#run-yes'); await p.waitForTimeout(400);
  console.log('today:', await p.$eval('#today', e => e.innerText.replace(/\n/g, ' ')));
  console.log('errors', errs); await b.close(); })();

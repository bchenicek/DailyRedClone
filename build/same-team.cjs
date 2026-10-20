const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage(); await p.route(/fonts\./, r => r.abort());
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('#start');
  const team = () => p.$$eval('.team:not(.red) .mon', es => es.map(e => e.querySelector('h3').textContent.replace('Lead', '') + '[' + [...e.querySelectorAll('.chip')].map(c => c.textContent).join('/') + ' ' + e.querySelector('dd').textContent + ']').join(', '));
  for (const m of ['classic', 'chaos', 'random']) {
    const out = {};
    for (const f of ['singles', 'doubles']) for (const d of ['smart', 'simple']) { await p.click(`[data-mode="${m}"]`); await p.click(`[data-fmt="${f}"]`); await p.click(`[data-diff="${d}"]`); await p.waitForTimeout(100); out[f + '/' + d] = await team(); }
    const v = Object.values(out); const species = v.map(t => t.replace(/\[[^\]]*\]/g, ''));
    console.log(m, '| same species:', new Set(species).size === 1, '| same sets:', new Set(v).size === 1, '|', species[0]);
    if (new Set(v).size > 1) console.log('  singles:', out['singles/smart'], '\n  doubles:', out['doubles/smart']);
  }
  console.log('errors', errs); await b.close(); })();

const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 390, height: 800}}); await p.route(/fonts\./, r => r.abort());
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('#start');
  await p.click('#start'); await p.click('[data-speed="fast"]');
  for (let i = 0; i < 400; i++) {
    const f = await p.$('.party .pm.fnt'); if (f) { console.log('fainted row:', await f.$eval('.pnum', e => e.textContent.trim())); break; }
    const use = await p.$('#use'); if (use) { await use.click(); continue; }
    const mv = await p.$('button[data-move]:not([disabled])'); if (mv) { await mv.click(); continue; }
    const mb = await p.$('#msgbox'); if (mb) await mb.click().catch(() => {});
    await p.waitForTimeout(60);
  }
  await b.close(); })();

const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 390, height: 800}, hasTouch: true, isMobile: true}); await p.route(/fonts\./, r => r.abort());
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('#start');
  await p.click('#start'); await p.click('[data-speed="fast"]');
  console.log('mid-battle lead buttons:', (await p.$$('button.setlead')).length);
  for (let i = 0; i < 600; i++) {
    if (await p.$('.result')) break;
    const sh = await p.$('#p-shift:not([disabled])'); if (sh) { await sh.click(); continue; }
    const pk = await p.$('.party .pm:not(.fnt):not(.act)'); if (pk) { await pk.click(); continue; }
    const use = await p.$('#use'); if (use) { await use.click(); continue; }
    const mv = await p.$('button[data-move]:not([disabled])'); if (mv) { await mv.click(); continue; }
    const mb = await p.$('#msgbox'); if (mb) await mb.click().catch(() => {});
    await p.waitForTimeout(60);
  }
  console.log('result-screen lead buttons:', (await p.$$('button.setlead:not([disabled])')).length);
  await p.click('button.setlead[data-lead="4"]'); await p.waitForTimeout(200);
  console.log('result still shown:', !!(await p.$('.result')));
  await p.click('#again'); await p.waitForTimeout(200);
  console.log('lead for next try:', await p.$eval('.vsmon:last-child b', e => e.textContent), '| card marked lead:', await p.$eval('.mon.is-lead h3', e => e.textContent));
  console.log('errors', errs); await b.close(); })();

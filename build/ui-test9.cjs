const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
const SP = '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/';
(async () => { const b = await chromium.launch();
  const p = await b.newPage({viewport: {width: 393, height: 760}, hasTouch: true, isMobile: true, deviceScaleFactor: 2}); await p.route(/fonts\./, r => r.abort());
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('#start');
  await p.click('#start'); await p.waitForTimeout(1200); await p.screenshot({path: SP + 'c1.png'});
  await p.waitForSelector('button[data-move]', {timeout: 20000}); await p.screenshot({path: SP + 'c2.png'});
  await p.click('button[data-move="2"]'); await p.waitForTimeout(200); await p.screenshot({path: SP + 'c3.png'});
  await p.click('#unchoose'); await p.click('#open-party'); await p.waitForTimeout(200); await p.click('[data-pick="2"]'); await p.click('#p-summary'); await p.waitForTimeout(200); await p.screenshot({path: SP + 'c4.png'});
  await p.click('#p-cancel'); await p.click('#p-close');
  for (let i = 0; i < 500; i++) {
    if (await p.$('.result')) break;
    const sh = await p.$('#p-shift:not([disabled])'); if (sh) { await sh.click(); continue; }
    const pk = await p.$('.party .pm:not(.fnt):not(.act)'); if (pk) { await pk.click(); continue; }
    const use = await p.$('#use'); if (use) { await use.click(); continue; }
    const mv = await p.$('button[data-move]:not([disabled])'); if (mv) { await mv.click(); continue; }
    const mb = await p.$('#msgbox'); if (mb) await mb.click().catch(() => {});
    await p.waitForTimeout(80);
  }
  await p.waitForTimeout(300); await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({path: SP + 'c5.png', fullPage: true});
  console.log('errors', errs); await b.close(); })();

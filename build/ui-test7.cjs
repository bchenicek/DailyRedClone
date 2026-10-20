const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
const SP = '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/';
(async () => { const b = await chromium.launch();
  const p = await b.newPage({viewport: {width: 390, height: 760}, hasTouch: true, isMobile: true}); await p.route(/fonts\./, r => r.abort());
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('#start');
  await p.click('[data-speed]').catch(() => {}); await p.click('#start'); await p.waitForTimeout(500);
  await p.click('[data-speed="fast"]');
  let forced = 0;
  for (let i = 0; i < 600; i++) {
    if (await p.$('.console .result')) break;
    const shift = await p.$('#p-shift:not([disabled])');
    if (shift) { await shift.click(); continue; }
    const pick = await p.$('.party .pm:not(.fnt):not(.act)');
    if (pick && await p.$('.party')) { forced++; await pick.click(); continue; }
    const mv = await p.$('button[data-move]:not([disabled])');
    if (mv) { await mv.click(); await mv.click().catch(() => {}); continue; }
    await p.waitForTimeout(200);
  }
  await p.waitForTimeout(400); await p.screenshot({path: SP + 'b5.png'});
  console.log('result', await p.$eval('.console .result h3', e => e.textContent).catch(() => 'none'), 'party picks', forced, 'errors', errs);
  await b.close(); })();

const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
const SP = '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/';
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 390, height: 844}}); await p.route(/fonts\./, r => r.abort());
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('#start');
  await p.click('[data-mode="random"]'); await p.click('[data-fmt="singles"]'); await p.click('[data-diff="simple"]'); await p.click('[data-lead="2"]');
  await p.click('#start'); await p.click('[data-speed="fast"]');
  const myCard = () => p.$eval('.me-card .card', e => e.innerText.replace(/\n/g, ' '));
  for (let t = 0; t < 15; t++) {
    for (let i = 0; i < 400 && !(await p.$('button[data-move]:not([disabled]), .result, #party')); i++) { const mb = await p.$('#msgbox'); if (mb) await mb.click().catch(() => {}); await p.waitForTimeout(30); }
    if (await p.$('.result')) break;
    const card = await myCard().catch(() => '?'); const real = await p.evaluate(() => 0);
    console.log('turn', t, '| my card:', card);
    if (await p.$('#party')) { console.log('forced switch'); break; }
    await p.click('button[data-move="4"]'); await p.click('#use');
  }
  console.log('log tail:', (await p.$eval('#log', e => e.innerText)).split('\n').filter(Boolean).slice(-8).join(' / '));
  await p.screenshot({path: SP + 'illusion.png'});
  console.log('errors', errs); await b.close(); })();

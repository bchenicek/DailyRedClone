const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
const SP = '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/';
(async () => {
  const browser = await chromium.launch();
  for (const [name, vp, scheme] of [['mobile', {width: 390, height: 844}, 'light'], ['desktop', {width: 1100, height: 900}, 'dark']]) {
    const page = await browser.newPage({viewport: vp, colorScheme: scheme});
    await page.route(/fonts\./, r => r.abort()); const errs = []; page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', e => errs.push(e.message));
    await page.goto('http://localhost:8765/test.html'); await page.waitForTimeout(4000); if (!(await page.$('#start'))) { console.log('ERRS', errs, (await page.content()).slice(-1500)); }
    await page.screenshot({path: SP + name + '-1.png', fullPage: true});
    await page.click('#start'); await page.waitForTimeout(1500);
    for (let i = 0; i < 6; i++) {
      const btn = await page.$('button[data-move]:not([disabled])') || await page.$('button[data-switch]:not([disabled])');
      if (!btn) { await page.waitForTimeout(800); continue; }
      await btn.click(); await page.waitForTimeout(6000);
    }
    await page.screenshot({path: SP + name + '-2.png', fullPage: false});
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    console.log(name, 'errors:', errs.slice(0, 5), 'scrollWidth', sw);
  }
  await browser.close();
})();

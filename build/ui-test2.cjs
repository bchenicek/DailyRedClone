const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
const SP = '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({viewport: {width: 390, height: 844}});
  const page = await ctx.newPage();
  await page.route(/fonts\./, r => r.abort());
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8765/test.html'); await page.waitForSelector('#start');
  await page.click('[data-mode="random"]'); await page.waitForTimeout(300);
  await page.click('#start'); await page.waitForTimeout(500);
  await page.check('#fast');
  let sawBoost = false, sawStatus = false, turns = 0, reloaded = false;
  for (let i = 0; i < 300; i++) {
    if (await page.$('.result')) break;
    if (await page.$('.bst')) sawBoost = true;
    if (await page.$('.hpbox .status')) { if (!sawStatus) await page.screenshot({path: SP + 'status.png'}); sawStatus = true; }
    const btn = await page.$('button[data-move]:not([disabled])') || await page.$('button[data-switch]:not([disabled])');
    if (!btn) { await page.waitForTimeout(250); continue; }
    await btn.click(); turns++;
    if (turns === 3 && !reloaded) {
      await page.waitForTimeout(3000);
      const before = await page.$eval('.hpbox.p2 .hpt', e => e.textContent);
      await page.reload(); await page.waitForSelector('#battle .field'); reloaded = true;
      const after = await page.$eval('.hpbox.p2 .hpt', e => e.textContent);
      console.log('resume check', before, '=>', after);
    }
  }
  await page.waitForTimeout(500);
  await page.screenshot({path: SP + 'result.png', fullPage: false});
  console.log('result', await page.$eval('.result h3', e => e.textContent).catch(() => 'none'), 'turns clicked', turns, 'sawStatus', sawStatus, 'sawBoost', sawBoost);
  console.log('summary at end', await page.$eval('#today', e => e.innerText.replace(/\n/g, ' ')));
  console.log('mode disabled at end', await page.$eval('[data-mode="classic"]', e => e.disabled));
  console.log('??? in log', await page.$eval('#log', e => e.innerText.includes('???')));
  await page.click('#again'); await page.waitForTimeout(300);
  console.log('today', await page.$eval('.today', e => e.innerText.replace(/\n/g, ' ')));
  await page.click('[data-tab="stats"]'); await page.waitForTimeout(300);
  await page.screenshot({path: SP + 'stats.png', fullPage: true});
  console.log('errors', errs);
  await browser.close();
})();

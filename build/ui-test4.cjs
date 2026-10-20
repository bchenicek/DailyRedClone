const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch();
  for (const mode of ['chaos']) {
    const page = await browser.newPage({viewport: {width: 390, height: 844}});
    await page.route(/fonts\./, r => r.abort());
    await page.goto('http://localhost:8765/test.html'); await page.waitForSelector('#start');
    await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector('#start');
    await page.click(`[data-mode="${mode}"]`); await page.click('#start'); await page.waitForTimeout(500);
    let prev = '';
    for (let i = 0; i < 400; i++) {
      if (await page.$('.result')) break;
      const b = await page.$$eval('.bst', es => es.map(e => e.closest('.hpbox').className.split(' ')[1] + ':' + e.textContent).join(','));
      if (b !== prev) { const last = await page.$eval('#log', e => [...e.querySelectorAll('p')].slice(-3).map(p => p.textContent).join(' / ')); console.log(mode, i, JSON.stringify(b), '<<', last); prev = b; }
      const btn = await page.$('button[data-move]:not([disabled])') || await page.$('button[data-switch]:not([disabled])');
      if (btn && i % 3 === 0) await btn.click();
      await page.waitForTimeout(300);
    }
    await page.close();
  }
  await browser.close();
})();

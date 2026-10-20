const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({viewport: {width: 390, height: 844}});
  await page.route(/fonts\./, r => r.abort()); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8765/test.html'); await page.waitForSelector('#start'); await page.click('#start'); await page.waitForTimeout(800);
  await page.click('button[data-move]:not([disabled])');
  const samples = [];
  for (let i = 0; i < 40; i++) { samples.push(await page.$eval('#bar-p2', e => e.style.width).catch(() => '-') + '|' + await page.$eval('#bar-p1', e => e.style.width).catch(() => '-')); await page.waitForTimeout(100); }
  console.log([...new Set(samples)].join('  ')); console.log('errors', errs);
  await browser.close();
})();

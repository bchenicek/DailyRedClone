const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 390, height: 800}, hasTouch: true, isMobile: true}); await p.route(/fonts\./, r => r.abort());
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('#start');
  const lead = async () => p.$eval('.vsmon:last-child b', e => e.textContent);
  console.log('lead before:', await lead(), 'buttons:', (await p.$$('button.setlead')).length);
  await p.tap('button.setlead[data-lead="3"]'); await p.waitForTimeout(300);
  console.log('after tap lead 3:', await lead());
  console.log('errors', errs); await b.close(); })();

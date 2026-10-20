const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 390, height: 844}}); await p.route(/fonts\./, r => r.abort());
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('#start');
  // finish one endless run quickly
  await p.click('#tab-endless'); await p.click('#e-start'); await p.click('#e-battle'); await p.waitForSelector('button[data-move]', {timeout: 30000});
  await p.evaluate(() => window.__drDebug.winBattle()); await p.click('#e-next'); await p.click('#e-battle'); await p.waitForSelector('#run', {timeout: 30000}); await p.click('#run'); await p.click('#run-yes'); await p.waitForTimeout(300);
  console.log('endless tab after run:', await p.$eval('main', e => e.innerText.includes('Your endless stats are on the Stats tab')));
  await p.click('#tab-stats'); await p.waitForTimeout(300);
  console.log('stats tab:', await p.$eval('main', e => e.innerText.replace(/\n+/g, ' | ').slice(0, 900)));
  await p.screenshot({path: '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/stats-tab.png', fullPage: true});
  console.log('errors', errs); await b.close(); })();

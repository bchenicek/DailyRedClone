const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 390, height: 844}}); await p.route(/fonts\.|gstatic/, r => r.abort());
  await p.goto('http://localhost:8766/'); await p.evaluate(() => localStorage.setItem('dailyred:v1:name', 'T')); await p.reload(); await p.waitForSelector('#start');
  console.log('sheet url in use:', await p.$eval('.team .spr', e => getComputedStyle(e).backgroundImage));
  await p.screenshot({path: '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/sprites-web.png', fullPage: false}); await b.close(); })();

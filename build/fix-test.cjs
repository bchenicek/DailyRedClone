const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
const SP = '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/';
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 390, height: 800}}); await p.route(/fonts\./, r => r.abort());
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start');
  await p.click('#redteam > summary'); await p.waitForTimeout(200);
  console.log('red lead tags:', await p.$$eval('.team.red .leadtag', es => es.length));
  const el = await p.$('.team.red .mon'); await el.screenshot({path: SP + 'redcard.png'});
  await b.close(); })();

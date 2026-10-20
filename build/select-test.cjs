const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 900, height: 900}}); await p.route(/fonts\./, r => r.abort());
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#pastday');
  const box = await (await p.$('.pastpick')).boundingBox();
  await p.screenshot({path: '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/select.png', clip: {x: box.x + box.width / 2 - 150, y: box.y, width: 300, height: box.height}}); await b.close(); })();

const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 600, height: 300}});
  await p.goto('file:///home/claude/dailyred/out/test.html'); await p.waitForTimeout(500);
  await p.evaluate(() => { document.body.insertAdjacentHTML('afterbegin', '<div style="font-family:Pixelify Sans;font-weight:500;font-size:80px;padding:20px">SHIFT</div><div style="font-family:Pixelify Sans;font-weight:700;font-size:80px;padding:0 20px">HOH</div>'); });
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  console.log('fonts loaded:', await p.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight).join(', ')));
  await p.screenshot({path: '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/fontH.png'}); await b.close(); })();

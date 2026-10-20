const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
const SP = '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/';
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 390, height: 900}}); await p.route(/fonts\./, r => r.abort());
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start'); await p.click('[data-mode="chaos"]'); await p.waitForTimeout(300);
  console.log('chaos team:', await p.$$eval('.team:not(.red) .mon h3', es => es.map(e => e.textContent.replace('Lead','').trim()).join(', ')));
  await (await p.$$('.team:not(.red) .mon'))[1].screenshot({path: SP + 'legend.png'});
  await p.click('#start'); await p.waitForSelector('button[data-move]', {timeout: 20000});
  console.log('battle ok, errors', errs); await b.close(); })();

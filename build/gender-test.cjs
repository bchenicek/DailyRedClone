const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
const SP = '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/';
const DAY = process.argv[2];
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 844}});
  if (DAY) { const [Y, M, D] = DAY.split('-').map(Number); await ctx.addInitScript(`(() => { const T = new Date(${Y}, ${M - 1}, ${D}, 12).getTime(); const RD = Date; class FD extends RD { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } } window.Date = FD; })()`); }
  const p = await ctx.newPage(); await p.route(/fonts\./, r => r.abort()); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('#start');
  await p.click('[data-mode="chaos"]'); await p.waitForTimeout(200);
  const cards = () => p.$$eval('.team .mon h3', es => es.map(e => e.textContent.replace(/Lead.*/, '').trim()).join(', '));
  console.log('team cards:', await cards());
  await p.click('#start'); await p.waitForSelector('button[data-move]', {timeout: 30000});
  console.log('battle cards:', await p.$$eval('.card .cn', es => es.map(e => e.textContent).join(' ; ')));
  await p.click('#open-party'); await p.waitForTimeout(100);
  console.log('party:', await p.$$eval('.pm .pn b', es => es.map(e => e.textContent).join(', ')));
  await p.screenshot({path: SP + 'gender.png'});
  console.log('errors', errs); await b.close(); })();

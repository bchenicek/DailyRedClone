const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
const SP = '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/';
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 844}});
  await ctx.addInitScript(() => { const T = new Date(2027, 3, 1, 12, 0, 0).getTime(); const RD = Date; class FD extends RD { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } } window.Date = FD; });
  const p = await ctx.newPage(); await p.route(/fonts\./, r => r.abort()); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start'); await p.click('[data-mode="classic"]'); await p.waitForTimeout(300);
  await p.click('#start'); await p.waitForSelector('#open-party', {timeout: 20000}); await p.click('#open-party'); await p.waitForTimeout(200);
  await p.screenshot({path: SP + 'mk.png'}); console.log('errors', errs); await b.close(); })();

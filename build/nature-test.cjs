const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 844}});
  if (process.argv[2]) { const [Y, M, D] = process.argv[2].split('-').map(Number); await ctx.addInitScript(`(() => { const T = new Date(${Y}, ${M - 1}, ${D}, 12).getTime(); const RD = Date; class FD extends RD { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } } window.Date = FD; })()`); }
  const p = await ctx.newPage(); await p.route(/fonts\./, r => r.abort()); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('#start');
  console.log('natures:', await p.$$eval('.team:not(.red) .mon', es => es.map(e => e.querySelector('h3').textContent.replace(/Lead.*/, '') + ': ' + [...e.querySelectorAll('.kv div')].map(d => d.innerText.replace('\n', ' ')).join(' | ')).join('\n  ')));
  console.log('red cards have nature:', await p.$$eval('.team.red .kv', es => es.some(e => e.innerText.includes('Nature'))));
  const card = await p.$('.team:not(.red) .mon'); await card.scrollIntoViewIfNeeded(); await card.screenshot({path: '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/nature.png'});
  await p.click('#start'); await p.waitForSelector('#open-party', {timeout: 30000}); await p.click('#open-party'); await p.click('.party .pm[data-pick="1"]');
  console.log('party buttons:', await p.$$eval('.pfoot .pbtn', es => es.map(e => e.textContent).join(', ')));
  console.log('errors', errs); await b.close(); })();

const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
const SP = '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/';
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 844}});
  await ctx.addInitScript(`(() => { const T = new Date(2027, 0, 11, 12).getTime(); const RD = Date; class FD extends RD { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } } window.Date = FD; })()`);
  const p = await ctx.newPage(); await p.route(/fonts\./, r => r.abort()); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('#start');
  await p.click('[data-mode="random"]'); await p.click('[data-fmt="singles"]'); await p.click('[data-diff="simple"]'); await p.click('[data-lead="4"]'); await p.click('#start'); await p.click('[data-speed="fast"]');
  const idx = await p.evaluate(async () => (await (await fetch('sprites.json')).json()).index);
  const mySprite = () => p.$eval('.me-mon .spr', e => [+getComputedStyle(e).getPropertyValue('--c'), +getComputedStyle(e).getPropertyValue('--r')]);
  const toIdx = ([c, r]) => r * 24 + c; const name = i => Object.keys(idx).find(k => idx[k] === i);
  const waitMenu = async () => { for (let i = 0; i < 400 && !(await p.$('#open-party')); i++) { const mb = await p.$('#msgbox'); if (mb) await mb.click().catch(() => {}); await p.waitForTimeout(30); } };
  await waitMenu(); console.log('lead sprite:', name(toIdx(await mySprite())));
  // switch out to slot 2, then back to Palafin
  await p.click('#open-party'); await p.click('.party .pm[data-pick="1"]'); await p.click('#p-shift'); await waitMenu();
  await p.click('#open-party'); const pal = await p.$$eval('.party .pm', es => es.findIndex(e => e.innerText.includes('Palafin'))); await p.click(`.party .pm[data-pick="${pal}"]`); await p.click('#p-shift'); await waitMenu();
  console.log('after returning:', name(toIdx(await mySprite())), '| log:', (await p.$eval('#log', e => e.innerText)).split('\n').filter(l => /hero|Palafin/i.test(l)).slice(-3).join(' / '));
  await p.screenshot({path: SP + 'palafin.png'});
  console.log('errors', errs); await b.close(); })();

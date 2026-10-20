const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
const SP = '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/';
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 844}});
  const p = await ctx.newPage(); await p.route(/fonts\.|gstatic/, r => r.abort()); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8766/'); await p.evaluate(() => localStorage.setItem('dailyred:v1:name', 'Tester')); await p.reload(); await p.waitForSelector('#start', {timeout: 20000});
  await p.evaluate(() => navigator.serviceWorker.ready); await p.waitForTimeout(1500);
  console.log('caches:', await p.evaluate(async () => { const out = []; for (const k of await caches.keys()) out.push(k + ':' + (await (await caches.open(k)).keys()).length); return out.join(', '); }));
  console.log('manifest linked:', await p.evaluate(() => !!document.querySelector('link[rel=manifest]')));
  await ctx.setOffline(true);
  await p.reload(); await p.waitForSelector('#start', {timeout: 20000});
  console.log('offline reload ok, team:', await p.$$eval('.team:not(.red) .mon h3', es => es.map(e => e.textContent.replace(/Lead.*/, '')).join(', ')));
  // Play a full attempt offline
  await p.click('#start'); await p.click('[data-speed="fast"]');
  for (let i = 0; i < 3000 && !(await p.$('.result')); i++) {
    const sh = await p.$('#p-shift:not([disabled])'); if (sh) { await sh.click({timeout: 1500}).catch(() => {}); continue; }
    const pk = await p.$('.party .pm:not(.fnt):not(.act):not(.psel)'); if (pk) { await pk.click({timeout: 1500}).catch(() => {}); continue; }
    const use = await p.$('#use'); if (use) { await use.click({timeout: 1500}).catch(() => {}); continue; }
    const mv = await p.$('button[data-move]:not([disabled])'); if (mv) { await mv.click({timeout: 1500}).catch(() => {}); continue; }
    const mb = await p.$('#msgbox'); if (mb) await mb.click().catch(() => {}); await p.waitForTimeout(20);
  }
  console.log('offline result:', await p.$eval('.result .rs', e => e.textContent));
  console.log('attempt saved locally:', await p.evaluate(() => JSON.parse(localStorage.getItem('dailyred:v1:attempts') || '[]').length));
  // a past day offline
  await p.click('#again'); await p.waitForTimeout(300); await p.selectOption('#pastday', '2026-10-16'); await p.waitForTimeout(300);
  console.log('past day offline:', await p.$eval('#practice', e => e.innerText.split('\n')[1]));
  await p.screenshot({path: SP + 'offline.png'});
  console.log('errors', errs); await b.close(); })();

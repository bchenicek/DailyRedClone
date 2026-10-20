const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
const SP = '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/';
const FMT = process.argv[2] || 'singles';
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 390, height: 844}}); await p.route(/fonts\./, r => r.abort());
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('#start');
  await p.click('[data-mode="random"]'); await p.click(`[data-fmt="${FMT}"]`);
  const play = async () => {
    await p.click('#start'); await p.click('[data-speed="fast"]');
    for (let i = 0; i < 3000; i++) {
      if (await p.$('.result')) break;
      const sh = await p.$('#p-shift:not([disabled])'); if (sh) { await sh.click({timeout: 1500}).catch(() => {}); continue; }
      const pk = await p.$('.party .pm:not(.fnt):not(.act):not(.psel)'); if (pk) { await pk.click({timeout: 1500}).catch(() => {}); continue; }
      const tg = await p.$$('#tgtpop button[data-target]'); if (tg.length) { await tg[Math.floor(Math.random() * tg.length)].click({timeout: 1500}).catch(() => {}); continue; }
      const use = await p.$('#use'); if (use) { await use.click({timeout: 1500}).catch(() => {}); continue; }
      const mvs = await p.$$('button[data-move]:not([disabled])'); if (mvs.length) { await mvs[Math.floor(Math.random() * mvs.length)].click({timeout: 1500}).catch(() => {}); continue; }
      const mb = await p.$('#msgbox'); if (mb) await mb.click().catch(() => {});
      await p.waitForTimeout(20);
    }
    return p.$eval('.result .rs', e => e.textContent);
  };
  const r1 = await play(); await p.click('#again'); await p.waitForTimeout(200);
  const r2 = await play();
  console.log('attempt 1:', r1, '\nattempt 2:', r2);
  const atts = await p.evaluate(() => JSON.parse(localStorage.getItem('dailyred:v1:attempts')).map(a => ({n: a.n, lost: a.lost, result: a.result, rpLen: (a.rp || '').length, rp: (a.rp || '').slice(0, 60)})));
  console.log(JSON.stringify(atts));
  await p.click('#tab-friends'); await p.waitForTimeout(200);
  const today = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await p.click(`[data-cal="${today}"]`); await p.waitForTimeout(200);
  console.log('detail:', await p.$eval('#cal-detail', e => e.innerText.replace(/\n/g, ' | ')));
  await p.screenshot({path: SP + 'watch-cal.png'});
  await p.click('[data-watch]'); await p.waitForTimeout(400);
  console.log('banner:', await p.$eval('#practice', e => e.innerText.replace(/\n/g, ' | ')));
  await p.screenshot({path: SP + 'watch-play.png'});
  // pause/resume check
  await p.waitForTimeout(1500);
  const logLen = () => p.$eval('#log', e => e.innerText.length);
  await p.click('.scene'); await p.waitForTimeout(100);
  console.log('paused badge:', !!(await p.$('.pausedtag')));
  const a = await logLen(); await p.waitForTimeout(3000); const b2 = await logLen();
  console.log('log frozen while paused:', a === b2);
  await p.screenshot({path: SP + 'paused.png'});
  await p.click('#msgbox'); await p.waitForTimeout(3000);
  console.log('resumed (log grew):', (await logLen()) > b2, '| badge gone:', !(await p.$('.pausedtag')));
  // let it finish on its own
  await p.waitForSelector('.result', {timeout: 240000});
  for (let i = 0; i < 3000 && !(await p.$('.result')); i++) { const mb = await p.$('#msgbox'); if (mb) await mb.click().catch(() => {}); await p.waitForTimeout(20); }
  console.log('replay result:', await p.$eval('.result .rs', e => e.textContent), '| buttons:', await p.$$eval('.result .pbtn', es => es.map(e => e.textContent).join(',')));
  const attsAfter = await p.evaluate(() => JSON.parse(localStorage.getItem('dailyred:v1:attempts')).length);
  console.log('attempts after watching (should be 2):', attsAfter, '| prefs mode:', await p.evaluate(() => JSON.parse(localStorage.getItem('dailyred:v1:prefs')).mode));
  await p.click('#watch-exit'); await p.waitForTimeout(300);
  console.log('back on tab:', await p.$eval('[aria-selected="true"]', e => e.textContent));
  await p.click('#tab-play'); await p.waitForTimeout(200);
  console.log('play tab shows:', await p.$eval('main', e => e.innerText.slice(0, 140).replace(/\n/g, ' | ')));
  console.log('errors', errs); await b.close(); })();

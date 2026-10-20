const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
const SP = '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/';
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 390, height: 844}}); await p.route(/fonts\./, r => r.abort());
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('#start');
  const teamNames = () => p.$$eval('.team:not(.red) .mon h3', es => es.map(e => e.textContent.replace('Lead', '').trim()).join(','));
  const todayTeam = await teamNames();
  console.log('options:', await p.$$eval('#pastday option', os => os.map(o => o.textContent).join(' | ')));
  await p.selectOption('#pastday', '2026-10-16'); await p.waitForTimeout(300);
  console.log('banner:', await p.$eval('#practice', e => e.innerText.replace(/\n/g, ' | ')));
  console.log('team differs from today:', (await teamNames()) !== todayTeam);
  await p.screenshot({path: SP + 'pr1.png'});
  await p.click('#start'); await p.click('[data-speed="fast"]');
  for (let i = 0; i < 600; i++) {
    if (await p.$('.result')) break;
    const sh = await p.$('#p-shift:not([disabled])'); if (sh) { await sh.click(); continue; }
    const pk = await p.$('.party .pm:not(.fnt):not(.act)'); if (pk) { await pk.click(); continue; }
    const use = await p.$('#use'); if (use) { await use.click(); continue; }
    const mv = await p.$('button[data-move]:not([disabled])'); if (mv) { await mv.click(); continue; }
    const mb = await p.$('#msgbox'); if (mb) await mb.click().catch(() => {});
    await p.waitForTimeout(50);
  }
  console.log('result:', await p.$eval('.result', e => e.innerText.replace(/\n/g, ' | ').slice(0, 200)));
  console.log('saved attempts:', await p.evaluate(() => localStorage.getItem('dailyred:v1:attempts')), '| saved battles:', await p.evaluate(() => Object.keys(localStorage).filter(k => k.includes('current')).length));
  await p.click('#back-today'); await p.waitForTimeout(300);
  console.log('back to today team matches:', (await teamNames()) === todayTeam, '| practice banner gone:', !(await p.$('#practice')));
  console.log('errors', errs); await b.close(); })();

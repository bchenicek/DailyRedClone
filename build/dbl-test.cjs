const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
const SP = '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/';
const MODE = process.argv[2] || 'classic', FMT = process.argv[3] || 'doubles', W = +(process.argv[4] || 390);
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: W, height: 844}}); await p.route(/fonts\./, r => r.abort());
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('#start');
  await p.click(`[data-mode="${MODE}"]`); await p.click(`[data-fmt="${FMT}"]`); await p.waitForTimeout(200);
  // pick leads: set 3rd and 5th
  await p.click('[data-lead="2"]'); await p.click('[data-lead="4"]');
  console.log('vs:', await p.$eval('.vs', e => e.innerText.replace(/\n/g, ' | ')));
  console.log('lead tags:', await p.$$eval('.team:not(.red) .mon.is-lead h3', es => es.map(e => e.textContent).join(',')));
  console.log('red leads:', await p.$$eval('.team.red .mon.is-lead h3', es => es.map(e => e.textContent).join(',')));
  await p.screenshot({path: SP + `dbl-pre-${FMT}.png`, fullPage: true});
  await p.click('#start'); await p.click('[data-speed="fast"]');
  let shots = 0, targets = 0, backs = 0, turn = 0;
  for (let i = 0; i < 2500; i++) {
    if (await p.$('.result')) break;
    const sh = await p.$('#p-shift:not([disabled])'); if (sh) { await sh.click({timeout: 1500}).catch(() => {}); continue; }
    const pk = await p.$('.party .pm:not(.fnt):not(.act):not(.psel)'); if (pk) { await pk.click({timeout: 1500}).catch(() => {}); continue; }
    const tg = await p.$$('#tgtpop button[data-target]');
    if (tg.length) { if (shots < 2) { await p.screenshot({path: SP + `dbl-target${shots}.png`}); shots++; } targets++; await tg[Math.floor(Math.random() * tg.length)].click({timeout: 1500}).catch(() => {}); continue; }
    const use = await p.$('#use'); if (use) { await use.click({timeout: 1500}).catch(() => {}); continue; }
    const mvs = await p.$$('button[data-move]:not([disabled])');
    if (mvs.length) {
      if (turn === 1 && await p.$('#slot-back') && backs === 0) { await p.screenshot({path: SP + 'dbl-slot2.png'}); backs++; await p.click("#slot-back", {timeout: 1500}).catch(() => {}); continue; }
      if (turn === 0) { await p.screenshot({path: SP + `dbl-menu-${FMT}.png`}); turn = 1; }
      await mvs[Math.floor(Math.random() * mvs.length)].click({timeout: 1500}).catch(() => {}); continue;
    }
    const mb = await p.$('#msgbox'); if (mb) await mb.click().catch(() => {});
    await p.waitForTimeout(30);
  }
  console.log('targets picked', targets, 'backs', backs);
  console.log('result:', await p.$eval('.result', e => e.innerText.replace(/\n/g, ' | ').slice(0, 220)).catch(() => 'NO RESULT'));
  const att = JSON.parse(await p.evaluate(() => localStorage.getItem('dailyred:v1:attempts')) || '[]');
  console.log('attempt:', JSON.stringify(att.map(a => ({mode: a.mode, lead: a.lead, result: a.result, turns: a.turns}))));
  await p.screenshot({path: SP + `dbl-result-${FMT}.png`, fullPage: true});
  // replay determinism: reload mid battle restores
  console.log('errors', errs); await b.close(); })();

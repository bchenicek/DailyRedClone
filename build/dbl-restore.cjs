const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 390, height: 844}}); await p.route(/fonts\./, r => r.abort());
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('#start');
  await p.click('[data-mode="random"]'); await p.click('[data-fmt="doubles"]'); await p.click('[data-lead="3"]'); await p.click('#start'); await p.click('[data-speed="fast"]');
  let turns = 0;
  for (let i = 0; i < 400 && turns < 6; i++) {
    const sh = await p.$('#p-shift:not([disabled])'); if (sh) { await sh.click({timeout: 1500}).catch(() => {}); continue; }
    const pk = await p.$('.party .pm:not(.fnt):not(.act):not(.psel)'); if (pk) { await pk.click({timeout: 1500}).catch(() => {}); continue; }
    const tg = await p.$('button[data-target]'); if (tg) { await tg.click({timeout: 1500}).catch(() => {}); turns++; continue; }
    const use = await p.$('#use'); if (use) { await use.click({timeout: 1500}).catch(() => {}); turns++; continue; }
    const mv = await p.$('button[data-move]:not([disabled])'); if (mv) { await mv.click({timeout: 1500}).catch(() => {}); continue; }
    const mb = await p.$('#msgbox'); if (mb) await mb.click().catch(() => {});
    await p.waitForTimeout(30);
  }
  for (let i = 0; i < 300 && !(await p.$('#open-party, #party, .result')); i++) { const mb = await p.$('#msgbox'); if (mb) await mb.click().catch(() => {}); await p.waitForTimeout(50); }
  console.log('state', await p.evaluate(() => document.querySelector('.deck')?.innerText.slice(0, 80)));
  const before = await p.evaluate(() => ({log: document.getElementById('log').innerText, turn: document.querySelector('.turnlbl').textContent}));
  const saved = await p.evaluate(() => Object.entries(localStorage).filter(([k]) => k.includes('current')).map(([k, v]) => k + ' ' + v.slice(0, 120)));
  await p.reload(); await p.waitForSelector('#battle .console, .result', {timeout: 30000});
  const after = await p.evaluate(() => ({log: document.getElementById('log').innerText, turn: document.querySelector('.turnlbl').textContent}));
  console.log('saved', saved); console.log('turn', before.turn, '->', after.turn, '| log tail same:', before.log.slice(-300) === after.log.slice(-300));
  console.log('errors', errs); await b.close(); })();

const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
const SP = '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/';
const [Y, M, D] = (process.argv[2] || '2027-04-01').split('-').map(Number);
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 844}});
  await ctx.addInitScript(`(() => { const T = new Date(${Y}, ${M - 1}, ${D}, 12).getTime(); const RD = Date; class FD extends RD { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } } window.Date = FD; })()`);
  const p = await ctx.newPage(); await p.route(/fonts\./, r => r.abort()); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('#start');
  for (const [m, f] of [['classic', 'singles'], ['classic', 'doubles'], ['chaos', 'singles']]) {
    await p.click(`[data-mode="${m}"]`); await p.click(`[data-fmt="${f}"]`); await p.waitForTimeout(150);
    console.log(m, f, '| red hint:', await p.$eval('#redteam .hint', e => e.textContent));
    await p.click('#start'); await p.click('[data-speed="fast"]');
    for (let i = 0; i < 1500; i++) {
      if (await p.$('.result')) break;
      const sh = await p.$('#p-shift:not([disabled])'); if (sh) { await sh.click({timeout: 1500}).catch(() => {}); continue; }
      const pk = await p.$('.party .pm:not(.fnt):not(.act):not(.psel)'); if (pk) { await pk.click({timeout: 1500}).catch(() => {}); continue; }
      const tg = await p.$('button[data-target]'); if (tg) { await tg.click({timeout: 1500}).catch(() => {}); continue; }
      const use = await p.$('#use'); if (use) { await use.click({timeout: 1500}).catch(() => {}); continue; }
      const mv = await p.$('button[data-move]:not([disabled])'); if (mv) { if (i < 40 && m === 'classic' && f === 'singles') await p.screenshot({path: SP + 'apr1.png'}); console.log('  cards:', (await p.$$eval('.card .cn', es => es.map(e => e.textContent))).join(' ; ')); await mv.click({timeout: 1500}).catch(() => {}); break; }
      const mb = await p.$('#msgbox'); if (mb) await mb.click().catch(() => {});
      await p.waitForTimeout(30);
    }
    for (let i = 0; i < 1500; i++) {
      if (await p.$('.result')) break;
      const sh = await p.$('#p-shift:not([disabled])'); if (sh) { await sh.click({timeout: 1500}).catch(() => {}); continue; }
      const pk = await p.$('.party .pm:not(.fnt):not(.act):not(.psel)'); if (pk) { await pk.click({timeout: 1500}).catch(() => {}); continue; }
      const tg = await p.$('button[data-target]'); if (tg) { await tg.click({timeout: 1500}).catch(() => {}); continue; }
      const use = await p.$('#use'); if (use) { await use.click({timeout: 1500}).catch(() => {}); continue; }
      const mv = await p.$('button[data-move]:not([disabled])'); if (mv) { await mv.click({timeout: 1500}).catch(() => {}); continue; }
      const mb = await p.$('#msgbox'); if (mb) await mb.click().catch(() => {});
      await p.waitForTimeout(30);
    }
    console.log('  result:', await p.$eval('.result .rs', e => e.textContent).catch(() => 'none'));
    await p.click('#again'); await p.waitForTimeout(200);
  }
  console.log('errors', errs); await b.close(); })();

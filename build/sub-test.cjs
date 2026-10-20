const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
const SP = '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/';
const FMT = process.argv[2] || 'singles';
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 390, height: 844}}); await p.route(/fonts\./, r => r.abort());
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('#start');
  await p.click('[data-mode="classic"]'); await p.click(`[data-fmt="${FMT}"]`); await p.click('#start'); await p.click('[data-speed="fast"]');
  await p.waitForSelector('button[data-move]', {timeout: 30000});
  // Aegislash leads; Substitute is move 3
  await p.click('button[data-move="3"]');
  if (FMT === 'singles') await p.click('#use'); else { await p.click('#tgtpop [data-target]'); await p.waitForSelector('button[data-move]'); await p.click('button[data-move="1"]'); await p.click('#tgtpop [data-target]'); }
  for (let i = 0; i < 300 && !(await p.$('button[data-move]:not([disabled]), .result, #party')); i++) { const mb = await p.$('#msgbox'); if (mb) await mb.click().catch(() => {}); await p.waitForTimeout(40); }
  console.log('subs on screen:', (await p.$$('.spr.subst')).length);
  console.log('log tail:', (await p.$eval('#log', e => e.innerText)).split('\n').slice(-6).join(' / '));
  await p.evaluate(() => document.getElementById('battle').scrollIntoView({block: 'start'}));
  await p.screenshot({path: SP + `sub-${FMT}.png`});
  console.log('errors', errs); await b.close(); })();

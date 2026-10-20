const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
const SP = '/tmp/claude-0/-home-claude/9cbba1a6-65b3-5421-abbb-d30fa90d18f7/scratchpad/';
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 390, height: 844}}); await p.route(/fonts\./, r => r.abort());
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('#start');
  await p.click('[data-mode="classic"]'); await p.click('[data-fmt="doubles"]'); await p.click('#start');
  await p.waitForSelector('button[data-move]', {timeout: 30000});
  await p.evaluate(() => document.getElementById('battle').scrollIntoView({block: 'start'}));
  const names = await p.$$eval('button[data-move]', es => es.map(e => e.textContent.trim()));
  console.log('moves slot1:', names.join(' | '));
  for (let i = 1; i <= names.length; i++) {
    await p.click(`button[data-move="${i}"]`); await p.waitForTimeout(80);
    const info = await p.$$eval('#tgtpop .tc', es => es.map(e => (e.classList.contains('ok') ? 'OK ' : e.classList.contains('grp') ? 'GRP ' : '-- ') + e.innerText.replace(/\n/g, ' ')));
    console.log(names[i - 1], '=>', info.join(' || '));
    await p.screenshot({path: SP + `tgt-${i}.png`});
    await p.click('#tgt-cancel');
  }
  // pick move 1 target first valid, then second slot
  await p.click('button[data-move="1"]'); await p.click('#tgtpop [data-target]');
  console.log('slot2 header:', await p.$eval('.ch', e => e.innerText));
  await p.click('button[data-move="1"]'); await p.click('#tgtpop [data-target]');
  await p.waitForTimeout(500);
  console.log('choices saved:', await p.evaluate(() => Object.entries(localStorage).filter(([k]) => k.includes('current')).map(([, v]) => v).join()));
  console.log('errors', errs); await b.close(); })();

const {chromium} = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage(); await p.route(/fonts\./, r => r.abort());
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#start');
  console.log('h2s:', await p.$$eval('h2', es => es.map(e => e.textContent).join(' | ')), 'errors', errs); await b.close(); })();

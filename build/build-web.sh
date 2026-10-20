#!/bin/sh
# Builds the standalone website into web/site/ from the same sources as the Claude page.
set -e
cd /home/claude/dailyred
./build/build.sh >/dev/null
mkdir -p web/site
cp out/engine.js out/app.js out/pool.json out/desc.json out/sprites.json out/battletext.json out/front.png out/back.png web/web.js web/site/
[ -f web/config.js ] && cp web/config.js web/site/config.js || true
mkdir -p web/site/icons && cp web/icons/*.png web/site/icons/ && cp web/manifest.webmanifest web/site/
python3 - <<'P'
body = open('/home/claude/dailyred/out/index.html').read()
fb = '''<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
<script src="config.js"></script>
<script src="web.js"></script>
<script src="engine.js"></script>'''
body = body.replace('<script src="engine.js"></script>', fb)
# Offline support: register the service worker, then hand it the Google-hosted files (Firebase, fonts) this page loaded
REGISTER = '''
<script>
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(function () { return navigator.serviceWorker.ready; }).then(function (reg) {
    var send = function () {
      var urls = performance.getEntriesByType('resource').map(function (e) { return e.name; })
        .filter(function (u) { return /^https:\\/\\/(www\\.gstatic|fonts\\.googleapis|fonts\\.gstatic)\\.com\\//.test(u); });
      if (reg.active && urls.length) reg.active.postMessage({cacheUrls: urls});
    };
    if (document.readyState === 'complete') setTimeout(send, 1500); else addEventListener('load', function () { setTimeout(send, 1500); });
  }).catch(function () {});
}
</script>'''
# Pull the <title>, meta and fonts into <head>
head_parts, rest = [], []
for line in body.split('\n'):
    if line.startswith('<title>') or line.startswith('<meta name="claude') or line.startswith('<link'):
        if not line.startswith('<meta name="claude'): head_parts.append(line)
    else: rest.append(line)
html = ('<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n'
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  '<meta name="description" content="Beat Red with today\'s six. A daily Pokémon battle with friends.">\n'
  + '\n'.join(head_parts) +
  '\n<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>\n'
  '<link rel="manifest" href="manifest.webmanifest">\n'
  '<link rel="apple-touch-icon" href="icons/icon-180.png">\n'
  '<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n'
  '<meta name="apple-mobile-web-app-title" content="Daily Red">\n<meta name="apple-mobile-web-app-status-bar-style" content="default">\n'
  '<meta name="theme-color" content="#e9eef3" media="(prefers-color-scheme: light)">\n<meta name="theme-color" content="#0f151c" media="(prefers-color-scheme: dark)">\n'
  '<script>window.DR_WEB_BUILD=true</script>\n</head><body>\n' + '\n'.join(rest) + REGISTER + '\n</body></html>\n')
# Cache-busting: GitHub Pages lets browsers reuse files for 10 minutes, so give each script a version tag
import hashlib, re
def tag(name):
    return hashlib.sha1(open('/home/claude/dailyred/web/site/' + name, 'rb').read()).hexdigest()[:10]
for name in ['app.js', 'engine.js', 'web.js', 'config.js']:
    html = html.replace('src="%s"' % name, 'src="%s?v=%s"' % (name, tag(name)))
open('/home/claude/dailyred/web/site/index.html', 'w').write(html)
# Service worker: every file the game needs, under a version that changes whenever any of them does
import json
sv = json.load(open('/home/claude/dailyred/web/site/sprites.json')).get('v', '')
files = ['./', 'manifest.webmanifest', 'pool.json', 'desc.json', 'sprites.json', 'battletext.json', 'front.png?v=' + sv, 'back.png?v=' + sv,
         'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png']
files += ['%s?v=%s' % (n, tag(n)) for n in ['app.js', 'engine.js', 'web.js', 'config.js']]
version = hashlib.sha1((html + sv + ''.join(tag(f.split('?')[0]) for f in files if f != './')).encode()).hexdigest()[:10]
sw = open('/home/claude/dailyred/web/sw.template.js').read().replace('__VERSION__', version).replace('__PRECACHE__', json.dumps(files))
open('/home/claude/dailyred/web/site/sw.js', 'w').write(sw)
P
ls web/site

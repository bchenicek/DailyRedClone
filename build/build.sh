#!/bin/sh
set -e
cd /home/claude/dailyred
node build/bundle-engine.mjs
/opt/npm-tools/node_modules/.bin/esbuild src/app.ts --bundle --format=iife --target=es2020 --minify --outfile=out/app.js --log-level=warning --define:global=globalThis
cp build/pool.json build/desc.json build/sprites.json build/battletext.json assets/front.png assets/back.png out/
ls -la out

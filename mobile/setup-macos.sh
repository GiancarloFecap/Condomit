#!/usr/bin/env bash
set -euo pipefail

node --version
npm --version
npm install
npm run mobile:build

if [ ! -d android ]; then
  npx cap add android
fi
if [ ! -d ios ]; then
  npx cap add ios
fi

npm run mobile:sync
printf '\nCondomit mobile preparado.\nAndroid: npm run mobile:android\niOS: npm run mobile:ios\n'

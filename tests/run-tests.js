#!/usr/bin/env node
'use strict';
const { execSync } = require('child_process');
const path = require('path');

console.log('='.repeat(64));
console.log(' Logic Forge — Node Unit Tests (browser+Worker+Node via UMD) ');
console.log('='.repeat(64));

let failed = false;
for (const file of ['logic-engine.test.js', 'viz.test.js']) {
  console.log(`\n${'='.repeat(64)}`);
  console.log(` Running ${file}`);
  console.log('='.repeat(64));
  try {
    execSync(`node "${path.join(__dirname, file)}"`, { stdio: 'inherit', shell: true });
  } catch (e) {
    console.error(`✗ ${file} FAILED`);
    failed = true;
  }
}

console.log('\n' + '='.repeat(64));
if (failed) {
  console.error(' Some tests FAILED ✗');
  process.exit(1);
} else {
  console.log(' All tests PASSED ✔ — engine + viz verified');
  console.log('='.repeat(64));
}

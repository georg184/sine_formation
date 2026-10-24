/* Verify time integration, exact revolution boundaries and invalid restoration. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../js/core.js');
const root = path.resolve(__dirname, '..');
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-11, `${actual} != ${expected}`);
close(core.advance(0, 30, 3), Math.PI / 2);
close(core.advance(Math.PI / 2, 60, 1.5), Math.PI);
let fine = 0;
for (let frame = 0; frame < 180; frame += 1) fine = core.advance(fine, 30, 1 / 60);
close(fine, core.advance(0, 30, 3));
assert.equal(core.advance(core.END - .01, 120, 10), core.END);
assert.deepEqual(core.phase(0), {turns: 0, angle: 0});
assert.deepEqual(core.phase(core.TAU), {turns: 0, angle: core.TAU});
assert.deepEqual(core.phase(core.END), {turns: 1, angle: core.TAU});
close(core.phase(core.TAU + .3).angle, .3);
assert.deepEqual(core.validateState({schema: 1, x: Math.PI, speed: 60}), {schema: 1, x: Math.PI, speed: 60});
for (const invalid of [null, {}, {schema: 2, x: 0, speed: 30}, {schema: 1, x: -1, speed: 30}, {schema: 1, x: Infinity, speed: 30}, {schema: 1, x: 0, speed: 0}]) {
  assert.throws(() => core.validateState(invalid));
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'muweb/muweave-module.json')));
assert.equal(manifest.version, core.VERSION);
assert.equal(manifest.runtime_requirements.math, 'muweave-mathjax-4-svg-v1');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const [, url] of html.matchAll(/(?:src|href)="((?:js|css)\/[^" ]+)"/g)) assert.ok(url.endsWith(`?v=${core.VERSION}`));
assert.ok(html.includes(`window.GG_APP_VERSION = '${core.VERSION}'`));
assert.ok(fs.readFileSync(path.join(root, 'js/app.js'), 'utf8').includes(`const APP_VERSION = '${core.VERSION}'`));
console.log('Angular motion, revolution boundaries, state schema and asset versions verified.');

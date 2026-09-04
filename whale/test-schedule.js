#!/usr/bin/env node
/* 峰谷判定逻辑单测：node test-schedule.js（读取 widget.js 导出的调度函数） */
'use strict';
const assert = require('assert');
const w = require('./widget.js');

// 北京时间墙钟 → 真实 epoch(ms)。2026-09-07 = 周一；09-04 周五；09-05/06 周末。
function bjt(y, mo, d, h, mi) {
  return Date.UTC(y, mo - 1, d, h - 8, mi, 0, 0);
}

let n = 0;
function ok(name, fn) {
  fn();
  n++;
  console.log('  ok  ' + name);
}

ok('周一 09:30 = 高峰', () => assert.strictEqual(w.peakAt(new Date(bjt(2026, 9, 7, 9, 30))), true));
ok('周一 11:59 = 高峰', () => assert.strictEqual(w.peakAt(new Date(bjt(2026, 9, 7, 11, 59))), true));
ok('周一 12:00 = 谷值(午休)', () => assert.strictEqual(w.peakAt(new Date(bjt(2026, 9, 7, 12, 0))), false));
ok('周一 13:59 = 谷值(午休)', () => assert.strictEqual(w.peakAt(new Date(bjt(2026, 9, 7, 13, 59))), false));
ok('周一 14:00 = 高峰', () => assert.strictEqual(w.peakAt(new Date(bjt(2026, 9, 7, 14, 0))), true));
ok('周一 17:59 = 高峰', () => assert.strictEqual(w.peakAt(new Date(bjt(2026, 9, 7, 17, 59))), true));
ok('周一 18:00 = 谷值', () => assert.strictEqual(w.peakAt(new Date(bjt(2026, 9, 7, 18, 0))), false));
ok('周一 00:30 = 谷值(凌晨)', () => assert.strictEqual(w.peakAt(new Date(bjt(2026, 9, 7, 0, 30))), false));
ok('周六 10:00 = 谷值(周末全天)', () => assert.strictEqual(w.peakAt(new Date(bjt(2026, 9, 5, 10, 0))), false));
ok('周日 23:00 = 谷值', () => assert.strictEqual(w.peakAt(new Date(bjt(2026, 9, 6, 23, 0))), false));

function flip(now, wantAt, wantPeak) {
  const f = w.nextFlip(now);
  assert.ok(f, '存在下次变价');
  assert.strictEqual(f.realAt, wantAt, '变价时刻(ms)');
  assert.strictEqual(f.toPeak, wantPeak, '变价后是否进入高峰');
  return f;
}
ok('周一 10:00 → 12:00 变回谷值', () => flip(new Date(bjt(2026, 9, 7, 10, 0)), bjt(2026, 9, 7, 12, 0), false));
ok('周一 13:00 → 14:00 进入下午高峰', () => flip(new Date(bjt(2026, 9, 7, 13, 0)), bjt(2026, 9, 7, 14, 0), true));
ok('周一 07:00 → 09:00 进入上午高峰', () => flip(new Date(bjt(2026, 9, 7, 7, 0)), bjt(2026, 9, 7, 9, 0), true));
ok('周五 18:30 → 下周一 09:00 高峰(跨周末)', () => flip(new Date(bjt(2026, 9, 4, 18, 30)), bjt(2026, 9, 7, 9, 0), true));
ok('周日 23:00 → 下周一 09:00 高峰', () => flip(new Date(bjt(2026, 9, 6, 23, 0)), bjt(2026, 9, 7, 9, 0), true));

ok('factorText(0.5)=半价', () => assert.strictEqual(w.factorText(0.5), '半价'));
ok('factorText(1)=全价', () => assert.strictEqual(w.factorText(1), '全价'));
ok('fmtCountdown(90min)', () => assert.strictEqual(w.fmtCountdown(90 * 60000), '约 1 小时 30 分后'));

ok('自定义时段表可覆盖', () => {
  w.setCfg({ schedule: { peak: [{ weekdays: [1, 2, 3, 4, 5, 6, 7], start: '00:00', end: '23:59' }] } });
  assert.strictEqual(w.peakAt(new Date()), true);
});

console.log('\n[test-schedule] ' + n + ' checks passed');

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pm25ToAqi, summarize } from '../src/aqi.js';

test('PM2.5 -> AQI follows EPA 2024 breakpoints', () => {
  assert.equal(pm25ToAqi(0), 0);
  assert.equal(pm25ToAqi(9.0), 50);
  assert.equal(pm25ToAqi(9.1), 51);
  assert.equal(pm25ToAqi(35.4), 100);
  assert.equal(pm25ToAqi(35.5), 101);
  assert.equal(pm25ToAqi(55.49), 150); // truncated to 55.4
  assert.equal(pm25ToAqi(125.4), 200);
  assert.equal(pm25ToAqi(225.4), 300);
  assert.equal(pm25ToAqi(325.4), 500);
  assert.equal(pm25ToAqi(900), 500);
  assert.equal(pm25ToAqi(null), null);
});

test('summary takes the worst pollutant', () => {
  assert.deepEqual(summarize({ pm25: 5, voc_index: 100, nox_index: 1 }), { aqi: 28, level: 0, category: 'Good' });
  assert.equal(summarize({ pm25: 5, voc_index: 300, nox_index: 1 }).category, 'Unhealthy');
  assert.equal(summarize({ pm25: 40, voc_index: 100 }).level, 2);
  assert.equal(summarize({}).category, 'Unknown');
});

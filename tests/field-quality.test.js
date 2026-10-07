'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');

const window = {};
runInNewContext(readFileSync(resolve(__dirname, '../assets/site/field-quality.js'), 'utf8'), { window });
const { create, policy, tiers } = window.HeroFieldQuality;

function simulation() {
  const monitor = create();
  let now = 0;
  monitor.reset(now);
  let lastPaint = -Infinity;
  const advance = (duration, fps, { targetFps = 30, paced = false, allowRecovery = true, paintCost = null, paintFps = targetFps } = {}) => {
    const end = now + duration;
    const interval = 1000 / fps;
    while (now + interval <= end + .001) {
      now += interval;
      monitor.frame(now, targetFps, paced, allowRecovery);
      if (paintCost !== null && now - lastPaint + .001 >= 1000 / paintFps) {
        monitor.paint(paintCost);
        if (Number.isFinite(lastPaint)) lastPaint += Math.floor((now - lastPaint + .001) * paintFps / 1000) * 1000 / paintFps;
        else lastPaint = now;
      }
    }
  };
  return { monitor, advance, get now() { return now; }, wait(duration) { now += duration; } };
}

test('five tiers start at the second-highest and only decoration loses detail', () => {
  assert.equal(tiers.length, 5);
  assert.equal(create().current.name, 'high');
  assert.equal(tiers.filter(tier => tier.traversalOnly).length, 1);
  assert.ok(tiers[4].traversalOnly);
  for (let i = 1; i < tiers.length; i++) {
    assert.ok(tiers[i].maxDpr <= tiers[i - 1].maxDpr);
    assert.ok(tiers[i].maxNodes <= tiers[i - 1].maxNodes);
    assert.ok(tiers[i].maxEdges <= tiers[i - 1].maxEdges);
    assert.ok(tiers[i].maxPixels <= tiers[i - 1].maxPixels);
    assert.ok(tiers[i].density <= tiers[i - 1].density);
    assert.ok(tiers[i].backgroundFps <= tiers[i - 1].backgroundFps);
  }
  for (const key of ['maxDpr', 'maxPixels', 'farResolution', 'midResolution', 'backgroundFps', 'farBlur', 'midBlur', 'chatFilter']) {
    assert.equal(tiers[2][key], tiers[1][key], 'first downgrade changes density only: ' + key);
  }
});

test('warmup and isolated slow windows do not lower quality', () => {
  const sim = simulation();
  sim.advance(policy.warmupMs, 5);
  assert.equal(sim.monitor.current.name, 'high');
  sim.advance(3100, 10);
  sim.advance(6200, 60);
  sim.advance(3100, 10);
  assert.equal(sim.monitor.current.name, 'high');
});

test('one long main-thread stall cannot satisfy a sustained-slow-frame streak', () => {
  const sim = simulation();
  sim.advance(policy.warmupMs + 3100, 60);
  sim.wait(10000);
  sim.monitor.frame(sim.now);
  assert.equal(sim.monitor.current.name, 'high');
  sim.advance(6200, 60);
  sim.advance(3100, 10);
  assert.equal(sim.monitor.current.name, 'high');
});

test('sustained slow frames downgrade one tier with cooldown and a stricter last resort', () => {
  const sim = simulation();
  sim.advance(policy.warmupMs + policy.downgradeMs + 100, 10);
  assert.equal(sim.monitor.current.name, 'balanced');
  sim.advance(policy.cooldownMs - 100, 10);
  assert.equal(sim.monitor.current.name, 'balanced');
  sim.advance(policy.downgradeMs + 200, 10);
  assert.equal(sim.monitor.current.name, 'low');
  sim.advance(policy.cooldownMs + policy.downgradeMs + 100, 10);
  assert.equal(sim.monitor.current.name, 'low');
  sim.advance(policy.lastResortMs - policy.downgradeMs + 100, 10);
  assert.equal(sim.monitor.current.name, 'traversal');
  sim.advance(30000, 10);
  assert.equal(sim.monitor.current.name, 'traversal');
});

test('quality recovers conservatively without exceeding the highest tier', () => {
  const sim = simulation();
  sim.advance(policy.warmupMs + policy.downgradeMs + 200, 10);
  assert.equal(sim.monitor.current.name, 'balanced');
  sim.advance(policy.cooldownMs + policy.recoverMs - 100, 60);
  assert.equal(sim.monitor.current.name, 'balanced');
  sim.advance(1200, 60);
  assert.equal(sim.monitor.current.name, 'high');
  sim.advance(policy.cooldownMs + policy.recoverMs + 1200, 60);
  assert.equal(sim.monitor.current.name, 'full');
  sim.advance(30000, 60);
  assert.equal(sim.monitor.current.name, 'full');
});

test('30 Hz delivery is acceptable but does not justify an upgrade', () => {
  const sim = simulation();
  sim.advance(60000, 30);
  assert.equal(sim.monitor.current.name, 'high');
  assert.ok(Math.abs(sim.monitor.fps - 30) < .01);
});

test('healthy 48 Hz delivery can recover without assuming a 60 Hz display', () => {
  const sim = simulation();
  sim.advance(policy.warmupMs + policy.downgradeMs + 200, 10);
  sim.advance(policy.cooldownMs + policy.recoverMs + 1200, 48, { paintCost: 2 });
  assert.equal(sim.monitor.current.name, 'high');
  assert.ok(Math.abs(sim.monitor.fps - 48) < .01);
  assert.ok(sim.monitor.paintFps >= 29);
});

test('intentional pauses count no time, but smooth active windows can recover traversal-only quality', () => {
  const sim = simulation();
  sim.advance(60000, 10);
  assert.equal(sim.monitor.current.name, 'traversal');
  for (let i = 0; i < 16; i++) {
    sim.monitor.pause();
    sim.wait(60000);
    sim.advance(2200, 60, { allowRecovery: false });
    sim.monitor.recover(sim.now);
    if (sim.monitor.current.name === 'low') break;
  }
  assert.equal(sim.monitor.current.name, 'low');
});

test('visibility and resize resets discard old evidence and ignore the resume gap', () => {
  const sim = simulation();
  sim.advance(policy.warmupMs + 3100, 10);
  sim.wait(60000);
  sim.monitor.reset(sim.now);
  sim.advance(policy.warmupMs + 3100, 10);
  assert.equal(sim.monitor.current.name, 'high');
  sim.advance(3100, 10);
  assert.equal(sim.monitor.current.name, 'balanced');
});

test('intermediate performance clears both streaks instead of oscillating', () => {
  const sim = simulation();
  sim.advance(policy.warmupMs + 3100, 10);
  sim.advance(6200, 40);
  sim.advance(3100, 10);
  assert.equal(sim.monitor.current.name, 'high');
  sim.advance(6200, 60);
  sim.advance(6200, 40);
  assert.equal(sim.monitor.current.name, 'high');
});

test('actual paint shortfalls and expensive paints are slow even with healthy RAF delivery', () => {
  for (const options of [{ paintCost: 2, paintFps: 15 }, { paintCost: 2, paintFps: .5 }, { paintCost: 28 }]) {
    const sim = simulation();
    sim.advance(policy.warmupMs + policy.downgradeMs + 200, 60, options);
    assert.equal(sim.monitor.current.name, 'balanced');
    assert.ok(sim.monitor.fps > 50);
  }
});

test('healthy delivery alone cannot recover without paint headroom', () => {
  const sim = simulation();
  sim.advance(60000, 60, { paintCost: 20 });
  assert.equal(sim.monitor.current.name, 'high');
  assert.ok(sim.monitor.paintFps >= 29);
});

test('missing paints after paint measurement begins are overload, not healthy callback delivery', () => {
  const sim = simulation();
  sim.advance(policy.warmupMs + policy.sampleMs + 100, 60, { paintCost: 2 });
  sim.advance(policy.downgradeMs + 200, 60);
  assert.equal(sim.monitor.current.name, 'balanced');
  assert.equal(sim.monitor.paintFps, 0);
});

test('intentional 15 FPS pacing does not degrade and can recover with measured headroom', () => {
  const sim = simulation();
  sim.advance(policy.warmupMs + policy.downgradeMs + 200, 10);
  sim.advance(policy.cooldownMs + policy.downgradeMs + 200, 10);
  assert.equal(sim.monitor.current.name, 'low');
  sim.advance(policy.cooldownMs + policy.recoverMs + 1200, 15, { targetFps: 15, paced: true, paintCost: 2 });
  assert.equal(sim.monitor.current.name, 'balanced');
});

test('a paced tier with no headroom stays put rather than upgrading based on its intentional cadence', () => {
  const sim = simulation();
  sim.advance(policy.warmupMs + policy.downgradeMs + 200, 10);
  sim.advance(policy.cooldownMs + policy.downgradeMs + 200, 10);
  sim.advance(60000, 15, { targetFps: 15, paced: true, paintCost: 20 });
  assert.equal(sim.monitor.current.name, 'low');
});

test('cosmetic recovery can be deferred until a traversal has completed', () => {
  const sim = simulation();
  sim.advance(policy.warmupMs + policy.downgradeMs + 200, 10);
  sim.advance(policy.cooldownMs + policy.recoverMs + 1200, 60, { allowRecovery: false, paintCost: 2 });
  assert.equal(sim.monitor.current.name, 'balanced');
  assert.equal(sim.monitor.recover(sim.now).name, 'high');
  assert.equal(sim.monitor.recover(sim.now), null);
});

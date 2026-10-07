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
  const changes = [];
  const advance = (duration, fps, { targetFps = 30, paced = false, allowRecovery = true, paintCost = null, paintFps = targetFps } = {}) => {
    const end = now + duration;
    const interval = 1000 / fps;
    while (now + interval <= end + .001) {
      now += interval;
      const next = monitor.frame(now, targetFps, paced, allowRecovery);
      if (next) changes.push({ name: next.name, at: now });
      if (paintCost !== null && now - lastPaint + .001 >= 1000 / paintFps) {
        monitor.paint(paintCost);
        if (Number.isFinite(lastPaint)) lastPaint += Math.floor((now - lastPaint + .001) * paintFps / 1000) * 1000 / paintFps;
        else lastPaint = now;
      }
    }
  };
  return { monitor, advance, changes, get now() { return now; }, wait(duration) { now += duration; } };
}

function reachBalanced(sim) {
  sim.advance(policy.warmupMs + policy.downgradeMs + 200, 25);
  assert.equal(sim.monitor.current.name, 'balanced');
}
function reachLow(sim) {
  sim.advance(policy.warmupMs + policy.severeMs + 200, 10);
  assert.equal(sim.monitor.current.name, 'low');
}

test('five tiers start High and the ordinary first downgrade preserves density and depth', () => {
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
  for (const key of ['maxDpr', 'maxNodes', 'density', 'maxEdges', 'backgroundFps', 'farBlur', 'midBlur']) {
    assert.equal(tiers[2][key], tiers[1][key], 'first downgrade preserves: ' + key);
  }
  for (const key of ['maxPixels', 'farResolution', 'midResolution']) {
    assert.ok(tiers[2][key] < tiers[1][key], 'first downgrade reduces: ' + key);
  }
  assert.equal(tiers[2].chatFilter, 'blur(8px) saturate(1.2)');
});

test('warmup and isolated slow windows do not lower quality', () => {
  const sim = simulation();
  sim.advance(policy.warmupMs, 5);
  assert.equal(sim.monitor.current.name, 'high');
  sim.advance(policy.sampleMs + 100, 10);
  sim.advance(2 * policy.sampleMs + 100, 60);
  sim.advance(policy.sampleMs + 100, 10);
  assert.equal(sim.monitor.current.name, 'high');
});

test('one long main-thread stall cannot satisfy a sustained-slow-frame streak', () => {
  const sim = simulation();
  sim.advance(policy.warmupMs + policy.sampleMs + 100, 60);
  sim.wait(10000);
  sim.monitor.frame(sim.now);
  assert.equal(sim.monitor.current.name, 'high');
  sim.advance(2 * policy.sampleMs + 100, 60);
  sim.advance(policy.sampleMs + 100, 10);
  assert.equal(sim.monitor.current.name, 'high');
});

test('moderate overload degrades one tier at a time without a recovery-only hold blocking relief', () => {
  const sim = simulation();
  reachBalanced(sim);
  const first = sim.changes[0].at;
  sim.advance(policy.warmupMs + policy.downgradeMs + 200, 25);
  assert.equal(sim.monitor.current.name, 'low');
  assert.ok(sim.changes[1].at - first < policy.recoveryHoldMs);
  sim.advance(policy.warmupMs + policy.downgradeMs + 200, 25);
  assert.equal(sim.monitor.current.name, 'low');
  sim.advance(policy.lastResortMs - policy.downgradeMs + 200, 25);
  assert.equal(sim.monitor.current.name, 'traversal');
  assert.deepEqual(sim.changes.map(change => change.name), ['balanced', 'low', 'traversal']);
});

test('severe overload reaches meaningful relief in 2-4 seconds, then can freeze the backdrop', () => {
  const sim = simulation();
  reachLow(sim);
  assert.deepEqual(sim.changes.map(change => change.name), ['low']);
  assert.ok(sim.changes[0].at >= 2000 && sim.changes[0].at <= 4000);
  sim.advance(policy.warmupMs + policy.severeMs + 200, 10);
  assert.equal(sim.monitor.current.name, 'traversal');
  assert.ok(sim.changes[1].at - sim.changes[0].at <= 4000);
  sim.advance(30000, 10);
  assert.equal(sim.monitor.current.name, 'traversal');
});

test('quality recovers conservatively without exceeding the highest tier', () => {
  const sim = simulation();
  reachBalanced(sim);
  sim.advance(policy.recoverMs - 100, 60);
  assert.equal(sim.monitor.current.name, 'balanced');
  sim.advance(policy.warmupMs + 500, 60);
  assert.equal(sim.monitor.current.name, 'high');
  sim.advance(policy.warmupMs + policy.recoverMs + 500, 60);
  assert.equal(sim.monitor.current.name, 'full');
  const highAt = sim.changes.find(change => change.name === 'high').at;
  assert.ok(highAt - sim.changes[0].at >= policy.recoverMs);
  assert.ok(highAt - sim.changes[0].at <= 18000, 'a healthy visit recovers within 18 seconds including warm-up');
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
  reachBalanced(sim);
  sim.advance(policy.warmupMs + policy.recoverMs + 1200, 48, { paintCost: 2 });
  assert.equal(sim.monitor.current.name, 'high');
  assert.ok(Math.abs(sim.monitor.fps - 48) < .01);
  assert.ok(sim.monitor.paintFps >= 29);
});

test('intentional pauses count no time, but smooth active windows can recover traversal-only quality', () => {
  const sim = simulation();
  sim.advance(60000, 10);
  assert.equal(sim.monitor.current.name, 'traversal');
  for (let i = 0; i < 28; i++) {
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
  sim.advance(policy.warmupMs + policy.sampleMs + 100, 25);
  sim.wait(60000);
  sim.monitor.reset(sim.now);
  sim.advance(policy.warmupMs + policy.sampleMs + 100, 25);
  assert.equal(sim.monitor.current.name, 'high');
  sim.advance(2 * policy.sampleMs + 100, 25);
  assert.equal(sim.monitor.current.name, 'balanced');
});

test('intermediate performance clears both streaks instead of oscillating', () => {
  const sim = simulation();
  sim.advance(policy.warmupMs + policy.sampleMs + 100, 25);
  sim.advance(2 * policy.sampleMs + 100, 40);
  sim.advance(policy.sampleMs + 100, 25);
  assert.equal(sim.monitor.current.name, 'high');
  sim.advance(6200, 60);
  sim.advance(6200, 40);
  assert.equal(sim.monitor.current.name, 'high');
});

test('moderate draw shortfalls and expensive draws degrade even with healthy RAF delivery', () => {
  for (const options of [{ paintCost: 2, paintFps: 25 }, { paintCost: 28 }]) {
    const sim = simulation();
    sim.advance(policy.warmupMs + policy.downgradeMs + 200, 60, options);
    assert.equal(sim.monitor.current.name, 'balanced');
    assert.ok(sim.monitor.fps > 50);
  }
});

test('severe draw shortfalls and over-budget drawing bypass intermediate quality', () => {
  for (const options of [{ paintCost: 2, paintFps: 15 }, { paintCost: 2, paintFps: .5 }, { paintCost: 40 }]) {
    const sim = simulation();
    sim.advance(policy.warmupMs + policy.severeMs + 300, 60, options);
    assert.equal(sim.monitor.current.name, 'low');
    assert.ok(sim.changes[0].at <= 4000);
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
  sim.advance(policy.severeMs + 200, 60);
  assert.equal(sim.monitor.current.name, 'low');
  assert.equal(sim.monitor.paintFps, 0);
});

test('intentional 15 FPS pacing does not degrade and can recover with measured headroom', () => {
  const sim = simulation();
  reachLow(sim);
  sim.advance(policy.warmupMs + policy.recoverMs + 1200, 15, { targetFps: 15, paced: true, paintCost: 2 });
  assert.equal(sim.monitor.current.name, 'balanced');
});

test('a paced tier with no headroom stays put rather than upgrading based on its intentional cadence', () => {
  const sim = simulation();
  reachLow(sim);
  sim.advance(60000, 15, { targetFps: 15, paced: true, paintCost: 20 });
  assert.equal(sim.monitor.current.name, 'low');
});

test('cosmetic recovery can be deferred until a traversal has completed', () => {
  const sim = simulation();
  reachBalanced(sim);
  sim.advance(policy.warmupMs + policy.recoverMs + 1200, 60, { allowRecovery: false, paintCost: 2 });
  assert.equal(sim.monitor.current.name, 'balanced');
  assert.equal(sim.monitor.recover(sim.now).name, 'high');
  assert.equal(sim.monitor.recover(sim.now), null);
});

test('a failed upgrade downgrades promptly rather than waiting through a recovery hold', () => {
  const sim = simulation();
  reachBalanced(sim);
  sim.advance(policy.warmupMs + policy.recoverMs + 1200, 60);
  assert.equal(sim.monitor.current.name, 'high');
  const highAt = sim.changes.at(-1).at;
  sim.advance(policy.warmupMs + policy.severeMs + 300, 10);
  assert.equal(sim.monitor.current.name, 'low');
  assert.ok(sim.changes.at(-1).at - highAt < policy.recoveryHoldMs);
});

test('frequent long callbacks trigger a moderate downgrade despite acceptable average FPS', () => {
  const monitor = create();
  let now = policy.warmupMs;
  monitor.reset(0);
  monitor.frame(now);
  for (let i = 0; i < 130 && monitor.current.name === 'high'; i++) {
    now += i % 4 === 0 ? 60 : 16;
    monitor.frame(now);
    monitor.paint(2);
  }
  assert.equal(monitor.current.name, 'balanced');
  assert.ok(monitor.fps > policy.slowFps);
});

test('bad or intermediate evidence interrupts recovery instead of accumulating scattered healthy windows', () => {
  const sim = simulation();
  reachBalanced(sim);
  sim.advance(policy.warmupMs + policy.recoverMs / 2, 60, { paintCost: 2 });
  sim.advance(2 * policy.sampleMs + 200, 40, { paintCost: 2 });
  sim.advance(policy.recoverMs / 2 + 2000, 60, { paintCost: 2 });
  assert.equal(sim.monitor.current.name, 'balanced');
});

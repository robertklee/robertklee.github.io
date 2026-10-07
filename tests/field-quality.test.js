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
  const advance = (duration, fps) => {
    const end = now + duration;
    const interval = 1000 / fps;
    while (now + interval <= end + .001) {
      now += interval;
      monitor.frame(now);
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
    assert.ok(tiers[i].backgroundStep >= tiers[i - 1].backgroundStep);
  }
});

test('warmup and isolated slow windows do not lower quality', () => {
  const sim = simulation();
  sim.advance(policy.warmupMs, 5);
  assert.equal(sim.monitor.current.name, 'high');
  sim.advance(1100, 10);
  sim.advance(2200, 60);
  sim.advance(1100, 10);
  assert.equal(sim.monitor.current.name, 'high');
});

test('one long main-thread stall cannot satisfy a sustained-slow-frame streak', () => {
  const sim = simulation();
  sim.advance(policy.warmupMs + 1100, 60);
  sim.wait(10000);
  sim.monitor.frame(sim.now);
  assert.equal(sim.monitor.current.name, 'high');
  sim.advance(2200, 60);
  sim.advance(1100, 10);
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

test('intentional pauses count no time, but smooth active windows can recover traversal-only quality', () => {
  const sim = simulation();
  sim.advance(30000, 10);
  assert.equal(sim.monitor.current.name, 'traversal');
  for (let i = 0; i < 8; i++) {
    sim.monitor.pause();
    sim.wait(60000);
    sim.advance(2200, 60);
  }
  assert.equal(sim.monitor.current.name, 'low');
});

test('visibility and resize resets discard old evidence and ignore the resume gap', () => {
  const sim = simulation();
  sim.advance(policy.warmupMs + 2100, 10);
  sim.wait(60000);
  sim.monitor.reset(sim.now);
  sim.advance(policy.warmupMs + 2100, 10);
  assert.equal(sim.monitor.current.name, 'high');
  sim.advance(1100, 10);
  assert.equal(sim.monitor.current.name, 'balanced');
});

test('intermediate performance clears both streaks instead of oscillating', () => {
  const sim = simulation();
  sim.advance(policy.warmupMs + 2100, 10);
  sim.advance(2200, 40);
  sim.advance(2100, 10);
  assert.equal(sim.monitor.current.name, 'high');
  sim.advance(2200, 60);
  sim.advance(2200, 40);
  assert.equal(sim.monitor.current.name, 'high');
});

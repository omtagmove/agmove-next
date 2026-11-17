import test from "node:test";
import assert from "node:assert/strict";
import { sampleFlow, stageStop } from "../../product/rover/flow.js";

test("rover begins bare and finishes with the final attachment mounted", () => {
  assert.equal(sampleFlow(0).visible, false);
  assert.equal(sampleFlow(0).dock, 0);
  assert.equal(sampleFlow(1).index, 4);
  assert.equal(sampleFlow(1).dock, 1);
  assert.equal(sampleFlow(1).opacity, 1);
});
test("each stop holds the rover still while its mounted attachment works", () => {
  for (let i = 0; i < 5; i++) {
    const stop = sampleFlow(stageStop(i));
    assert.equal(stop.index, i);
    assert.equal(stop.phase, "working");
    assert.ok(stop.action > 0.98);
    for (let step = 35; step <= 71; step++) {
      const state = sampleFlow((i + step / 100) / 5);
      assert.equal(state.distance, stop.distance);
      assert.equal(state.heading, stop.heading);
      assert.equal(state.moving, 0);
      assert.equal(state.bounce, 0);
      assert.equal(state.dock, 1);
      assert.equal(state.opacity, 1);
      assert.equal(state.visible, true);
      assert.equal(state.textOpacity, 1);
    }
  }
});
test("travel is continuous across tool changes and keeps the same viewing direction", () => {
  for (let i = 1; i < 5; i++) {
    const before = sampleFlow(i / 5 - 1e-8),
      after = sampleFlow(i / 5 + 1e-8);
    for (const key of ["heading", "distance", "bounce", "roll"])
      assert.ok(Math.abs(before[key] - after[key]) < 0.0001, key);
    assert.equal(before.visible, false);
    assert.equal(after.visible, false);
    assert.equal(before.dock, 0);
    assert.equal(after.dock, 0);
  }
  const path = Array.from({ length: 1001 }, (_, i) => sampleFlow(i / 1000));
  for (let i = 1; i < path.length; i++) {
    assert.ok(path[i].distance >= path[i - 1].distance);
    assert.ok(Math.abs(path[i].bounce) < 0.027);
    assert.equal(path[i].heading, -0.35);
  }
  assert.equal(path.at(-1).distance, 48);
  assert.ok(path.some((s) => s.moving > 0.9 && Math.abs(s.bounce) > 0.005));
  assert.deepEqual(
    path.toReversed(),
    Array.from({ length: 1001 }, (_, i) => sampleFlow((1000 - i) / 1000)),
  );
});

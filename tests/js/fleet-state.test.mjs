import assert from "node:assert/strict";
import test from "node:test";
import {
  createFleetDemo,
  fleetCounts,
  commandAllowed,
  applyDemoCommand,
} from "../../home/tablet/script.js";

test("illustrative fleet begins with the requested overview and rover telemetry", () => {
  const state = createFleetDemo();
  assert.deepEqual(fleetCounts(state), { total: 8, active: 5, idle: 2, charging: 1 });
  assert.deepEqual(
    state.robots.slice(0, 3).map(({ battery, status }) => [battery, status]),
    [
      [86, "Active"],
      [64, "Idle"],
      [42, "Charging"],
    ],
  );
  assert.equal(state.reports.length, 4);
  assert.equal(state.robots[0].location, "Agricultural Zone A");
  assert.equal(state.robots[1].location, "Industrial Zone B");
});

test("start, pause and resume update only the selected rover and its report", () => {
  const state = createFleetDemo();
  const first = structuredClone(state.robots[0]);
  state.selected = 2;
  assert.equal(applyDemoCommand(state, "start", "Navigation Test"), true);
  assert.equal(state.robots[1].status, "Active");
  assert.equal(state.reports.find((r) => r.robot === 2).status, "In Progress");
  assert.equal(fleetCounts(state).active, 6);
  assert.equal(applyDemoCommand(state, "pause"), true);
  assert.equal(state.robots[1].status, "Paused");
  assert.equal(commandAllowed(state.robots[1], "start"), false);
  assert.equal(applyDemoCommand(state, "resume"), true);
  assert.equal(state.robots[1].status, "Active");
  assert.deepEqual(state.robots[0], first);
});

test("charging and invalid commands leave demonstration state unchanged", () => {
  const state = createFleetDemo();
  state.selected = 3;
  const before = structuredClone(state);
  for (const command of ["start", "pause", "resume", "return", "stop", "invalid"]) {
    assert.equal(applyDemoCommand(state, command), false);
  }
  assert.equal(applyDemoCommand(state, "locate"), true);
  assert.deepEqual(state, before);
  state.selected = 2;
  assert.equal(applyDemoCommand(state, "start", "unrecognized mission"), false);
  assert.equal(state.robots[1].status, "Idle");
});

test("returning missions resume toward base and emergency stops require a new start", () => {
  const state = createFleetDemo();
  assert.equal(applyDemoCommand(state, "return"), true);
  assert.equal(state.robots[0].status, "Returning");
  assert.equal(state.robots[0].mission, "Return to Base");
  applyDemoCommand(state, "pause");
  applyDemoCommand(state, "resume");
  assert.equal(state.robots[0].status, "Returning");
  applyDemoCommand(state, "stop");
  assert.equal(state.robots[0].status, "Stopped");
  assert.equal(state.reports[0].status, "Stopped");
  assert.equal(applyDemoCommand(state, "resume"), false);
  assert.equal(applyDemoCommand(state, "start", "Field Survey"), true);
  assert.equal(state.robots[0].status, "Active");
  assert.equal(state.robots[0].mission, "Field Survey");
});

test("separate page visits start with fresh demonstration state", () => {
  const first = createFleetDemo();
  applyDemoCommand(first, "stop");
  assert.equal(createFleetDemo().robots[0].status, "Active");
});

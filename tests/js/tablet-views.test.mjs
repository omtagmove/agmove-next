import assert from "node:assert/strict";
import test from "node:test";
import {
  createFleetDemo,
  applyDemoCommand,
  renderFleetCards,
  renderMetrics,
  renderControls,
  renderMap,
  editFarmRoute,
  renderReports,
} from "../../home/tablet/script.js";

test("fleet views retain the requested telemetry and respond to selection", () => {
  const state = createFleetDemo();
  const cards = renderFleetCards(state, false);
  assert.equal((cards.match(/class="app-rover-card/g) || []).length, 3);
  assert.match(cards, /86%/);
  assert.match(cards, /64%/);
  assert.match(cards, /42%/);
  assert.equal((renderFleetCards(state, true).match(/class="app-rover-card/g) || []).length, 8);
  state.selected = 2;
  applyDemoCommand(state, "start");
  assert.match(renderMetrics(state), /<strong>06<\/strong>/);
});

test("farm route follows click order and supports revisions per robot", () => {
  const state = createFleetDemo();
  assert.deepEqual(editFarmRoute(state, "add", 8), [8]);
  editFarmRoute(state, "add", 2);
  editFarmRoute(state, "add", 8);
  editFarmRoute(state, "add", 99);
  assert.deepEqual(state.routes[1], [8, 2]);
  const markup = renderMap(state, true);
  assert.equal((markup.match(/data-waypoint=/g) || []).length, 20);
  assert.match(markup, /Start → W08 → W02/);
  assert.match(markup, /points="65,165 320,127 220,65"/);
  state.selected = 2;
  assert.deepEqual(editFarmRoute(state, "add", 4), [4]);
  state.selected = 1;
  assert.deepEqual(editFarmRoute(state, "undo"), [8]);
  assert.deepEqual(editFarmRoute(state, "clear"), []);
  assert.deepEqual(state.routes[2], [4]);
});

test("controls and reports preserve operational state and drill-down actions", () => {
  const state = createFleetDemo();
  state.selected = 3;
  const controls = renderControls(state, "Field Survey");
  assert.match(controls, /data-command="start" disabled/);
  assert.doesNotMatch(controls, /data-command="locate" disabled/);
  assert.doesNotMatch(controls, /dialog|confirm/i);
  const reports = renderReports(state, true);
  for (const mission of [
    "Field Survey",
    "Industrial Inspection",
    "Terrain Mapping",
    "Navigation Test",
  ])
    assert.ok(reports.includes(mission));
  assert.match(reports, /24m 12s/);
  assert.match(reports, /Today, 09:42/);
  assert.match(reports, /data-report-action="manage"/);
});

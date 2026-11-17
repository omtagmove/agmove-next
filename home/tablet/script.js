/* state.js */
/** Illustrative, in-memory state only. This module never connects to hardware. */
const missionNames = [
  "Field Survey",
  "Industrial Inspection",
  "Terrain Mapping",
  "Navigation Test",
];
export function createFleetDemo() {
  const robots = [
    {
      id: 1,
      battery: 86,
      status: "Active",
      mission: "Field Survey",
      location: "Agricultural Zone A",
      x: 30,
      y: 37,
    },
    {
      id: 2,
      battery: 64,
      status: "Idle",
      mission: "None",
      location: "Industrial Zone B",
      x: 74,
      y: 45,
    },
    {
      id: 3,
      battery: 42,
      status: "Charging",
      mission: "None",
      location: "Base Station",
      x: 80,
      y: 79,
    },
    {
      id: 4,
      battery: 91,
      status: "Active",
      mission: "Terrain Mapping",
      location: "Agricultural Zone A",
      x: 43,
      y: 24,
    },
    {
      id: 5,
      battery: 73,
      status: "Active",
      mission: "Industrial Inspection",
      location: "Industrial Zone B",
      x: 84,
      y: 30,
    },
    {
      id: 6,
      battery: 68,
      status: "Active",
      mission: "Field Survey",
      location: "Agricultural Zone A",
      x: 22,
      y: 64,
    },
    { id: 7, battery: 95, status: "Idle", mission: "None", location: "Base Station", x: 72, y: 82 },
    {
      id: 8,
      battery: 78,
      status: "Active",
      mission: "Terrain Mapping",
      location: "Agricultural Zone A",
      x: 46,
      y: 63,
    },
  ].map((robot) => ({ ...robot, name: "AgMove Rover", connectivity: "Online" }));
  return {
    robots,
    selected: 1,
    routes: {},
    reports: [
      {
        mission: "Field Survey",
        robot: 4,
        status: "Completed",
        duration: "24m 12s",
        timestamp: "Today, 09:42",
      },
      {
        mission: "Industrial Inspection",
        robot: 5,
        status: "In Progress",
        duration: "12m 08s",
        timestamp: "Today, 10:18",
      },
      {
        mission: "Terrain Mapping",
        robot: 6,
        status: "Completed",
        duration: "38m 46s",
        timestamp: "Today, 09:15",
      },
      {
        mission: "Navigation Test",
        robot: 2,
        status: "Scheduled",
        duration: "—",
        timestamp: "Today, 11:00",
      },
    ],
  };
}
const robotLabel = (id) => `Robot ${String(id).padStart(2, "0")}`;
export function fleetCounts(state) {
  return {
    total: state.robots.length,
    active: state.robots.filter((r) => ["Active", "Returning"].includes(r.status)).length,
    idle: state.robots.filter((r) => ["Idle", "Paused", "Stopped"].includes(r.status)).length,
    charging: state.robots.filter((r) => r.status === "Charging").length,
  };
}
export function commandAllowed(robot, command) {
  if (command === "locate") return true;
  if (command === "start") return ["Idle", "Stopped"].includes(robot.status);
  if (command === "pause") return ["Active", "Returning"].includes(robot.status);
  if (command === "resume") return robot.status === "Paused";
  if (command === "return") return ["Active", "Idle", "Paused"].includes(robot.status);
  if (command === "stop") return ["Active", "Returning", "Paused"].includes(robot.status);
  return false;
}
export function applyDemoCommand(state, command, mission = "Field Survey") {
  const robot = state.robots.find((item) => item.id === state.selected);
  if (!robot || !commandAllowed(robot, command)) return false;
  if (command === "locate") return true;
  if (command === "start") {
    if (!missionNames.includes(mission)) return false;
    robot.status = "Active";
    robot.mission = mission;
  }
  if (command === "pause") robot.status = "Paused";
  if (command === "resume")
    robot.status = robot.mission === "Return to Base" ? "Returning" : "Active";
  if (command === "return") {
    robot.status = "Returning";
    robot.mission = "Return to Base";
  }
  if (command === "stop") robot.status = "Stopped";
  const status = {
    Active: "In Progress",
    Returning: "In Progress",
    Paused: "Paused",
    Stopped: "Stopped",
  }[robot.status];
  const existing = state.reports.find(
    (report) => report.robot === robot.id && report.mission === robot.mission,
  );
  if (existing) {
    existing.status = status;
    existing.timestamp = "Just now · demo";
  } else
    state.reports.unshift({
      mission: robot.mission,
      robot: robot.id,
      status,
      duration: "00m 00s",
      timestamp: "Just now · demo",
    });
  return true;
}

/* views/shared.js */
const tone = (status) =>
  ({
    Active: "green",
    Returning: "green",
    "In Progress": "green",
    Idle: "amber",
    Scheduled: "blue",
    Charging: "blue",
    Paused: "amber",
    Stopped: "red",
    Completed: "green",
  })[status] || "blue";
const badge = (status) => `<span class="app-badge app-${tone(status)}"><i></i>${status}</span>`;
const roverIcon =
  '<svg class="app-rover-icon" viewBox="0 0 48 32" fill="none" aria-hidden="true"><path d="M9 20V10h29v10M17 10V5h14v5M6 21h36M16 14h16"/><circle cx="12" cy="24" r="5"/><circle cx="36" cy="24" r="5"/></svg>';

/* views/fleet.js */
function renderRobotPicker(state) {
  return `<label class="app-robot-picker">Selected robot<select data-select-robot aria-label="Select a robot">${state.robots.map((r) => `<option value="${r.id}" ${r.id === state.selected ? "selected" : ""}>${robotLabel(r.id)} · ${r.status}</option>`).join("")}</select></label>`;
}
export function renderMetrics(state) {
  const counts = fleetCounts(state);
  return `<div class="app-metrics">${[
    ["Total Robots", counts.total, "neutral"],
    ["Active Robots", counts.active, "green"],
    ["Idle Robots", counts.idle, "amber"],
    ["Charging Robots", counts.charging, "blue"],
  ]
    .map(
      ([label, count, color]) =>
        `<div class="app-metric"><span><i class="app-metric-dot app-${color}"></i>${label}</span><strong>${String(count).padStart(2, "0")}</strong>${label === "Idle Robots" && state.robots.some((r) => ["Paused", "Stopped"].includes(r.status)) ? "<small>Includes paused / stopped</small>" : ""}</div>`,
    )
    .join("")}</div>`;
}
export function renderFleetCards(state, showAll) {
  const robots = showAll ? state.robots : state.robots.slice(0, 3);
  return `<section class="app-fleet-list" aria-label="Robot monitoring"><div class="app-block-heading"><h4>Your fleet</h4><button type="button" class="app-inline-button" data-show-all>${showAll ? "Show 3" : "All 8"} <span aria-hidden="true">↗</span></button></div><div class="app-rover-list">${robots.map((robot) => `<button type="button" class="app-rover-card ${robot.id === state.selected ? "is-selected" : ""}" data-select="${robot.id}" aria-pressed="${robot.id === state.selected}"><span class="app-rover-heading">${roverIcon}<span><strong>${robotLabel(robot.id)}</strong><small>${robot.name}</small></span>${badge(robot.status)}</span><span class="app-battery-line"><span>Battery</span><progress max="100" value="${robot.battery}" aria-label="${robotLabel(robot.id)} battery ${robot.battery}%"></progress><b>${robot.battery}%</b></span><span class="app-rover-location">⌖ ${robot.location}</span><span class="app-rover-mission">Mission: ${robot.mission}</span><span class="app-rover-connectivity"><i></i>${robot.connectivity}<span>View robot →</span></span></button>`).join("")}</div></section>`;
}
function renderRobotDetails(state) {
  const r = state.robots.find((robot) => robot.id === state.selected);
  return `<section class="app-robot-details" aria-label="Selected robot information"><div class="app-block-heading"><h4>${robotLabel(r.id)}</h4>${badge(r.status)}</div><p>${r.name}</p><dl><div><dt>Battery</dt><dd>${r.battery}%</dd></div><div><dt>Connectivity</dt><dd>${r.connectivity} · simulated</dd></div><div><dt>Current mission</dt><dd>${r.mission}</dd></div><div><dt>Location</dt><dd>${r.location}</dd></div></dl></section>`;
}

/* views/map.js */
const farmWaypoints = Array.from({ length: 20 }, (_, index) => ({
  id: index + 1,
  x: 120 + (index % 5) * 100,
  y: 65 + Math.floor(index / 5) * 62,
}));
export function editFarmRoute(state, action, id) {
  const route = (state.routes[state.selected] ??= []);
  if (action === "clear") route.length = 0;
  else if (action === "undo") route.pop();
  else if (
    action === "add" &&
    farmWaypoints.some((point) => point.id === id) &&
    !route.includes(id)
  )
    route.push(id);
  return route;
}
export function renderMap(state, located, large = false) {
  const route = state.routes[state.selected] || [];
  const points = route.map((id) => farmWaypoints.find((point) => point.id === id));
  const path = [{ x: 65, y: 165 }, ...points].map((point) => `${point.x},${point.y}`).join(" ");
  return `<section class="app-map-panel ${large ? "app-map-expanded" : ""}" aria-label="Farm route planner"><div class="app-block-heading"><h4>Field / Route planner</h4><span class="app-map-live"><i></i>SIMULATED</span></div>
    <div class="app-map app-farm-map ${located ? "is-located" : ""}">
      <svg class="app-map-drawing" viewBox="0 0 640 330" preserveAspectRatio="none" aria-hidden="true">
        <defs><pattern id="farm-rows" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M0 0V16" stroke="#dce2d1" stroke-width="2"/></pattern></defs>
        <path fill="#faf9f4" d="M0 0h640v330H0z"/>
        <rect x="90" y="35" width="465" height="248" rx="12" fill="#eff1e7" stroke="#bbc7ad" stroke-width="1.5"/>
        <rect x="98" y="43" width="449" height="232" rx="8" fill="url(#farm-rows)"/>
        <path d="M65 35v248" stroke="#e2dfd2" stroke-width="16"/>
        <polyline class="app-planned-route" points="${path}" fill="none" stroke="#216b57" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
      <button type="button" class="app-map-marker app-green is-selected" style="left:10.15625%;top:50%" data-select="${state.selected}" aria-label="${robotLabel(state.selected)} route start"><span>${String(state.selected).padStart(2, "0")}</span></button>
      ${farmWaypoints
        .map((point) => {
          const order = route.indexOf(point.id);
          return `<button type="button" class="app-waypoint ${order >= 0 ? "is-chosen" : ""}" style="left:${point.x / 6.4}%;top:${point.y / 3.3}%" data-waypoint="${point.id}" aria-label="Waypoint ${point.id}${order >= 0 ? `, stop ${order + 1}` : ", add to route"}" aria-pressed="${order >= 0}"><span>${order >= 0 ? order + 1 : ""}</span></button>`;
        })
        .join("")}
      <span class="app-farm-caption">FARM 01 · ${robotLabel(state.selected)}</span>
    </div>
    <div class="app-route-toolbar"><span>Click dots in travel order <b>${route.length} / 20 stops</b></span><div><button type="button" data-route-action="undo" ${route.length ? "" : "disabled"}>Undo</button><button type="button" data-route-action="clear" ${route.length ? "" : "disabled"}>Clear</button></div></div>
    <p class="app-route-sequence" aria-label="Planned route">${route.length ? `Start → ${route.map((id) => `W${String(id).padStart(2, "0")}`).join(" → ")}` : "Start at the rover. Select your first waypoint."}</p></section>`;
}

/* views/controls.js */
export function renderControls(state, selectedMission) {
  const robot = state.robots.find((item) => item.id === state.selected);
  return `<section class="app-mission-control" aria-label="Mission control"><div class="app-block-heading"><h4>Mission control <span> / ${robotLabel(robot.id)}</span></h4>${badge(robot.status)}</div><label class="app-mission-picker">Mission<select data-mission aria-label="Choose demonstration mission" ${commandAllowed(robot, "start") ? "" : "disabled"}>${missionNames.map((mission) => `<option ${mission === selectedMission ? "selected" : ""}>${mission}</option>`).join("")}</select></label><div class="app-command-grid">${[
    ["start", "▷", "Start Mission"],
    ["locate", "⌖", "Locate Robot"],
    ["pause", "Ⅱ", "Pause Mission"],
    ["resume", "↻", "Resume Mission"],
    ["return", "↙", "Return to Base"],
    ["stop", "■", "Emergency Stop"],
  ]
    .map(
      ([command, icon, label]) =>
        `<button type="button" class="app-button ${command === "start" ? "app-primary" : command === "stop" ? "app-danger" : ""}" data-command="${command}" ${commandAllowed(robot, command) ? "" : "disabled"}><span aria-hidden="true">${icon}</span>${label}</button>`,
    )
    .join(
      "",
    )}</div>${robot.status === "Charging" ? '<p class="app-control-note">Charging at base. Mission commands are unavailable.</p>' : '<p class="app-control-note">Simulation only. Controls update this demonstration.</p>'}</section>`;
}

/* views/reports.js */
export function renderReports(state, interactive) {
  return `<div class="app-reports-table-wrap" tabindex="0" role="region" aria-label="Mission activity table; scroll horizontally on smaller screens"><table class="app-reports-table"><caption class="sr-only">Illustrative mission activity, assigned robots, durations, statuses and timestamps</caption><thead><tr><th scope="col">Mission</th><th scope="col">Robot</th><th scope="col">Duration</th><th scope="col">Status</th><th scope="col">Timestamp</th><th scope="col">${interactive ? "Control" : "Map"}</th></tr></thead><tbody>${state.reports.map((report, index) => `<tr><td><strong>${report.mission}</strong></td><td>${robotLabel(report.robot)}</td><td>${report.duration}</td><td>${badge(report.status)}</td><td>${report.timestamp}</td><td><button type="button" class="app-inline-button" data-report="${index}" data-report-action="${interactive ? "manage" : "locate"}">${interactive ? (report.status === "Scheduled" ? "Start" : report.status === "In Progress" ? "Pause" : report.status === "Paused" ? "Resume" : "View robot") : "Locate ↗"}</button></td></tr>`).join("")}</tbody></table></div>`;
}

/* script.js */
/** A self-contained simulation. No API, telemetry, geolocation, or hardware access. */
function initFleetDemo() {
  const app = document.querySelector("[data-fleet-demo]");
  if (!app) return;
  const state = createFleetDemo();
  const panel = app.querySelector(".app-content");
  const tabs = [...app.querySelectorAll("[data-view]")];
  const announcement = app.querySelector(".app-announcement");
  const horizontal = matchMedia("(max-width: 700px)");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let view = "fleet",
    showAll = false,
    selectedMission = "Field Survey",
    located = false;
  const selectedRobot = () => state.robots.find((robot) => robot.id === state.selected);
  function announce(message) {
    announcement.textContent = message;
  }
  function render(keepFocus = false) {
    const focus =
      keepFocus &&
      document.activeElement?.closest(
        "[data-waypoint], [data-route-action], [data-command], [data-select], [data-show-all], [data-select-robot], [data-mission], [data-report]",
      );
    const focusSelector =
      focus &&
      (focus.dataset.waypoint
        ? `[data-waypoint="${focus.dataset.waypoint}"]`
        : focus.dataset.routeAction
          ? `[data-route-action="${focus.dataset.routeAction}"]`
          : focus.dataset.command
            ? `[data-command="${focus.dataset.command}"]`
            : focus.dataset.select
              ? `[data-select="${focus.dataset.select}"]`
              : focus.hasAttribute("data-report")
                ? `[data-report="${focus.dataset.report}"]`
                : focus.hasAttribute("data-show-all")
                  ? "[data-show-all]"
                  : focus.hasAttribute("data-mission")
                    ? "[data-mission]"
                    : "[data-select-robot]");
    tabs.forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab.dataset.view === view));
      tab.tabIndex = tab.dataset.view === view ? 0 : -1;
    });
    panel.setAttribute("aria-labelledby", `app-tab-${view}`);
    const titles = {
      fleet: ["Fleet overview", "Every robot. One clear picture."],
      missions: ["Mission control", "Plan, launch and manage your operations."],
      maps: ["Operations map", "Know where your robots are working."],
      reports: ["Mission reports", "A clear record of every operation."],
    };
    panel.innerHTML =
      `<div class="app-view-heading"><div><span class="app-breadcrumb">WORKSPACE / ${view === "fleet" ? "OVERVIEW" : view.toUpperCase()}</span><h3>${titles[view][0]}</h3><p>${titles[view][1]}</p></div><span class="app-demo-date">SESSION 01<br /><b>Product preview</b></span></div>` +
      (view === "fleet"
        ? renderMetrics(state) +
          `<div class="app-fleet-workspace">${horizontal.matches ? renderControls(state, selectedMission) + renderFleetCards(state, showAll) + renderMap(state, located) : renderFleetCards(state, showAll) + `<div class="app-map-and-controls">${renderMap(state, located)}${renderControls(state, selectedMission)}</div>`}</div>`
        : view === "maps"
          ? renderRobotPicker(state) +
            `<div class="app-maps-workspace">${renderMap(state, located, true)}<div>${renderRobotDetails(state)}${renderControls(state, selectedMission)}</div></div>`
          : view === "missions"
            ? renderRobotPicker(state) +
              `<div class="app-missions-workspace"><section class="app-activity"><div class="app-block-heading"><h4>Mission activity</h4><span>ILLUSTRATIVE</span></div>${renderReports(state, true)}</section><div>${renderRobotDetails(state)}${renderControls(state, selectedMission)}</div></div>`
            : `<div class="app-report-summary"><div><span>Recorded missions</span><strong>${String(state.reports.length).padStart(2, "0")}</strong></div><div><span>Completed</span><strong>${String(state.reports.filter((r) => r.status === "Completed").length).padStart(2, "0")}</strong></div><div><span>In progress</span><strong>${String(state.reports.filter((r) => r.status === "In Progress").length).padStart(2, "0")}</strong></div></div><section class="app-activity"><div class="app-block-heading"><h4>Mission activity</h4><span>DEMO TIMESTAMPS</span></div>${renderReports(state, false)}</section><p class="app-report-note">Mission durations, timestamps and locations are illustrative. This demo does not retrieve or record real operations.</p>`);
    if (focusSelector) {
      const target = panel.querySelector(focusSelector);
      const fallback = panel.querySelector(
        '[data-command="resume"]:not(:disabled), [data-command="pause"]:not(:disabled), [data-command="start"]:not(:disabled)',
      );
      (target && !target.disabled ? target : fallback || panel).focus({ preventScroll: true });
    }
  }
  function select(id) {
    if (!state.robots.some((r) => r.id === id)) return;
    state.selected = id;
    located = false;
    selectedMission = missionNames.includes(selectedRobot().mission)
      ? selectedRobot().mission
      : "Navigation Test";
    render(true);
    if (horizontal.matches && view === "fleet") {
      panel.scrollTop = 0;
      panel
        .querySelector(".app-mission-control button:not(:disabled)")
        ?.focus({ preventScroll: true });
    }
    announce(
      `${robotLabel(id)} selected. ${selectedRobot().status}, battery ${selectedRobot().battery} percent, ${selectedRobot().location}.`,
    );
  }
  function changeView(next) {
    if (!tabs.some((tab) => tab.dataset.view === next)) return;
    view = next;
    render();
    panel.scrollTop = 0;
  }
  function command(action) {
    const robot = selectedRobot();
    if (!commandAllowed(robot, action)) return;
    if (action === "locate") {
      located = true;
      view = "maps";
      render();
      panel.scrollTop = 0;
      panel
        .querySelector(`.app-map-marker[data-select="${state.selected}"]`)
        ?.focus({ preventScroll: true });
      announce(
        `${robotLabel(state.selected)} located in ${robot.location}. Demonstration location highlighted on the map.`,
      );
      return;
    }
    if (applyDemoCommand(state, action, selectedMission)) {
      render(true);
      announce(
        `${robotLabel(robot.id)}: ${robot.status}. ${robot.mission}. Demonstration only; no hardware command sent.`,
      );
    }
  }
  app.addEventListener("click", (event) => {
    const waypoint = event.target.closest("[data-waypoint]");
    const routeAction = event.target.closest("[data-route-action]");
    if (waypoint || routeAction) {
      const route = editFarmRoute(
        state,
        waypoint ? "add" : routeAction.dataset.routeAction,
        Number(waypoint?.dataset.waypoint),
      );
      render(true);
      announce(
        `${robotLabel(state.selected)} planned route: ${route.length ? route.map((id) => `waypoint ${id}`).join(", then ") : "empty"}.`,
      );
      return;
    }
    const tab = event.target.closest("[data-view]");
    if (tab) return changeView(tab.dataset.view);
    const robot = event.target.closest("[data-select]");
    if (robot) return select(Number(robot.dataset.select));
    const action = event.target.closest("[data-command]");
    if (action) return command(action.dataset.command);
    if (event.target.closest("[data-show-all]")) {
      showAll = !showAll;
      render(true);
      return;
    }
    const reportButton = event.target.closest("[data-report]");
    if (reportButton) {
      const report = state.reports[Number(reportButton.dataset.report)];
      state.selected = report.robot;
      selectedMission = missionNames.includes(report.mission) ? report.mission : "Field Survey";
      if (reportButton.dataset.reportAction === "locate") return command("locate");
      const action = { Scheduled: "start", "In Progress": "pause", Paused: "resume" }[
        report.status
      ];
      if (action && commandAllowed(selectedRobot(), action)) command(action);
      else {
        changeView("maps");
        panel.focus({ preventScroll: true });
      }
    }
  });
  app.addEventListener("change", (event) => {
    if (event.target.matches("[data-select-robot]")) select(Number(event.target.value));
    if (event.target.matches("[data-mission]")) selectedMission = event.target.value;
  });
  app.querySelector("[role=tablist]").addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))
      return;
    const index = tabs.indexOf(event.target);
    if (index < 0) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (index + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) + tabs.length) %
            tabs.length;
    changeView(tabs[next].dataset.view);
    tabs[next].focus({ preventScroll: true });
  });
  const tabOrientation = () =>
    app
      .querySelector("[role=tablist]")
      .setAttribute("aria-orientation", horizontal.matches ? "horizontal" : "vertical");
  horizontal.addEventListener("change", () => {
    tabOrientation();
    render(true);
  });
  tabOrientation();
  render();
  const section = app.closest(".app-showcase");
  if (!reducedMotion.matches && "IntersectionObserver" in window) {
    section.classList.add("tablet-await");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          section.classList.add("tablet-ready");
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(section);
    reducedMotion.addEventListener("change", () => {
      if (reducedMotion.matches) {
        section.classList.add("tablet-ready");
        observer.disconnect();
      }
    });
  }
}

export default initFleetDemo;

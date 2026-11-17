/** Live R3F Product checks with Chromium software WebGL. Run npm run test:rover. */
import assert from "node:assert/strict";
import { createRoverFixture } from "../fixtures/rover-glb.mjs";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const dev = process.argv.includes("--dev");
const port = 15000 + Math.floor(Math.random() * 20000);
const origin = `http://127.0.0.1:${port}`;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = await fs.mkdtemp(path.join(os.tmpdir(), "agmove-browser-check-"));
let server, browser, socket;
let checks = 0;
function pass(message) {
  checks++;
  process.stdout.write(`PASS ${message}\n`);
}

try {
  const executable =
    process.env.CHROME_BIN ||
    ["google-chrome", "chromium", "chromium-browser"]
      .map((name) => {
        try {
          return execFileSync("which", [name], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
          }).trim();
        } catch {
          return null;
        }
      })
      .find(Boolean);
  assert.ok(executable, "Install Chrome/Chromium or set CHROME_BIN to run browser checks");
  server = spawn(
    "python3",
    dev
      ? ["tools/serve.py", "--port", String(port)]
      : ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", "dist"],
    { cwd: root, stdio: "ignore" },
  );
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {
      /* Wait for the owned server. */
    }
    if (n === 99) throw Error("Local test server did not start");
    await pause(100);
  }
  browser = spawn(
    executable,
    [
      "--headless",
      "--enable-unsafe-swiftshader",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--no-sandbox",
      "--no-proxy-server",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const endpoint = await new Promise((resolve, reject) => {
    let log = "";
    const timer = setTimeout(
      () => reject(Error("Chrome did not expose a debugging endpoint")),
      15000,
    );
    browser.stderr.on("data", (chunk) => {
      log += chunk;
      const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    browser.once("exit", (code) => {
      clearTimeout(timer);
      reject(Error(`Chrome exited: ${code}`));
    });
  });
  const debugOrigin = `http://${new URL(endpoint).host}`;
  const tabs = await (await fetch(`${debugOrigin}/json`)).json();
  socket = new WebSocket(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let serial = 0;
  let documentSequence = 0;
  const pending = new Map(),
    exceptions = [],
    consoleErrors = [],
    consoleMessages = [],
    missing = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Page.domContentEventFired") documentSequence++;
    if (message.id) {
      const job = pending.get(message.id);
      if (!job) return;
      pending.delete(message.id);
      if (message.error) job.reject(Error(message.error.message));
      else job.resolve(message.result);
    }
    if (
      message.method === "Runtime.consoleAPICalled" &&
      ["error", "warn"].includes(message.params.type)
    )
      consoleMessages.push(
        message.params.args.map((arg) => arg.description || arg.value).join(" "),
      );
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error")
      consoleErrors.push(message.params.args.map((arg) => arg.description || arg.value).join(" "));
    if (message.method === "Runtime.exceptionThrown")
      exceptions.push(
        message.params.exceptionDetails.exception?.description ||
          message.params.exceptionDetails.text,
      );
    if (message.method === "Network.responseReceived") {
      const response = message.params.response;
      if (response.url.startsWith(origin) && response.status >= 400) missing.push(response.url);
    }
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++serial;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const click = (selector) =>
    evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const check = async (label, expression) => {
    assert.ok(await evaluate(`Boolean(${expression})`), label);
    pass(label);
  };
  const viewport = async (width, height = 1000) => {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 500,
    });
    await pause(100);
  };
  const motion = (value) =>
    call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value }] });
  const navigate = async (route) => {
    const before = documentSequence;
    const sameDocument = await evaluate(
      `location.href.split("#")[0] === ${JSON.stringify((origin + "/" + route).split("#")[0])}`,
    );
    const key = route.split(/[/?#]/)[0].replace(".html", "");
    const theme = key === "contact" ? "request-demo" : !key ? "home" : key;
    await call("Page.navigate", { url: origin + "/" + route });
    for (let i = 0; i < 150; i++) {
      try {
        if (
          (sameDocument || documentSequence > before) &&
          (await evaluate(
            `document.readyState !== 'loading' && !!document.querySelector('main') && document.documentElement.dataset.theme === ${JSON.stringify(theme)}`,
          ))
        )
          break;
      } catch {
        /* Navigation replaces the execution context. */
      }
      if (i === 149) throw Error(`Page did not load: ${route}`);
      await pause(70);
    }
    await evaluate("document.fonts.ready");
    await pause(100);
  };
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Network.enable");
  await motion("reduce");
  const screenshot = async (name) => {
    if (!process.env.AGMOVE_SCREENSHOT_DIR) return;
    await fs.mkdir(process.env.AGMOVE_SCREENSHOT_DIR, { recursive: true });
    const shot = await call("Page.captureScreenshot", { format: "png" });
    await fs.writeFile(
      path.join(process.env.AGMOVE_SCREENSHOT_DIR, name + ".png"),
      Buffer.from(shot.data, "base64"),
    );
  };
  await viewport(1440, 900);
  await motion("no-preference");
  await navigate("product/?rover-review=1");
  await evaluate(
    "new Promise((resolve,reject)=>{let n=0;const t=setInterval(()=>{if(document.querySelector('.rover-enable')){clearInterval(t);resolve()}else if(++n>200){clearInterval(t);reject(Error('Poster failed to initialize'))}},50)})",
  );
  const waitFor = (expression) =>
    evaluate(
      `new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(${expression}){clearInterval(timer);resolve(true)}else if(++n>600){clearInterval(timer);reject(Error('3D condition timed out'))}},50)})`,
    );
  await check(
    "Three.js stays unloaded in the automatic poster view",
    "!performance.getEntriesByType('resource').some(e=>e.name.includes('/RoverCanvas-'))",
  );
  await evaluate(
    "document.querySelector('#rover-experience').scrollIntoView({behavior:'instant'});window.scrollBy({top:220,behavior:'instant'})",
  );
  await click(".rover-enable");
  try {
    await waitFor(
      "document.querySelector('.rover-experience.is-3d canvas')&&!document.querySelector('.rover-loading')",
    );
  } catch (error) {
    process.stdout.write(
      JSON.stringify(
        {
          state: await evaluate(
            "({mode:document.querySelector('.rover-experience')?.dataset, loading:document.querySelector('.rover-loading')?.textContent, canvas:!!document.querySelector('.rover-experience canvas'), resources:performance.getEntriesByType('resource').map(e=>e.name)})",
          ),
          exceptions,
          consoleMessages,
        },
        null,
        2,
      ) + "\n",
    );
    await screenshot("rover-failure");
    throw error;
  }

  await waitFor("document.querySelector('.rover-experience').dataset.model==='model'");
  await check(
    "optimized rover model loads in the Product viewer",
    "document.querySelector('.rover-experience').dataset.model==='model'&&document.querySelector('.rover-experience canvas').width>0",
  );
  const state = () => evaluate("document.querySelector('.rover-experience').__roverReview()");
  const scrollStage = async (fraction) => {
    // Resizing changes the viewport before the debounced pin measurement completes.
    await waitFor(
      "document.querySelector('#rover-experience .pin-spacer').offsetHeight===innerHeight+Math.max(innerHeight*18,12600)",
    );
    await evaluate(
      `(()=>{const pin=document.querySelector('#rover-experience .pin-spacer');const top=pin.getBoundingClientRect().top+scrollY;scrollTo({top:top+(pin.offsetHeight-innerHeight)*${fraction},behavior:'instant'})})()`,
    );
    await pause(1000);
    try {
      await waitFor(
        `(()=>{const e=document.querySelector('.rover-experience'),s=e.__roverScroll(),r=e.__roverReview();return !s.scrubbing&&Math.abs(r.progress-s.progress)<.000002&&Math.abs(r.progress-${fraction})<.001})()`,
      );
    } catch (error) {
      process.stdout.write(
        JSON.stringify(
          {
            fraction,
            state: await state(),
            metrics: await evaluate(
              "({scroll:document.querySelector('.rover-experience').__roverScroll(),scrollY,height:innerHeight,rect:document.querySelector('#rover-experience .pin-spacer')?.getBoundingClientRect().toJSON()})",
            ),
            exceptions,
            consoleErrors,
          },
          null,
          2,
        ) + "\n",
      );
      throw error;
    }
    await pause(250);
  };
  await check(
    "3D story has no bottom progress/stage bar or poster overlays",
    "!document.querySelector('.rover-assembled')&&!document.querySelector('.is-3d .rover-stage-content')&&!document.querySelector('.is-3d .rover-navigation')&&!document.querySelector('.is-3d [role=progressbar]')",
  );
  await scrollStage(0.2 / 5);
  const beforeWheel = await state();
  await call("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: 450,
    y: 450,
    deltaX: 0,
    deltaY: 240,
  });
  await waitFor(
    `(()=>{const e=document.querySelector('.rover-experience'),s=e.__roverScroll(),r=e.__roverReview();return r.progress>${beforeWheel.progress}&&!s.scrubbing&&Math.abs(r.progress-s.progress)<.000002})()`,
  );
  const afterWheel = await state();
  assert.equal(afterWheel.index, 0);
  assert.equal(afterWheel.phase, "docking");
  assert.ok(afterWheel.dock > beforeWheel.dock && afterWheel.dock < 0.99);
  pass("a 240px mouse-wheel movement advances docking without completing the attachment change");
  await waitFor(
    "document.querySelector('.rover-farm-photo')?.complete && document.querySelector('.rover-farm-photo').naturalWidth > 0 && Number(getComputedStyle(document.querySelector('.rover-farm-backdrop')).opacity) > .99",
  );
  await check(
    "the arms stage starts with the local mango orchard photograph",
    "document.querySelector('.rover-farm-photo').getAttribute('src') === '/assets/product/mango-orchard.webp' && !document.querySelector('.rover-farm-backdrop svg')",
  );
  const backgrounds = [
    "mango-orchard",
    "vineyard-road",
    "wheat-field",
    "loading-yard",
    "distribution-floor",
  ];
  const titles = [
    "Robotic Manipulation",
    "Precision Spraying",
    "3-Point Hitch System",
    "Autonomous Payload Carrier",
    "Material Handling Tray",
  ];
  const fits = `(()=>{
    const r=s=>document.querySelector(s).getBoundingClientRect(), display=r('.rover-display'), title=r('.rover-attachment-title');
    const b=document.querySelector('.rover-experience').__roverReview().bounds;
    return document.querySelector('.is-3d canvas')&&display.top>=r('.site-header').bottom&&display.bottom<=innerHeight&&title.left>=innerWidth*.69&&title.right<=innerWidth&&title.bottom<=innerHeight-20&&title.top>=r('.site-header').bottom&&b.left>=0&&b.right+display.left<title.left&&b.top>=0&&b.bottom+display.top<=innerHeight-20&&[...document.querySelectorAll('.rover-attachment-title h3 span')].every(e=>e.scrollWidth<=e.clientWidth)&&document.documentElement.scrollWidth<=innerWidth;
  })()`;
  let previous;
  const samples = [];
  for (const [i, name] of ["arms", "spraying", "hitch", "trolley", "trey"].entries()) {
    await scrollStage((i + 0.38) / 5);
    await waitFor(
      `(()=>{const image=document.querySelector('.rover-farm-photo[data-scene="${i}"]');return image?.complete&&image.naturalWidth>0&&Number(getComputedStyle(image).opacity)>.999})()`,
    );
    await check(
      `${name} uses its matching local photo setting`,
      `document.querySelector('.rover-farm-photo[data-scene="${i}"]').getAttribute('src') === '/assets/product/${backgrounds[i]}.webp'`,
    );
    const docked = await state();
    assert.equal(docked.index, i);
    assert.equal(docked.cargoCount, i === 3 ? 6 : 0, "six cartons travel inside the trolley only");
    assert.equal(docked.rotation, -0.35);
    assert.equal(docked.world.heading, -0.35);
    assert.ok(
      docked.drawCalls < 120 && docked.triangles < 180000,
      `render budget: ${docked.drawCalls} draws, ${docked.triangles} triangles`,
    );
    assert.equal(docked.attachments.filter((a) => a.visible).length, 1);
    assert.deepEqual(docked.attachments[i].position, docked.attachments[i].mount);
    assert.ok(
      docked.attachments[i].meshes > 5 && docked.attachments[i].parent === "Rover mounting frame",
    );
    pass(`${name} docks at its fixed mount within the rendering budget`);
    assert.equal(
      await evaluate("document.querySelector('.rover-attachment-title h3').textContent"),
      titles[i],
    );
    await check(`${name} text and assembly fit below the header`, fits);
    await screenshot(`rover-${name}-docked`);
    await scrollStage((i + 0.54) / 5);
    const working = await state();
    assert.equal(working.distance, docked.distance);
    assert.equal(working.rotation, docked.rotation);
    assert.equal(working.bodyPosition[1], 0);
    assert.deepEqual(working.wheels, docked.wheels);
    assert.deepEqual(working.attachments[i].position, docked.attachments[i].position);
    assert.ok(working.actionProgress > docked.actionProgress);
    if (i === 0) {
      const joints = working.joints.filter((j) => j.index === 0);
      assert.notDeepEqual(
        joints,
        docked.joints.filter((j) => j.index === 0),
      );
      for (const role of ["baseYaw", "shoulder", "elbow", "wrist", "toolRoll"])
        assert.equal(joints.filter((j) => j.role === role).length, 2, `two ${role} joints`);
      for (const joint of joints) {
        if (["shoulder", "elbow", "wrist"].includes(joint.role))
          assert.deepEqual(
            joint.rotation.slice(0, 2),
            [0, 0],
            "hinges turn only about their visible pin axis",
          );
        if (["baseYaw", "toolRoll"].includes(joint.role))
          assert.deepEqual(
            [joint.rotation[0], joint.rotation[2]],
            [0, 0],
            "rotary flanges turn only about their shaft",
          );
      }
      const jaws = joints.filter((j) => j.role === "gripper");
      assert.equal(jaws.length, 4);
      assert.ok(
        jaws.every((j) => -j.side * j.position[0] > 0.03 && Math.abs(j.position[0]) < 0.04),
      );
      assert.ok(jaws.every((j) => j.position[1] === 0 && j.position[2] === 0));
      assert.ok(
        docked.joints
          .filter((j) => j.role === "gripper")
          .every((j) => Math.abs(j.position[0]) < 0.001),
      );
      pass("both arms rotate on their mechanical axes and close their parallel grippers");
    }
    if (i === 1) {
      assert.ok(working.actions.mist && working.actions.mistOpacity > 0.6);
      assert.notDeepEqual(working.actions.mistPoint, docked.actions.mistPoint);
      assert.notDeepEqual(
        working.joints.filter((j) => j.index === 1),
        docked.joints.filter((j) => j.index === 1),
      );
    }
    if (i === 2) assert.notDeepEqual(working.actions.hitchPin, docked.actions.hitchPin);
    if (i === 3) assert.ok(working.actions.couplingPin[1] < docked.actions.couplingPin[1]);
    if (i === 4)
      assert.ok(
        working.actions.cargoVisible && working.actions.cargoHeight < docked.actions.cargoHeight,
      );
    pass(`${name} performs its action while the rover and wheels remain stopped`);
    await screenshot(`rover-${name}-working`);
    if (samples.length) {
      assert.deepEqual(
        working.cameraPosition,
        samples[0].state.cameraPosition,
        `${name}: camera distance stays fixed`,
      );
      assert.equal(working.cameraFov, samples[0].state.cameraFov);
      assert.equal(working.cameraZoom, samples[0].state.cameraZoom);
      assert.ok(
        Math.abs(working.chassisSpan - samples[0].state.chassisSpan) < 0.01,
        `${name}: rover stays the same apparent size`,
      );
    }
    samples.push({ name, state: working });
    if (i === 1) previous = working;
  }
  assert.ok(samples[3].state.framingOffset > samples[0].state.framingOffset);
  pass(
    "the rover keeps the same size for all five attachments; only the trolley framing moves sideways",
  );
  if (process.env.AGMOVE_SCREENSHOT_DIR)
    await fs.writeFile(
      path.join(process.env.AGMOVE_SCREENSHOT_DIR, "scene-states.json"),
      JSON.stringify(samples, null, 2),
    );
  await scrollStage(0.54 / 5);
  const restoredArms = await state();
  assert.deepEqual(
    restoredArms.joints,
    samples[0].state.joints,
    "reverse restores all arm and gripper joints",
  );
  assert.deepEqual(restoredArms.attachments[0], samples[0].state.attachments[0]);
  pass("reverse scrolling restores the complete articulated arm pose");
  await scrollStage(1 / 5);
  const blend = await evaluate(
    "Number(getComputedStyle(document.querySelector('.rover-farm-photo[data-scene=\"1\"]')).opacity)",
  );
  assert.ok(blend > 0.45 && blend < 0.55, `photo crossfade at the travel midpoint: ${blend}`);
  pass("photo settings crossfade during travel instead of swapping at the stop");
  await scrollStage(1.54 / 5);
  const restored = await state();
  for (const key of [
    "attachments",
    "wheels",
    "world",
    "backgroundTransform",
    "backgroundBlend",
    "actions",
    "joints",
    "bodyPosition",
    "rotation",
  ])
    assert.deepEqual(restored[key], previous[key], `reverse restores ${key}`);
  pass("reverse scroll restores the exact wheel, world, body and attachment action state");
  await scrollStage(1.97 / 5);
  const travelling = await state();
  assert.ok(travelling.dock < 0.01 && travelling.moving > 0.8);
  assert.notDeepEqual(travelling.wheels, previous.wheels);
  assert.notEqual(travelling.backgroundTransform, previous.backgroundTransform);
  assert.notEqual(travelling.world.roadOffset, previous.world.roadOffset);
  assert.ok(
    Math.abs(travelling.bodyPosition[1]) > 0.001 && Math.abs(travelling.bodyPosition[1]) < 0.027,
  );
  pass("the rover undocks, turns its wheels and bounces gently as the photograph and road move");
  await check(
    "attachment text fades with the departing tool",
    "Number(getComputedStyle(document.querySelector('.rover-attachment-title')).opacity)<.05",
  );
  await screenshot("rover-travelling");
  await scrollStage(2.7 / 5);
  const beforeCarrier = await state();
  await scrollStage(3.38 / 5);
  const carrier = await state();
  assert.equal(carrier.rotation, beforeCarrier.rotation);
  assert.equal(carrier.world.heading, beforeCarrier.world.heading);
  pass("the carrier transition keeps the same rover flank and direction in view");
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1366, 768],
    [1280, 720],
    [1024, 768],
  ]) {
    await viewport(width, height);
    await pause(500);
    // Tall arms, the long trailer and final tray exercise the framing extremes.
    let referenceScale;
    for (const index of [0, 3, 4]) {
      await scrollStage((index + 0.54) / 5);
      const frame = await state();
      referenceScale ??= frame.chassisSpan;
      assert.ok(
        Math.abs(frame.chassisSpan - referenceScale) < 0.01,
        `${width}: attachment changes do not resize the rover`,
      );
      await check(`${width}x${height}: ${titles[index]} has no clipping or text overlap`, fits);
    }
    await screenshot(`rover-${width}x${height}`);
  }
  await viewport(1440);
  await pause(500); // Let the debounced resize refresh finish before seeking.
  await scrollStage(0.97);
  await evaluate(
    "document.querySelector('.rover-experience canvas').dispatchEvent(new Event('webglcontextlost',{cancelable:true}))",
  );
  await waitFor(
    "document.querySelector('.rover-experience.is-poster')&&!document.querySelector('#rover-experience .pin-spacer')&&!document.querySelector('.rover-experience canvas')",
  );
  await check(
    "context loss restores the poster and releases the pin",
    "document.querySelector('.rover-experience.is-poster')&&!document.querySelector('#rover-experience .pin-spacer')&&!document.querySelector('.rover-experience canvas')",
  );
  let fixtureMode = "valid";
  const intercept = async (event) => {
    const message = JSON.parse(event.data);
    if (message.method !== "Fetch.requestPaused") return;
    const { requestId, request } = message.params;
    const manifest = request.url.endsWith("rover-assets.json");
    const body = manifest
      ? Buffer.from(JSON.stringify({ model: "/models/rover.glb", implements: {} }))
      : fixtureMode === "valid"
        ? createRoverFixture()
        : Buffer.from("invalid glb");
    await call("Fetch.fulfillRequest", {
      requestId,
      responseCode: 200,
      responseHeaders: [
        { name: "Content-Type", value: manifest ? "application/json" : "model/gltf-binary" },
      ],
      body: body.toString("base64"),
    });
  };
  socket.addEventListener("message", intercept);
  await call("Fetch.enable", {
    patterns: [{ urlPattern: "*/models/rover-assets.json" }, { urlPattern: "*/models/rover.glb" }],
  });
  for (const fixture of ["valid", "invalid"]) {
    fixtureMode = fixture;
    await navigate("company/");
    await navigate("product/");
    await waitFor("document.querySelector('.rover-enable')");
    await evaluate(
      "document.querySelector('#rover-experience').scrollIntoView({behavior:'instant'});window.scrollBy({top:220,behavior:'instant'})",
    );
    await click(".rover-enable");
    await waitFor(
      "document.querySelector('.rover-experience.is-3d canvas')&&!document.querySelector('.rover-loading')",
    );
    if (fixture === "valid") {
      await waitFor("document.querySelector('.rover-experience').dataset.model==='model'");
      await check(
        "a supplied GLB replaces the placeholder",
        "document.querySelector('.rover-experience').dataset.model==='model'",
      );
    } else {
      await pause(1200);
      await check(
        "an invalid GLB retains a working placeholder",
        "document.querySelector('.rover-experience.is-3d canvas')&&document.querySelector('.rover-experience').dataset.model==='illustration'",
      );
    }
  }
  await call("Fetch.disable");
  socket.removeEventListener("message", intercept);
  await motion("reduce");
  await pause(200);
  await check(
    "reduced motion removes the WebGL canvas and ScrollTrigger pin",
    "document.querySelector('.rover-experience.is-poster')&&!document.querySelector('.rover-experience canvas')&&!document.querySelector('#rover-experience .pin-spacer')",
  );
  for (const [i, name] of ["arms", "spraying", "hitch", "trolley", "trey"].entries()) {
    await click(`.rover-stage-navigation button:nth-child(${i + 1})`);
    await waitFor(
      `document.querySelector('.rover-poster').complete&&document.querySelector('.rover-poster').naturalWidth>0&&document.querySelector('.rover-poster').getAttribute('src').endsWith('/${name}.webp')`,
    );
    assert.equal(
      await evaluate("document.querySelector('.rover-stage-panel.is-active h3').textContent"),
      titles[i],
    );
    await check(
      `reduced motion retains the static ${name} stage`,
      "!document.querySelector('.rover-farm-backdrop')&&!document.querySelector('.rover-experience canvas')&&!document.querySelector('#rover-experience .pin-spacer')",
    );
  }
  await motion("no-preference");
  await navigate("company/");
  await navigate("product/");
  await waitFor("document.querySelector('.rover-experience.is-poster')");
  await motion("reduce");
  await viewport(390);
  await navigate("company/");
  await navigate("product/");
  await waitFor("document.querySelector('.rover-static .rover-poster')");
  await check(
    "mobile uses the static poster and attachment accordion without WebGL or GSAP downloads",
    "document.querySelector('.rover-static .rover-poster').complete&&!performance.getEntriesByType('resource').some(r=>r.name.includes('/assets/product/'))&&document.querySelectorAll('.attachment-item').length===8&&!document.querySelector('#rover-experience canvas')&&!document.querySelector('.pin-spacer')&&document.documentElement.scrollWidth<=innerWidth&&!performance.getEntriesByType('resource').some(r=>/gsap|ScrollTrigger|product-3d\\/(?:mount|RoverCanvas|chunk)|\\/models\\//.test(r.name))",
  );
  await screenshot("rover-mobile-poster");
  await call("Emulation.setScriptExecutionDisabled", { value: true });
  await navigate("product/");
  await check(
    "the poster and all eight attachment descriptions remain in the no-JavaScript fallback",
    "document.querySelector('.rover-static .rover-poster').complete&&document.querySelectorAll('.attachment-item').length===8&&document.documentElement.scrollWidth<=innerWidth",
  );
  await call("Emulation.setScriptExecutionDisabled", { value: false });
  assert.deepEqual(exceptions, [], "No browser runtime exceptions");
  assert.deepEqual(consoleErrors, [], "No browser console errors");
  assert.deepEqual(missing, [], "No missing application assets");
  process.stdout.write(`\n${checks} WebGL rover checks passed.\n`);
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  browser?.kill("SIGTERM");
  server?.kill("SIGTERM");
  await pause(200);
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

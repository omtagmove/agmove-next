/** Cold Product startup regression: cache disabled, 200 ms latency, 250 KB/s, 4× CPU. */
import assert from "node:assert/strict";

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

  await call("Network.setCacheDisabled", { cacheDisabled: true });
  await call("Network.emulateNetworkConditions", {
    offline: false,
    latency: 200,
    downloadThroughput: 250000,
    uploadThroughput: 100000,
    connectionType: "cellular3g",
  });
  await call("Emulation.setCPUThrottlingRate", { rate: 4 });
  const reports = [];
  const scenarios = [
    { name: "desktop-automatic-3d", width: 1440, height: 900, hardware: true },
    { name: "desktop-poster", width: 1440, height: 900 },
    { name: "mobile-390", width: 390, height: 844 },
    { name: "reduced-motion", width: 1440, height: 900, reduced: true },
    { name: "no-webgl", width: 1440, height: 900, noWebgl: true },
    { name: "no-javascript", width: 1440, height: 900, noJs: true },
    { name: "mobile-no-javascript", width: 390, height: 844, noJs: true },
  ];
  for (const scenario of scenarios.filter(
    (s) => !process.env.STARTUP_SCENARIO || s.name === process.env.STARTUP_SCENARIO,
  )) {
    console.log("Checking", scenario.name);
    await call("Emulation.setScriptExecutionDisabled", { value: false });
    await call("Page.navigate", { url: "about:blank" });
    await pause(100);
    await viewport(scenario.width, scenario.height);
    await motion(scenario.reduced ? "reduce" : "no-preference");
    // Test-only graphics capability emulation exercises automatic startup using
    // real SwiftShader rendering. Production capability detection is untouched.
    const observer = await call("Page.addScriptToEvaluateOnNewDocument", {
      source: `
      window.__trace=[];window.__shifts=[];window.__glProbes=0;
      const originalContext=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,options){
        if(/webgl/.test(type)){
          window.__glProbes++;
          if(${!!scenario.noWebgl})return null;
          if(${!!scenario.hardware})options={...options,failIfMajorPerformanceCaveat:false};
        }
        return originalContext.call(this,type,options);
      };
      if(${!!scenario.hardware}){
        const parameter=WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter=function(key){return key===37446?'Test hardware profile':parameter.call(this,key)};
        Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});
        Object.defineProperty(navigator,'deviceMemory',{get:()=>8});
      }
      new PerformanceObserver(list=>list.getEntries().forEach(e=>{
        if(!e.hadRecentInput)window.__shifts.push({ms:Math.round(performance.now()),value:e.value,sources:e.sources.map(s=>({name:s.node?.className||s.node?.nodeName,previous:s.previousRect,current:s.currentRect}))});
      })).observe({type:'layout-shift',buffered:true});
      let last='';
      function sample(){
        const host=document.querySelector('#rover-experience'),img=host?.querySelector('.rover-poster'),box=img?.getBoundingClientRect(),canvas=host?.querySelector('canvas'),view=host?.querySelector('.rover-experience'),pin=host?.querySelector('.rover-pin');
        const row={static:!!host?.querySelector('.rover-static'),mode:view?.dataset.mode??null,ready:view?.dataset.ready??null,src:img?.getAttribute('src')??null,decoded:!!img?.complete&&!!img?.naturalWidth,posterVisible:!!box&&box.bottom>0&&box.top<innerHeight&&getComputedStyle(img).visibility!=='hidden'&&getComputedStyle(img).display!=='none',canvas:!!canvas,canvasOpacity:canvas?getComputedStyle(canvas.parentElement).opacity:null,pinHeight:pin?.getBoundingClientRect().height??null,imageRect:box?{x:box.x,y:box.y,width:box.width,height:box.height}:null};
        const key=JSON.stringify(row);if(key!==last){last=key;window.__trace.push({ms:Math.round(performance.now()),...row})}
        requestAnimationFrame(sample);
      }requestAnimationFrame(sample);
    `,
    });
    await call("Emulation.setScriptExecutionDisabled", { value: !!scenario.noJs });
    await call("Page.navigate", { url: origin + "/product/" });
    await pause(1000);
    await call("Network.clearBrowserCache");
    await call("Page.reload", { ignoreCache: true });
    for (let n = 0; n < 200; n++) {
      await pause(150);
      const done = await evaluate(
        `Boolean(document.readyState==='complete'&&${scenario.hardware ? "document.querySelector('.rover-experience[data-ready=true]')" : scenario.noJs || scenario.width < 1024 ? "document.querySelector('.rover-static .rover-poster')?.naturalWidth>0" : "document.querySelector('.rover-experience.is-poster .rover-poster')?.naturalWidth>0"})`,
      );
      if (done) break;
      if (n === 199) throw Error(scenario.name + ": startup timed out");
    }
    await pause(400);
    const result = await evaluate(
      `({trace:window.__trace||[],shifts:window.__shifts||[],glProbes:window.__glProbes||0,overflow:document.documentElement.scrollWidth>innerWidth,src:document.querySelector('.rover-poster')?.getAttribute('src'),cards:document.querySelectorAll('.rover-static-card').length,attachments:document.querySelectorAll('.attachment-item').length,resources:performance.getEntriesByType('resource').map(r=>({url:new URL(r.name).pathname,bytes:r.encodedBodySize}))})`,
    );
    if (process.env.AGMOVE_REPORT_DIR) {
      await fs.mkdir(process.env.AGMOVE_REPORT_DIR, { recursive: true });
      await fs.writeFile(
        path.join(process.env.AGMOVE_REPORT_DIR, "startup-" + scenario.name + ".json"),
        JSON.stringify(result, null, 2),
      );
    }
    assert.equal(result.overflow, false, scenario.name + ": no horizontal overflow");
    const images = new Set(
      result.trace.filter((r) => r.posterVisible && r.decoded).map((r) => r.src),
    );
    if (scenario.hardware) {
      assert.equal(images.size, 0, "Automatic 3D: no static poster is painted");
      assert.ok(
        result.trace.some((r) => r.ready === "true"),
        "Canvas waits for its model frame",
      );
      assert.ok(
        result.trace
          .filter((r) => r.pinHeight !== null)
          .every((r) => Math.abs(r.pinHeight - scenario.height) < 1),
        "3D viewer keeps its reserved height",
      );
    } else {
      assert.equal(
        result.src,
        "/implements/assembled/arms.webp",
        scenario.name + ": matching first poster",
      );
      assert.ok(
        [...images].every((src) => src === "/implements/assembled/arms.webp"),
        scenario.name + ": no image swap",
      );
      const heights = result.trace.filter((r) => r.pinHeight !== null).map((r) => r.pinHeight);
      if (heights.length)
        assert.ok(
          Math.max(...heights) - Math.min(...heights) < 1,
          scenario.name + ": viewer height is reserved",
        );
    }
    if (scenario.width < 1024) {
      assert.equal(result.glProbes, 0, "Small screens never request a WebGL context");
      assert.ok(
        !result.resources.some((r) =>
          /gsap|ScrollTrigger|product-3d\/(?:mount|RoverCanvas|chunk)|\/models\//.test(r.url),
        ),
        "Small screens never download animation or 3D code",
      );
      assert.equal(result.attachments, 8);
    }
    if (scenario.noJs) assert.equal(result.cards, 5, "No-JavaScript cards retained");
    assert.equal(
      result.shifts.reduce((sum, row) => sum + row.value, 0),
      0,
      scenario.name + ": zero startup layout shift",
    );
    reports.push({ scenario: scenario.name, ...result });
    pass(scenario.name + ": cache-disabled throttled hard reload has no flash or layout shift");
    if (process.env.AGMOVE_SCREENSHOT_DIR) {
      await evaluate(
        "document.querySelector('#rover-experience').scrollIntoView({behavior:'instant'})",
      );
      await pause(300);
      await screenshot("startup-" + scenario.name);
    }
    await call("Page.removeScriptToEvaluateOnNewDocument", { identifier: observer.identifier });
  }
  assert.deepEqual(exceptions, [], "No startup runtime exceptions");
  assert.deepEqual(missing, [], "No missing startup assets");
  assert.deepEqual(
    consoleMessages.filter((m) => !m.includes("Software WebGL")),
    [],
    "No startup console errors",
  );
  if (process.env.AGMOVE_REPORT_DIR) {
    await fs.mkdir(process.env.AGMOVE_REPORT_DIR, { recursive: true });
    await fs.writeFile(
      path.join(process.env.AGMOVE_REPORT_DIR, "startup.json"),
      JSON.stringify(reports, null, 2),
    );
  }
  console.log(`\n${checks} startup checks passed.`);
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  browser?.kill("SIGTERM");
  server?.kill("SIGTERM");
  await pause(200);
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

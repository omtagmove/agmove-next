/** Real-browser regression checks without Playwright or any runtime dependency.
 * Requires Node 22+ and Chrome/Chromium (or CHROME_BIN).
 * Use --dev to exercise the source server, --update-layout after an intended redesign.
 */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixturePath = path.join(root, "tests/fixtures/layout.json");
const update = process.argv.includes("--update-layout");
const dev = process.argv.includes("--dev");
const port = 15000 + Math.floor(Math.random() * 20000);
const origin = `http://127.0.0.1:${port}`;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = await fs.mkdtemp(path.join(os.tmpdir(), "agmove-browser-check-"));
let server, browser, socket;
const properties = [
  "display",
  "position",
  "color",
  "background-color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "padding",
  "margin",
  "border-width",
  "border-color",
  "border-radius",
  "width",
  "height",
  "grid-template-columns",
  "gap",
  "opacity",
  "visibility",
  "overflow",
  "transform",
  "text-align",
];
const routes = ["", "technology/", "company/", "careers/", "product/", "request-demo/"];
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
      "--disable-gpu",
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
    assert.ok(await evaluate(expression), label);
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
  const expected = JSON.parse(await fs.readFile(fixturePath, "utf8")),
    actualFixtures = {};
  for (const route of routes) {
    await navigate(route);
    if (route === "product/") {
      await evaluate(
        "new Promise(resolve=>{let count=0;const timer=setInterval(()=>{if(document.querySelector('#rover-experience[data-loading=false]')||++count>100){clearInterval(timer);resolve()}},50)})",
      );
    }
    await check(
      `${route || "home"} has a contextual footer and complete site navigation`,
      "document.querySelectorAll('footer').length===1&&document.querySelector('.page-footer').dataset.footerPage===document.documentElement.dataset.theme&&document.querySelectorAll('.page-footer-site a').length===6&&document.querySelector('.page-footer-site a[aria-current=page]')",
    );
    await check(
      `${route || "home"} navigation follows Home, Product, Technology, Careers, Company`,
      "[...document.querySelectorAll('.site-nav .nav-link')].map(a=>a.getAttribute('href')).join('|')==='/|/product/|/technology/|/careers/|/company/'",
    );
    await check(
      `${route || "home"} footer anchors resolve`,
      "[...document.querySelectorAll('.page-footer a[href^=\"#\"]')].every(a=>document.getElementById(a.hash.slice(1)))",
    );
    await evaluate(
      "Promise.all([...document.images].map(img => {img.loading='eager';return img.decode().catch(()=>{});})).then(()=>document.fonts.ready)",
    );
    for (const width of [1440, 390, 320]) {
      await viewport(width);
      await evaluate("window.scrollTo({top:0,behavior:'instant'})");
      await pause(80);
      const actual = await evaluate(
        `(()=>{const props=${JSON.stringify(properties)};return [...document.querySelectorAll('body,body *')].filter(e=>['BODY','HEADER','MAIN','FOOTER','SECTION','H1','H2','H3'].includes(e.tagName)).map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {tag:e.tagName,id:e.id||'',classes:typeof e.className==='string'?e.className:'',rect:[r.x,r.y,r.width,r.height].map(v=>Math.round(v*100)/100),style:Object.fromEntries(props.map(p=>[p,s.getPropertyValue(p)]))};});})()`,
      );
      const key = (route || "home") + ":" + width;
      actualFixtures[key] = actual;
      if (!update && width >= 1024) {
        assert.equal(actual.length, expected[key].length, `${key}: component count`);
        actual.forEach((element, i) => {
          const before = expected[key][i];
          assert.deepEqual(
            [element.tag, element.id, element.classes],
            [before.tag, before.id, before.classes],
            `${key}: element ${i}`,
          );
          assert.deepEqual(
            element.style,
            before.style,
            `${key}: ${element.tag}.${element.classes} styling`,
          );
          element.rect.forEach((value, axis) =>
            assert.ok(
              Math.abs(value - before.rect[axis]) <= 0.2,
              `${key}: ${element.tag}.${element.classes} geometry ${axis}: ${value} / ${before.rect[axis]}`,
            ),
          );
        });
      }
      await check(
        `${key} ${width >= 1024 ? "preserves layout and fits the viewport" : "loads without horizontal overflow"}`,
        "document.documentElement.scrollWidth<=innerWidth",
      );
    }
  }
  if (update) {
    await fs.writeFile(fixturePath, JSON.stringify(actualFixtures, null, 2) + "\n");
    pass("updated layout fixtures after the requested design change");
  }
  const screenshot = async (name) => {
    if (!process.env.AGMOVE_SCREENSHOT_DIR) return;
    await fs.mkdir(process.env.AGMOVE_SCREENSHOT_DIR, { recursive: true });
    const shot = await call("Page.captureScreenshot", { format: "png" });
    await fs.writeFile(
      path.join(process.env.AGMOVE_SCREENSHOT_DIR, name + ".png"),
      Buffer.from(shot.data, "base64"),
    );
  };
  await viewport(1440);
  await navigate("careers/");
  await check(
    "Careers footer uses the careers email and role links",
    "document.querySelector('.page-footer-contact a').getAttribute('href')==='mailto:careers@agmove.in'&&document.querySelector('.page-footer-context a[href=\"#full-time\"]')",
  );
  await evaluate("document.querySelector('.page-footer').scrollIntoView({behavior:'instant'})");
  await screenshot("careers-footer");
  await navigate("technology/");
  await evaluate("document.querySelector('.page-footer').scrollIntoView({behavior:'instant'})");
  await screenshot("technology-footer");
  await viewport(390);
  await evaluate("document.querySelector('.page-footer').scrollIntoView({behavior:'instant'})");
  await screenshot("technology-footer-mobile");
  await click(".page-footer-offices > summary");
  await check(
    "Office details expand without affecting footer navigation",
    "document.querySelector('.page-footer-offices').open&&document.querySelector('.page-footer-locations').textContent.includes('Bhosari')",
  );
  await viewport(1440);
  await navigate("technology/");
  await check(
    "Technology explains three field priorities with an original field illustration",
    "document.querySelectorAll('.fieldwork-principle').length===3&&document.querySelector('.fieldwork-map svg[role=img]')&&!document.querySelector('.technology-grid')",
  );
  await check(
    "environment showcase and scroll-driven scenes are removed",
    "!document.querySelector('.application-journey')&&!document.querySelector('.story-stage')&&!document.querySelector('.hero-points')&&!document.querySelector('.route-svg')&&!document.querySelector('main').textContent.includes('The same ambition.')",
  );
  await check(
    "Technology uses the agreed blue and off-white theme",
    "getComputedStyle(document.querySelector('.technology-intro h1 em')).color==='rgb(142, 182, 237)'&&getComputedStyle(document.querySelector('.technology-overview')).backgroundColor==='rgb(246, 247, 249)'&&getComputedStyle(document.querySelector('.technology-overview .technology-eyebrow')).color==='rgb(20, 81, 164)'",
  );
  await check(
    "RTK and runtime conditions remain visible",
    "document.querySelector('#layer-position').textContent.includes('correction availability')&&document.querySelector('.la-labels small').textContent.replace(/\\s+/g,' ').includes('Runtime varies with load, task and operating conditions.')",
  );
  await check(
    "removed mission workflow leaves a direct transition to the application CTA",
    "!document.querySelector('.technology-missions')&&!document.querySelector('.mission-steps')&&document.querySelector('.technology-overview').nextElementSibling.matches('.technology-cta')",
  );
  await check(
    "layered autonomy has five readable labels and a static reduced-motion diagram",
    "document.querySelectorAll('.la-layer').length===5&&document.querySelectorAll('.la-labels li').length===5&&[...document.querySelectorAll('.la-labels p')].every(p=>p.getBoundingClientRect().height>0)&&[...document.querySelectorAll('.la-layer')].every(g=>getComputedStyle(g).opacity==='1')&&!document.querySelector('.la-scroll')",
  );
  await check(
    "layered autonomy preserves precision, runtime, and illustrative qualifications",
    "document.querySelector('#la-description-3').textContent.replace(/\\s+/g,' ').includes('signal quality and operating conditions')&&document.querySelector('.la-labels small').textContent.replace(/\\s+/g,' ').includes('Runtime varies with load, task and operating conditions.')&&document.querySelector('.la-caption').textContent.includes('Illustrative')",
  );
  assert.deepEqual(
    await evaluate(
      "['.technology-overview','.technology-cta'].map(s=>getComputedStyle(document.querySelector(s)).backgroundPosition)",
    ),
    ["50% 0%, 50% 0%", "50% 0%, 50% 0%"],
    "Technology section backgrounds match the existing theme",
  );
  pass("Technology section backgrounds match the existing theme");
  await evaluate(
    "document.querySelector('#layered-autonomy').scrollIntoView({behavior:'instant'})",
  );
  await screenshot("autonomy-reduced-desktop");
  await motion("no-preference");
  await navigate("technology/");
  await evaluate(
    "new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(window.ScrollTrigger?.getById('layered-autonomy')){clearInterval(timer);resolve()}else if(++n>100){clearInterval(timer);reject(Error('Autonomy ScrollTrigger did not initialize'))}},50)})",
  );
  await evaluate("window.scrollTo({top:0,behavior:'instant'})");
  await pause(700);
  await check(
    "desktop autonomy starts stacked with a local GSAP ScrollTrigger",
    "document.querySelector('.la-scroll')&&Math.abs(gsap.getProperty(document.querySelector('[data-la-layer=\"0\"] .la-offset'),'y')-316)<1&&Math.abs(gsap.getProperty(document.querySelector('[data-la-layer=\"4\"] .la-offset'),'y')+316)<1",
  );
  await evaluate(
    "window.scrollTo({top:ScrollTrigger.getById('layered-autonomy').start,behavior:'instant'})",
  );
  await pause(700);
  await screenshot("autonomy-stacked");
  for (let layer = 0; layer < 5; layer++) {
    await evaluate(
      `(()=>{const t=ScrollTrigger.getById('layered-autonomy');window.scrollTo({top:t.start+(t.end-t.start)*${(1.7 + layer) / 6.2},behavior:'instant'})})()`,
    );
    await pause(750);
    await check(
      `scroll highlights autonomy layer ${layer + 1} with its label and connector`,
      `document.querySelector('#layered-autonomy').dataset.activeLayer==='${layer}'&&document.querySelectorAll('.la-layer.is-active').length===1&&document.querySelectorAll('.la-labels button[aria-pressed=true]').length===1&&getComputedStyle(document.querySelector('.la-layer.is-active .la-connector')).opacity==='1'&&Math.abs(gsap.getProperty(document.querySelector('[data-la-layer="0"] .la-offset'),'y'))<1`,
    );
    if (layer === 2) await screenshot("autonomy-exploded");
  }
  await check(
    "pinned diagram and labels fit above the caption",
    "document.querySelector('.la-labels li:last-child').getBoundingClientRect().bottom<=document.querySelector('.la-caption').getBoundingClientRect().top&&document.querySelector('.la-figure').getBoundingClientRect().bottom<=document.querySelector('.la-caption').getBoundingClientRect().top&&document.querySelector('.la-caption').getBoundingClientRect().bottom<=innerHeight",
  );
  await evaluate("document.querySelector('.la-labels button').focus({preventScroll:true})");
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "End",
    code: "End",
    windowsVirtualKeyCode: 35,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "End",
    code: "End",
    windowsVirtualKeyCode: 35,
  });
  await pause(600);
  await check(
    "autonomy layer controls support keyboard selection",
    "document.activeElement===document.querySelector('.la-labels li:last-child button')&&document.activeElement.getAttribute('aria-pressed')==='true'",
  );
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1366, 768],
    [1280, 720],
    [1101, 760],
    [1024, 768],
  ]) {
    await viewport(width, height);
    await pause(500);
    await evaluate(
      "(()=>{const t=ScrollTrigger.getById('layered-autonomy');window.scrollTo({top:t.start+(t.end-t.start)*0.6,behavior:'instant'})})()",
    );
    await pause(700);
    await screenshot(`autonomy-desktop-${width}x${height}`);
    await check(
      `${width}x${height}: enlarged artwork, heading, pause control, labels and caption fit the pinned view`,
      `(()=>{
        const rect=s=>document.querySelector(s).getBoundingClientRect();
        const heading=rect('.la-heading'), header=rect('.site-header'), caption=rect('.la-caption');
        const inner=rect('.la-inner'), list=rect('.la-labels'), pause=rect('.la-pause');
        const labels=[...document.querySelectorAll('.la-labels li')].map(e=>e.getBoundingClientRect());
        const art=[...document.querySelectorAll('.la-art')].map(e=>e.getBoundingClientRect());
        return document.querySelector('.la-scroll')&&heading.top>=header.bottom+8&&inner.left>=0&&inner.right<=innerWidth
          &&caption.bottom<=innerHeight&&pause.top>=header.bottom&&pause.bottom<=innerHeight
          &&art.every(r=>r.left>=inner.left&&r.right<list.left&&r.top>=heading.bottom&&r.bottom<=caption.top)
          &&labels.every((r,i)=>r.bottom<=caption.top&&(!i||r.top>=labels[i-1].bottom))
          &&document.documentElement.scrollWidth<=innerWidth;
      })()`,
    );
    await check(
      `${width}x${height}: connectors stay attached to the matching labels and diagram text is legible`,
      `(()=>{
        const labels=[...document.querySelectorAll('.la-labels li')];
        return [...document.querySelectorAll('.la-layer')].every(layer=>{
          const line=layer.querySelector('.la-connector path');
          const end=line.getPointAtLength(line.getTotalLength()).matrixTransform(line.getScreenCTM());
          const label=labels[Number(layer.dataset.laLayer)].getBoundingClientRect();
          return Math.abs(end.x-label.left)<1&&Math.abs(end.y-(label.top+label.height/2))<1;
        })&&[...document.querySelectorAll('.la-art-label')].every(e=>parseFloat(getComputedStyle(e).fontSize)*Math.abs(e.getScreenCTM().d)>=12);
      })()`,
    );
    if (width === 1440)
      await check(
        "desktop artwork is about 1.5 times its previous width and uses the empty space on the left",
        "(()=>{const r=document.querySelector('[data-la-layer=\"2\"] .la-art').getBoundingClientRect();return r.width>=460&&r.width<=520&&r.left<290})()",
      );
  }
  await viewport(1440);
  await click(".la-pause");
  await check(
    "pause stops layer motion and releases the scroll pin",
    "!document.querySelector('.la-playing')&&!ScrollTrigger.getById('layered-autonomy')&&document.querySelector('.la-pause').textContent==='Resume animation'",
  );
  // Small-screen scroll experiences are intentionally deferred. Verify the
  // retained static fallbacks and that no animation / 3D code is downloaded.
  for (const width of [1023, 768, 390, 320]) {
    await viewport(width, 844);
    for (const route of ["", "technology/", "product/"]) {
      await navigate(route);
      await pause(250);
      await check(
        `${width}px ${route || "home"}: loads a static layout with no overflow or heavy animation downloads`,
        "document.querySelector('main')&&document.documentElement.scrollWidth<=innerWidth&&!document.querySelector('.pin-spacer')&&!document.querySelector('#rover-experience canvas')&&!performance.getEntriesByType('resource').some(r=>/gsap|ScrollTrigger|product-3d\\/(?:mount|RoverCanvas|chunk)|\\/models\\//.test(r.name))",
      );
      if (route === "technology/") {
        await check(
          `${width}px: all five static layers and labels are visible`,
          "!document.querySelector('.la-scroll')&&!document.querySelector('.la-playing')&&[...document.querySelectorAll('.la-layer')].every(e=>getComputedStyle(e).opacity==='1')&&[...document.querySelectorAll('.la-labels p')].every(e=>e.getBoundingClientRect().height>0)",
        );
      }
    }
  }
  await motion("reduce");
  await viewport(1440);
  await navigate("technology/");
  await screenshot("technology-simple-hero");
  await evaluate(
    "document.querySelector('#technology-system').scrollIntoView({behavior:'instant'})",
  );
  await screenshot("technology-simple-features");
  await check(
    "field technology links to the attachment catalogue",
    "document.querySelector('.fieldwork-principle a').getAttribute('href')==='/product/#products'",
  );
  await viewport(390);
  await navigate("technology/#layer-position");
  await check(
    "mobile Technology stacks the fieldwork content without horizontal overflow",
    "document.querySelectorAll('.fieldwork-principle').length===3&&getComputedStyle(document.querySelector('.fieldwork-layout')).gridTemplateColumns.split(' ').length===1&&document.documentElement.scrollWidth<=innerWidth",
  );
  await screenshot("technology-simple-mobile");
  await viewport(1440);
  await call("Emulation.setScriptExecutionDisabled", { value: true });
  await navigate("technology/");
  await check(
    "all Technology content remains readable without JavaScript",
    "[...document.querySelectorAll('.fieldwork-principle')].filter(card=>card.getBoundingClientRect().height>0).length===3&&document.querySelector('.fieldwork-map svg').getBoundingClientRect().height>0",
  );
  await check(
    "autonomy has an inline exploded illustration and ordered text alternative without JavaScript",
    "document.querySelectorAll('.la-layer').length===5&&document.querySelectorAll('ol.la-labels li').length===5&&[...document.querySelectorAll('.la-layer')].every(g=>getComputedStyle(g).opacity==='1')&&[...document.querySelectorAll('.la-labels p')].every(p=>p.getBoundingClientRect().height>0)",
  );
  await call("Emulation.setScriptExecutionDisabled", { value: false });
  await motion("no-preference");
  await viewport(1440);
  await navigate("product/");
  await evaluate(
    "new Promise(resolve=>{let count=0;const timer=setInterval(()=>{if(document.querySelector('.rover-experience.is-poster')||++count>100){clearInterval(timer);resolve()}},50)})",
  );
  await check(
    "new rover story exposes five product stages",
    "document.querySelectorAll('.rover-stage-panel').length===5&&document.querySelectorAll('[data-job]').length===5",
  );
  await click('[data-job="spraying"]');
  await check(
    "poster carousel exposes spraying system",
    "document.querySelector('.rover-experience').dataset.stage==='spraying'&&document.querySelector('.rover-stage-panel.is-active').textContent.includes('Precision Spraying')",
  );
  await click('[data-job="onboard"]');
  await check(
    "poster carousel reaches the tray",
    "document.querySelector('.rover-experience').dataset.stage==='onboard'&&document.querySelector('.rover-stage-panel.is-active').textContent.includes('Tray')",
  );
  await check(
    "catalogue contains the eight requested attachments",
    "[...document.querySelectorAll('.attachment-item h3')].map(e=>e.textContent).join('|')==='Precision Spraying|3-Point Hitch System|Autonomous Payload Carrier|Material Handling Tray|Grass Cutter|Robotic Manipulation|Drone Dock|Point Marking Solution'",
  );
  await check(
    "attachment catalogue is vertical and contains no product imagery",
    "!document.querySelector('.product-track')&&!document.querySelector('.product-journey')&&!document.querySelector('.product-concepts')&&!document.querySelector('.attachment-catalogue img')",
  );
  await evaluate("document.querySelector('#products').scrollIntoView({behavior:'instant'})");
  await pause(200);
  await click("#product-3-point-hitch summary");
  await pause(100);
  await check(
    "catalogue opens details in place and closes the previous row",
    "document.querySelector('#product-3-point-hitch').open&&!document.querySelector('#product-spraying').open",
  );
  await evaluate("document.querySelector('#product-trolley summary').focus({preventScroll:true})");
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
    text: "\r",
    unmodifiedText: "\r",
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await pause(100);
  await check(
    "attachment rows remain keyboard accessible",
    "document.querySelector('#product-trolley').open&&document.activeElement.matches('#product-trolley summary')",
  );
  await screenshot("product-catalogue");
  await motion("reduce");
  await viewport(390);
  await navigate("product/#product-trolley");
  await pause(300);
  await check(
    "direct attachment links reveal their details on mobile",
    "document.querySelector('#product-trolley').open&&document.documentElement.scrollWidth<=innerWidth",
  );
  await screenshot("product-catalogue-mobile");
  await call("Emulation.setScriptExecutionDisabled", { value: true });
  await navigate("product/");
  await click("#product-grass-cutter summary");
  await check(
    "attachment catalogue works without JavaScript",
    "document.querySelectorAll('.attachment-item').length===8&&document.querySelector('#product-grass-cutter').open",
  );
  await call("Emulation.setScriptExecutionDisabled", { value: false });
  await viewport(1440);
  await navigate("request-demo/");
  await check(
    "navigation replaces Contact with Product and retains Request Demo",
    "document.querySelector('.site-nav a[href=\"/product/\"]')&&!document.querySelector('.site-nav a[href*=contact]')&&document.querySelector('.site-nav .button').getAttribute('href')==='/request-demo/'",
  );
  await navigate("contact/?ref=old-contact");
  await pause(300);
  await check(
    "old Contact URLs redirect to Request Demo",
    "location.pathname==='/request-demo/'&&location.search==='?ref=old-contact'",
  );
  await motion("reduce");
  await viewport(1440);
  await navigate("");
  await check(
    "fleet begins with 8 / 5 / 2 / 1 robots",
    "[...document.querySelectorAll('.app-metric strong')].map(e=>e.textContent).join(',')==='08,05,02,01'",
  );
  await click('.app-rover-card[data-select="2"]');
  await click('[data-command="start"]');
  await check(
    "start updates selected rover",
    "document.querySelector('.app-rover-card[data-select=\"2\"]').textContent.includes('Active')",
  );
  await click('[data-command="pause"]');
  await check(
    "pause enables resume",
    "!document.querySelector('[data-command=\"resume\"]').disabled",
  );
  await click('[data-command="resume"]');
  await click('[data-command="stop"]');
  await check(
    "emergency stop is immediate and contained",
    "document.querySelector('.app-rover-card[data-select=\"2\"]').textContent.includes('Stopped')&&!document.querySelector('dialog')",
  );
  await click('[data-command="start"]');
  await click('[data-command="return"]');
  await click('[data-command="locate"]');
  await check(
    "return and locate preserve navigation",
    "document.querySelector('#app-tab-maps').getAttribute('aria-selected')==='true'&&document.querySelector('.app-map-marker.is-selected').dataset.select==='2'&&document.querySelectorAll('[data-waypoint]').length===20",
  );
  await check(
    "map remains free of place labels",
    "!document.querySelector('.app-map-drawing text')&&!/agricultural|industrial|zone/i.test(document.querySelector('.app-map').textContent)",
  );
  await click('[data-waypoint="8"]');
  await click('[data-waypoint="2"]');
  await check(
    "waypoint clicks connect in selected order",
    "document.querySelector('.app-route-sequence').textContent==='Start → W08 → W02'&&document.querySelector('.app-planned-route').getAttribute('points')==='65,165 320,127 220,65'",
  );
  await click('[data-route-action="undo"]');
  await check(
    "undo removes the last stop",
    "document.querySelector('.app-route-sequence').textContent==='Start → W08'",
  );
  await click("#app-tab-fleet");
  await check(
    "planned route survives tab changes",
    "document.querySelector('.app-route-sequence').textContent==='Start → W08'",
  );
  await click('[data-route-action="clear"]');
  await check(
    "clear resets the route",
    "document.querySelectorAll('.app-waypoint.is-chosen').length===0&&document.querySelector('[data-route-action=clear]').disabled",
  );
  await click("#app-tab-missions");
  await click("#app-tab-reports");
  await check(
    "all mission reports are retained",
    "['Field Survey','Industrial Inspection','Terrain Mapping','Navigation Test','24m 12s'].every(t=>document.querySelector('.app-reports-table').textContent.includes(t))",
  );
  await click("#app-tab-fleet");
  await click('.app-rover-card[data-select="3"]');
  await check(
    "charging restrictions are retained",
    "[...document.querySelectorAll('[data-command]')].every(b=>b.dataset.command==='locate'?!b.disabled:b.disabled)",
  );
  await click("[data-show-all]");
  await check(
    "all eight rover cards remain available",
    "document.querySelectorAll('.app-rover-card').length===8",
  );
  await evaluate("document.querySelector('#app-tab-fleet').focus()");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight" });
  await check("tablet keyboard tabs work", "document.activeElement.id==='app-tab-missions'");
  await viewport(390);
  await click(".menu-toggle");
  await check(
    "mobile menu opens",
    "document.querySelector('.menu-toggle').getAttribute('aria-expanded')==='true'",
  );
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await check(
    "Escape closes mobile navigation",
    "document.querySelector('.menu-toggle').getAttribute('aria-expanded')==='false'",
  );
  await click("#app-tab-fleet");
  await click('.app-rover-card[data-select="1"]');
  await check(
    "mobile controls remain in the first tablet screenful",
    "document.querySelector('.app-command-grid').getBoundingClientRect().bottom<=document.querySelector('.app-content').getBoundingClientRect().bottom",
  );
  const carouselIndex = () =>
    evaluate(
      "[...document.querySelectorAll('.about-carousel-slide')].findIndex(s=>s.classList.contains('active'))",
    );
  const first = await carouselIndex();
  await click("#aboutCarousel .next");
  assert.equal(await carouselIndex(), (first + 1) % 5);
  await click("#aboutCarousel .prev");
  assert.equal(await carouselIndex(), first);
  pass("carousel next and previous preserve their behavior");
  await evaluate("document.querySelector('#aboutCarousel .next').focus()");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight" });
  assert.equal(await carouselIndex(), (first + 1) % 5);
  pass("carousel keyboard navigation works");
  await viewport(1440);
  await motion("no-preference");
  await navigate("");
  await evaluate("document.querySelector('#about').scrollIntoView({behavior:'instant'})");
  await pause(150);
  await click(".about-carousel-pause");
  const paused = await carouselIndex();
  await pause(1700);
  assert.equal(await carouselIndex(), paused);
  pass("carousel pause stops autoplay");
  await click(".about-carousel-pause");
  await evaluate("document.activeElement?.blur()");
  await pause(1750);
  assert.notEqual(await carouselIndex(), paused);
  pass("carousel autoplay resumes");
  await evaluate("document.querySelector('#environments').scrollIntoView({behavior:'instant'})");
  await pause(120);
  await click(".environment-slide");
  await pause(1650);
  await check(
    "agriculture/industry transition advances",
    "document.querySelector('.environment-slide').getAttribute('aria-pressed')==='true'",
  );
  await click(".environment-slide");
  await pause(1650);
  await check(
    "agriculture/industry transition returns",
    "document.querySelector('.environment-slide').getAttribute('aria-pressed')==='false'",
  );
  await evaluate(
    "const t=ScrollTrigger.getAll().find(t=>t.trigger.classList.contains('industry-showcase'));window.scrollTo({top:t.start+(t.end-t.start)*.5,behavior:'instant'})",
  );
  await pause(1100);
  await check(
    "applications pinning selects the middle card",
    "document.querySelector('.industry-card.is-active').id==='application-security'&&document.querySelector('.site-header').inert&&getComputedStyle(document.querySelector('.site-header')).visibility==='hidden'",
  );
  await evaluate("document.querySelector('#control-app').scrollIntoView({behavior:'instant'})");
  await pause(1200);
  await check(
    "tablet settles straight-on and header returns",
    "getComputedStyle(document.querySelector('.control-tablet')).transform==='none'&&!document.querySelector('.site-header').inert",
  );
  await motion("reduce");
  await navigate("careers/");
  await click(".career-role summary");
  await check(
    "careers disclosures still open",
    "document.querySelector('.career-role details').open",
  );
  await navigate("request-demo/");
  await check(
    "Request Demo messaging is available without a query flag",
    "document.querySelector('#form-status').textContent.includes('Request a demo')",
  );
  await evaluate(
    "document.querySelector('[name=name]').value='Test Operator';document.querySelector('[name=email]').value='operator@example.com';document.querySelector('[name=organization]').value='Demo';document.querySelector('[name=message]').value='Test enquiry';",
  );
  await check(
    "demo form validation still works",
    "document.querySelector('#demo-form').checkValidity()",
  );
  await navigate("technology.html?ref=cleanup#architecture");
  await pause(500);
  await check(
    "legacy technology redirect preserves query and fragment",
    "location.pathname==='/technology/'&&location.search==='?ref=cleanup'&&location.hash==='#architecture'",
  );
  await navigate("product.html?ref=cleanup#application-mining");
  await pause(500);
  await check(
    "legacy product redirect opens Product and retains its fragment",
    "location.pathname==='/product/'&&location.search==='?ref=cleanup'&&location.hash==='#application-mining'",
  );
  await call("Network.setBlockedURLs", { urls: ["*gsap.min.js", "*ScrollTrigger.min.js"] });
  await motion("no-preference");
  await navigate("technology/");
  await pause(200);
  await click(".la-labels li:nth-child(2) button");
  await check(
    "autonomy remains readable and selectable when animation libraries are unavailable",
    "!document.querySelector('.la-scroll')&&document.querySelector('#layered-autonomy').dataset.activeLayer==='1'&&document.querySelectorAll('.la-labels p').length===5&&[...document.querySelectorAll('.la-layer')].every(g=>getComputedStyle(g).display!=='none')",
  );
  await motion("reduce");
  await navigate("");
  await check(
    "site remains readable without animation libraries",
    "!document.querySelector('.industry-enhanced')&&!document.querySelector('.environment-split.is-enhanced')&&document.querySelectorAll('.industry-card').length===9&&document.querySelector('.app-metrics')",
  );
  await call("Network.setBlockedURLs", { urls: [] });
  assert.deepEqual(exceptions, [], "No browser runtime exceptions");
  assert.deepEqual(consoleErrors, [], "No browser console errors");
  assert.deepEqual(missing, [], "No missing local assets");
  pass(
    `completed ${dev ? "source-server" : "production"} regression checks without runtime errors or missing assets`,
  );
  process.stdout.write(`\n${checks} browser checks passed.\n`);
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  browser?.kill("SIGTERM");
  server?.kill("SIGTERM");
  await pause(200);
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

# AgMove Robotics website

Six static HTML pages with a React / Three.js Product island. Node and Python are development tools; deploy only `dist/`.

## Develop

Requires Node 22+, npm and Python 3.9+. The `.nvmrc` selects Node 24 for development (`nvm use` if you use nvm). Chrome/Chromium is needed for browser checks. Python tools use only the standard library.

```sh
npm ci
npm run dev             # http://127.0.0.1:4173
```

Edit the source and refresh. After changing Product JSX, run `npm run build:rover` before refreshing. Use the preview server instead of opening HTML files directly: it embeds the homepage tablet fragment and the Product startup script.

```text
home/                   Homepage HTML, CSS and JS
  tablet/               Interactive fleet demonstration fragment
technology/             Technology content and layered-autonomy SVG/CSS/JS
company/                Company page
careers/                Careers page
product/                Product introduction, viewer and attachment accordion
  rover/                React / Three.js source and isolated viewer styles
request-demo/           Demo enquiry form
shared/                 Navigation, footer and shared styles
assets/                 All source runtime assets
  brand/                Logo, favicon and color filters
  careers/              Workshop photo and attribution
  fonts/                Local fonts and license notices
  home/                 Hero, environment and application photos
  implements/assembled/ Five optimized attachment poster images
  models/               Final optimized rover.glb and generated asset manifest
  product/              Five work-setting photographs and source credits
  product-3d/           Generated bundles, startup script and build report
  robots/               Rover photos used by the site
  terrain/              Original SVG backgrounds
  vendor/               GSAP, ScrollTrigger and license notices
tools/                 Build, preview, validation and test-covered asset utilities
tests/                 Unit, browser, WebGL and startup regression checks
```

Each page owns its navigation, content and footer. The homepage embeds `home/tablet/index.html` once at `<!-- tablet-showcase -->`. The build embeds the tiny Product capability check at `<!-- rover-startup -->`, before the body can paint. Public asset URLs remain `/assets/…`, `/implements/assembled/…` and `/models/…`; preview and build map the last two to their folders under `assets/`.

Technology contains the enlarged layered-autonomy illustration, three field priorities and the application CTA. Product contains five animated configurations and eight native attachment disclosures. Keep RTK accuracy and battery-runtime qualifications alongside their claims. The fleet dashboard uses demonstration data; the enquiry form opens an email draft and does not submit to a server.

## Responsive behavior and fallbacks

At **1024px and above**, Product retains its five-stage scroll-driven 3D experience and Technology uses GSAP ScrollTrigger for layered autonomy. The homepage also loads GSAP only at these widths. Below **1024px**, Product keeps the static first poster and the native eight-item attachment accordion; Technology shows the static exploded SVG and all five text labels. These small-screen layouts download no React island, Three.js, GSAP, ScrollTrigger or rover model and create no WebGL context. They are the starting point for later mobile work.

Reduced motion, unsupported graphics and no JavaScript retain readable fallbacks. An automatic desktop 3D start hides the static viewer before first paint, reserves its height, and fades in the canvas only after the model (or its error fallback) has rendered. The static first poster matches React's initial `arms.webp` poster, preventing an image swap in poster mode. Failed startup restores the HTML fallback. See [Product implementation notes](product/rover/README.md).

## Build and verify

```sh
npm run build           # Generate and validate the deployable dist/ folder
npm run preview         # Serve dist/ at http://127.0.0.1:4174
npm run check           # Source markup, references and JS syntax
npm test                # 12 JavaScript + 5 Python unit tests
npm run test:browser    # Desktop layouts/interactions and small-screen smoke checks
npm run test:rover      # Actual WebGL rendering, attachment motion and model fallback
npm run test:startup    # Cache-disabled, throttled hard-reload flash and layout checks
npm run format:check   # Source formatting
npm run assets:terrain # Regenerate SVG backgrounds
```

`npm test` and `npm run check` generate the Product bundles automatically, so both work immediately after `npm ci` in a fresh checkout.

Set `CHROME_BIN` if Chrome/Chromium is not on PATH. `node tests/browser/check.mjs --dev` checks source preview. `AGMOVE_SCREENSHOT_DIR` saves optional browser screenshots; `AGMOVE_REPORT_DIR` saves startup traces. Use paths under the ignored `artifacts/` directory for local reports. Small-screen tests cover loading, overflow, errors and absence of heavy downloads; they intentionally no longer test mobile scroll/pin/tap animation. Desktop layout, connector, keyboard and WebGL assertions remain strict, including the 1024px boundary.

The build copies an explicit list of browser source files, retained runtime assets, generated bundle outputs and required licenses. It never publishes JSX, source images, conversion experiments, tests, documentation, build reports or original CAD/KeyShot files. Generated files are replaced atomically and only build-owned output directories may be replaced. Deploy `dist/` at the website root; keep `node_modules/` and the source tree off the public server.

```text
dist/
  index.html
  home/                 HTML, CSS, JS and the tablet's CSS/JS
  technology/           HTML, CSS, JS and autonomy CSS/JS
  company/ careers/ request-demo/
  product/              HTML, CSS, JS and rover/style.css
  shared/               CSS and navigation JS
  assets/               Runtime imagery, fonts, terrain, libraries and JS bundles
  implements/assembled/ Optimized WebP posters
  models/               rover.glb and rover-assets.json
  contact/index.html    Compatibility redirect
  company.html product.html technology.html contact.html
  .agmove-build.json    Safe-build ownership marker
```

The navbar order is Home → Product → Technology → Careers → Company, followed by Request a Demo. Navigation uses consistent trailing slashes. Compatibility redirects preserve query strings and fragments. Font and library licenses and image attribution records remain with their source assets; required license notices are included in `dist/`.

## Git and deployment

Commit source pages, styles, scripts, tests, tools, `package.json`, `package-lock.json` and the optimized assets under `assets/`, including `assets/models/rover.glb`. The lockfile pins the dependency tree; use `npm ci` after cloning. These files fit in regular Git without Git LFS.

The `.gitignore` excludes installed dependencies, `dist/`, generated Product bundles and the generated model manifest, caches, local reports, environment files, credentials and original CAD exports. These exclusions keep local working files out of commits; the build recreates all required generated files. Keep license notices and image credits with the assets. The site requires no environment variables or secrets to run.

For a new empty remote repository, replace `YOUR_REPOSITORY_URL` with its URL and run these commands from this folder after committing your changes:

```sh
git remote add origin YOUR_REPOSITORY_URL
git push -u origin main
```

Upload the Git repository to your Git host; deploy the generated `dist/` folder to your web host. A fresh clone can generate it with `npm ci` followed by `npm run build`. No Git remote or hosting account is configured by the project.

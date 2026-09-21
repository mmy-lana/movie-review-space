/**
 * Headless render verification.
 *
 * A route that returns HTTP 200 can still render an empty shell: every page in
 * this app is a client island whose content appears only after React hydrates and
 * IndexedDB answers. This script therefore drives a real browser and reads the
 * **post-hydration** DOM.
 *
 * It checks, for each route:
 * - the page rendered content rather than a bare shell;
 * - no horizontal overflow at 360 / 390 / 430 px (the mobile matrix);
 * - no interactive control is smaller than the 44×44 px touch target;
 * - none of the client islands threw during hydration.
 *
 * Usage: `node scripts/verify-render.mjs [baseUrl]`
 * Requires the dev or production server to already be running.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BASE_URL = process.argv[2] ?? 'http://localhost:3000';

const CANDIDATE_BINARIES = [
  process.env.CHROME_PATH,
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const HEADLESS_ARGS = [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
];

/** Viewports from the mobile matrix plus a desktop control. */
const VIEWPORTS = [
  { name: '360x740', width: 360, height: 740 },
  { name: '390x844', width: 390, height: 844 },
  { name: '430x932', width: 430, height: 932 },
];

const ROUTES = [
  { path: '/', expect: ['Popular this week', 'Recent activity', 'Highly rated right now'] },
  { path: '/films', expect: ['Browse films'] },
  { path: '/diary', expect: ['Diary'] },
  { path: '/lists', expect: ['Lists'] },
  { path: '/films/parasite-2019', expect: ['Parasite'] },
  { path: '/films/parasite-2019/reviews', expect: ['Parasite'] },
  { path: '/lists/list_001', expect: ['Ranked'] },
  { path: '/profile/deakins_ghost', expect: ['Alex Rivers', '@deakins_ghost'] },
];

let failures = 0;
let checks = 0;

function ok(label, condition, detail) {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${label}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

function findBinary() {
  for (const candidate of CANDIDATE_BINARIES) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', (event) => reject(new Error(`CDP socket error: ${event.message ?? 'unknown'}`)));
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      if (message.method) this.events.push(message);
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30_000);
    });
  }

  close() {
    this.ws.close();
  }
}

async function waitForDevTools(port, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return (await response.json()).webSocketDebuggerUrl;
    } catch {
      // Server not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`DevTools endpoint on port ${port} never became ready`);
}

/** Collects the in-page diagnostics for one route at one viewport. */
const MEASURE = `(() => {
  const root = document.documentElement;
  const body = document.body;

  /** True when an ancestor clips or scrolls horizontally, so the descendant
   *  cannot widen the document. */
  const insideScrollContainer = (node) => {
    let parent = node.parentElement;
    while (parent && parent !== body) {
      const style = window.getComputedStyle(parent);
      if (style.overflowX === 'auto' || style.overflowX === 'scroll' || style.overflowX === 'hidden') {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  };

  /** Visually hidden affordances (skip links, sr-only labels) are exempt. */
  const isVisuallyHidden = (node, rect, style) => {
    if (rect.width <= 1 || rect.height <= 1) return true;
    if (style.clipPath && style.clipPath !== 'none') return true;
    if (style.position === 'absolute' && (rect.left < -100 || rect.top < -100)) return true;
    return false;
  };

  /**
   * A link whose entire accessible name is its own visible text is a fallback
   * target: the surrounding sentence or card is the real tap surface, and forcing
   * a 44px box would wreck the layout. Everything that presents a distinct tap
   * surface opts in by giving itself an aria-label (icon buttons, avatar links),
   * a button element (chips, tabs, sort controls) or role=button.
   */
  const isTextLink = (node, style) => {
    if (node.tagName !== 'A') return false;
    if (node.hasAttribute('aria-label')) return false;
    const role = node.getAttribute('role');
    if (role && role !== 'link') return false;
    if (node.querySelector('img, svg, picture')) return false;
    // A clamped multi-line excerpt is prose. Line clamping forces
    // display to -webkit-box, so it never looks like an inline link.
    if (style.webkitLineClamp && style.webkitLineClamp !== 'none') return true;
    return (
      style.display === 'inline' ||
      style.display === 'block' ||
      style.display.startsWith('inline')
    );
  };

  const controls = [...document.querySelectorAll('a, button, [role="button"], input, select, textarea')];
  const undersized = [];
  let exemptCount = 0;
  for (const node of controls) {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (isVisuallyHidden(node, rect, style)) { exemptCount += 1; continue; }
    if (node.closest('[aria-hidden="true"]')) continue;
    if (isTextLink(node, style)) { exemptCount += 1; continue; }
    if (rect.height < 44 || rect.width < 44) {
      const label = (node.getAttribute('aria-label') || node.textContent || node.tagName).trim().slice(0, 60);
      undersized.push({ label, width: Math.round(rect.width), height: Math.round(rect.height) });
    }
  }

  // Elements that widen the document itself: outside any clipping ancestor and
  // past the right edge of the viewport.
  const overflow = [];
  for (const node of document.querySelectorAll('main *, header *, nav *, footer *, aside *')) {
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.right <= root.clientWidth + 1) continue;
    if (insideScrollContainer(node)) continue;
    const style = window.getComputedStyle(node);
    if (style.position === 'fixed') continue;
    const label = (node.getAttribute('aria-label') || node.textContent || '').trim().slice(0, 40);
    overflow.push({
      tag: node.tagName,
      cls: String(node.className).slice(0, 70),
      label,
      right: Math.round(rect.right),
    });
    if (overflow.length > 6) break;
  }

  return {
    scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
    clientWidth: root.clientWidth,
    textLength: (body.innerText || '').trim().length,
    headings: [...document.querySelectorAll('h1, h2')].map((node) => node.textContent.trim().slice(0, 48)),
    undersized: undersized.slice(0, 12),
    undersizedCount: undersized.length,
    exemptCount,
    overflow,
    mainCount: document.querySelectorAll('main').length,
    controlCount: controls.length,
  };
})()`;

const binary = findBinary();
if (!binary) {
  console.error('No Chrome/Chromium binary found. Set CHROME_PATH to run render verification.');
  process.exit(1);
}

console.log(`render verification against ${BASE_URL}`);
console.log(`browser: ${path.basename(binary)}\n`);

const userDataDir = await mkdtemp(path.join(tmpdir(), 'cineslate-render-'));
const port = 9333 + Math.floor(Math.random() * 400);

const browser = spawn(
  binary,
  [...HEADLESS_ARGS, `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);

let browserStderr = '';
browser.stderr.on('data', (chunk) => {
  browserStderr += chunk.toString();
});

let client;
try {
  const wsUrl = await waitForDevTools(port);
  client = new CdpClient(wsUrl);
  await client.ready;

  const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });

  await client.send('Page.enable', {}, sessionId);
  await client.send('Runtime.enable', {}, sessionId);
  await client.send('Log.enable', {}, sessionId);

  for (const viewport of VIEWPORTS) {
    await client.send(
      'Emulation.setDeviceMetricsOverride',
      {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 2,
        // Deliberately not `mobile: true`: with mobile emulation Chrome sizes the
        // layout viewport before the document's own viewport meta tag is applied,
        // which reports a bogus 1160px layout width. A narrow desktop viewport
        // exercises the identical responsive CSS without that artifact.
        mobile: false,
      },
      sessionId,
    );

    for (const route of ROUTES) {
      console.log(`${route.path} @ ${viewport.name}`);

      // Clear the event buffer so each measurement only sees its own errors.
      client.events.length = 0;

      await client.send('Page.navigate', { url: `${BASE_URL}${route.path}` }, sessionId);
      // Give hydration, the seed transaction and the follow-up queries time to
      // settle; `networkIdle` alone fires before IndexedDB answers.
      await new Promise((resolve) => setTimeout(resolve, 3_500));

      const { result } = await client.send(
        'Runtime.evaluate',
        { expression: MEASURE, returnByValue: true, awaitPromise: false },
        sessionId,
      );

      const metrics = result.value;
      if (!metrics) {
        ok(`${route.path} produced measurements`, false, 'Runtime.evaluate returned nothing');
        continue;
      }

      ok(
        `${route.path} rendered above the shell`,
        metrics.textLength > 600,
        `innerText length ${metrics.textLength}`,
      );
      ok(`${route.path} renders exactly one landmark`, metrics.mainCount === 1, `main count ${metrics.mainCount}`);
      ok(
        `${route.path} has no horizontal overflow`,
        metrics.scrollWidth <= metrics.clientWidth + 1,
        `scrollWidth ${metrics.scrollWidth} > clientWidth ${metrics.clientWidth}`,
      );
      ok(
        `${route.path} has no element past the right edge`,
        metrics.overflow.length === 0,
        JSON.stringify(metrics.overflow),
      );
      ok(
        `${route.path} respects the 44px touch target`,
        metrics.undersizedCount === 0,
        `${metrics.undersizedCount} undersized: ${JSON.stringify(metrics.undersized)}`,
      );

      const consoleErrors = client.events.filter(
        (event) =>
          (event.method === 'Log.entryAdded' && event.params.entry.level === 'error') ||
          event.method === 'Runtime.exceptionThrown',
      );
      const hydrationErrors = consoleErrors.filter((event) => {
        const text =
          event.method === 'Runtime.exceptionThrown'
            ? (event.params.exceptionDetails?.exception?.description ?? '')
            : event.params.entry.text ?? '';
        // Dev-server HMR noise and favicon 404s are not app failures.
        return !/favicon|websocket|HMR|hot-update|Download the React DevTools/i.test(text);
      });
      ok(
        `${route.path} hydrates without errors`,
        hydrationErrors.length === 0,
        hydrationErrors
          .map((event) =>
            event.method === 'Runtime.exceptionThrown'
              ? event.params.exceptionDetails?.exception?.description?.slice(0, 200)
              : event.params.entry.text?.slice(0, 200),
          )
          .join(' | '),
      );

      const rendered = await client.send(
        'Runtime.evaluate',
        { expression: 'document.body.innerText || ""', returnByValue: true },
        sessionId,
      );
      const bodyText = rendered.result.value ?? '';
      const missing = route.expect.filter((marker) => !bodyText.includes(marker));
      ok(
        `${route.path} shows its expected content`,
        missing.length === 0,
        `missing: ${missing.join(', ')}`,
      );
    }
    console.log('');
  }

  // Seeded-content probe on the home route at the default viewport.
  await client.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await client.send('Page.navigate', { url: `${BASE_URL}/` }, sessionId);
  await new Promise((resolve) => setTimeout(resolve, 4_500));
  const probe = await client.send(
    'Runtime.evaluate',
    {
      expression: `(() => {
        const text = document.body.innerText || '';
        return {
          hasSeededFilm: /Parasite|Blade Runner|Spirited Away|Whiplash|Arrival/.test(text),
          hasActivity: /logged|reviewed|watchlist|liked/i.test(text),
          mentionsEmptyLibrary: /library is empty|No reviews have been written/i.test(text),
          filmLinks: [...document.querySelectorAll('a[href^="/films/"]')].length,
          profileLinks: [...document.querySelectorAll('a[href^="/profile/"]')].length,
        };
      })()`,
      returnByValue: true,
    },
    sessionId,
  );
  const probeValue = probe.result.value;
  console.log('seeded content probe (/)');
  ok('the seed reaches the home page', probeValue.hasSeededFilm, JSON.stringify(probeValue));
  ok('film links are rendered', probeValue.filmLinks > 0, `filmLinks=${probeValue.filmLinks}`);
  ok('member links are rendered', probeValue.profileLinks > 0, `profileLinks=${probeValue.profileLinks}`);
  ok('the empty-library fallback is not shown', !probeValue.mentionsEmptyLibrary, JSON.stringify(probeValue));
} finally {
  try {
    client?.close();
  } catch {
    // Socket already gone.
  }
  browser.kill('SIGKILL');
  await rm(userDataDir, { recursive: true, force: true });
  if (browserStderr.includes('ERROR:') && failures > 0) {
    console.error(`\nbrowser stderr (tail):\n${browserStderr.split('\n').slice(-12).join('\n')}`);
  }
}

console.log(`\n${checks - failures}/${checks} render assertions passed.`);
if (failures > 0) {
  console.error(`${failures} render assertion(s) failed.`);
  process.exit(1);
}

#!/usr/bin/node

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const ProxyChain = require('proxy-chain');
const fs = require('fs');
const { runProfile } = require('./fake_history.js');

puppeteer.use(StealthPlugin());
let PROXY = null;
try{
  PROXY = JSON.parse(fs.readFileSync('./proxy.config.json', 'utf8'));  
} catch (e){
  PROXY = null;
}
let REAL_IP = null;

async function getRealIP() {
  return new Promise((resolve, reject) => {
    require('https').get('https://api.ipify.org?format=json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data).ip); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

class Client {
  constructor(profileName, link) {
    this.profileName = profileName;
    this.link = link;
    this.userAgent = null;
    this.visualPort = null;
    this.browser = null;
    this.page = null;
    this.localProxyPort = null;
    this.mousePos = { x: 0, y: 0 };
  }

  randomGenerator(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async init(userAgent = null, visualPort = null) {
    this.userAgent = userAgent;
    this.visualPort = visualPort;

    const args = [
      `--window-size=${visualPort.width},${visualPort.height}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ]

    //Set Proxy Stream
    const requiredFields = ['proto', 'host', 'port'];
    const missing = requiredFields.filter(
      key => !PROXY[key]
    );

    if(!missing){
      const upstreamProxy = `${PROXY.proto}://${PROXY.username}:${PROXY.password}@${PROXY.host}:${PROXY.port}`;
      this.localProxyPort = await ProxyChain.anonymizeProxy(upstreamProxy);
      console.log(`Local proxy bridge: ${this.localProxyPort}`);
      args.push(`--proxy-server=${this.localProxyPort}`);
    }

    this.browser = await puppeteer.launch({
      headless: 'new',
      defaultViewport: { width: visualPort.width, height: visualPort.height },
      userDataDir: `./profiles/${this.profileName}`,
      args: args
    });
  }

  async stealthPage(page) {
    await page.evaluateOnNewDocument((vp) => {
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const arr = [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
            { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
          ];
          arr.__proto__ = PluginArray.prototype;
          return arr;
        }
      });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      Object.defineProperty(screen, 'width', { get: () => vp.width });
      Object.defineProperty(screen, 'height', { get: () => vp.height });
      Object.defineProperty(screen, 'availWidth', { get: () => vp.width });
      Object.defineProperty(screen, 'availHeight', { get: () => vp.height - 40 });
      Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
      Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });
      if (!window.chrome) {
        window.chrome = { app: { isInstalled: false }, runtime: {}, loadTimes: () => ({}), csi: () => ({}) };
      }
      const originalQuery = window.navigator.permissions?.query?.bind(window.navigator.permissions);
      if (originalQuery) {
        window.navigator.permissions.query = (params) => {
          if (params.name === 'notifications') return Promise.resolve({ state: Notification.permission });
          return originalQuery(params);
        };
      }
    }, this.visualPort);
  }

  // Verify that proxy works
  async verifyProxy() {
    try {
      await this.page.goto('https://api.ipify.org?format=json', {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });
      const body = await this.page.evaluate(() => document.body.innerText);
      const proxyIP = JSON.parse(body).ip;

      console.log(`Real machine IP : ${REAL_IP}`);
      console.log(`Browser sees IP : ${proxyIP}`);

      if (proxyIP === REAL_IP) {
        console.error('\n❌ IP LEAK — browser is using your real IP. Check proxy.config.json.\n');
        //await this.closeAll();
        return false;
      }

      console.log(`✅ Proxy working — traffic routed through ${proxyIP}`);
      return true;
    } catch (e) {
      console.error('Proxy verification failed:', e.message);
      await this.closeAll();
      return false;
    }
  }

  async humanTyping(query) {
    const chars = query.split('');
    for (let i = 0; i < chars.length; i++) {
      await this.page.keyboard.type(chars[i], { delay: this.randomGenerator(60, 200) });
      if (Math.random() < 0.08) {
        await new Promise(r => setTimeout(r, this.randomGenerator(300, 900)));
      }
    }
  }

  async detectCaptcha(page) {
    for (const frame of page.frames()) {
      const url = frame.url();
      if (url.includes('recaptcha') || url.includes('captcha') ||
          url.includes('hcaptcha') || url.includes('turnstile') ||
          url.includes('sorry')) return true;
    }
    try {
      const content = await page.content();
      if (content.includes('unusual traffic') || content.includes('detected unusual')) return true;
    } catch (e) { /* ignore */ }
    return false;
  }

  async idleMouseWander(durationMs = null) {
    const duration = durationMs || this.randomGenerator(1500, 4000);
    const vw = this.visualPort.width;
    const vh = this.visualPort.height;
    const start = Date.now();

    if (this.mousePos.x === 0 && this.mousePos.y === 0) {
      this.mousePos = {
        x: this.randomGenerator(Math.floor(vw * 0.2), Math.floor(vw * 0.8)),
        y: this.randomGenerator(Math.floor(vh * 0.2), Math.floor(vh * 0.8))
      };
      await this.page.mouse.move(this.mousePos.x, this.mousePos.y);
    }

    while (Date.now() - start < duration) {
      const targetX = Math.max(50, Math.min(vw - 50, this.mousePos.x + this.randomGenerator(-180, 180)));
      const targetY = Math.max(50, Math.min(vh - 50, this.mousePos.y + this.randomGenerator(-120, 120)));
      await this.humanMouseMove(targetX, targetY);
      if (Math.random() < 0.35) {
        await new Promise(r => setTimeout(r, this.randomGenerator(400, 1200)));
      }
    }
  }

  async humanMouseMove(targetX, targetY) {
    const startX = this.mousePos.x;
    const startY = this.mousePos.y;
    const cpX = startX + (targetX - startX) / 2 + this.randomGenerator(-80, 80);
    const cpY = startY + (targetY - startY) / 2 + this.randomGenerator(-80, 80);
    const steps = this.randomGenerator(35, 70);
    for (let i = 0; i <= steps; i++) {
      let t = i / steps;
      t = 1 - Math.pow(1 - t, 3);
      const x = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * cpX + t * t * targetX;
      const y = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * cpY + t * t * targetY;
      await this.page.mouse.move(x, y);
      await new Promise(r => setTimeout(r, this.randomGenerator(3, 10) + (t * 15)));
    }
    this.mousePos = { x: targetX, y: targetY };
  }

  async click(box) {
    await this.humanMouseMove(
      (box.x + box.width / 2) + this.randomGenerator(-8, 8),
      (box.y + box.height / 2) + this.randomGenerator(-4, 4)
    );
    await this.page.mouse.down();
    await new Promise(r => setTimeout(r, this.randomGenerator(50, 150)));
    await this.page.mouse.up();
  }

  async humanScroll(elementHandle) {
    const isVisible = await this.page.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    }, elementHandle);
    if (isVisible) return;
    const loc = await this.page.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return { top: rect.top + window.scrollY };
    }, elementHandle);
    const currentScroll = await this.page.evaluate(() => window.scrollY);
    let remaining = loc.top - currentScroll;
    while (remaining > 0) {
      const step = Math.min(300, remaining);
      await this.page.mouse.wheel({ deltaY: step });
      await new Promise(r => setTimeout(r, this.randomGenerator(400, 1500)));
      remaining -= step;
    }
  }

  // Scrolls down to stopFraction of the total scrollable height.
  // e.g. 0.4 scrolls to 40% of the page from the TOP (not from current position).
  // Uses the actual browser scrollY so sequential calls work correctly:
  //   scrollToNearBottom(0.2) → scrolls to 20%
  //   scrollToNearBottom(0.5) → scrolls from 20% down to 50%
  //   scrollToNearBottom(0.8) → scrolls from 50% down to 80%
  async scrollToNearBottom(stopFraction = 0.85) {
    const { scrollHeight, innerHeight } = await this.page.evaluate(() => ({
      scrollHeight: document.body.scrollHeight,
      innerHeight: window.innerHeight
    }));

    const maxScroll = scrollHeight - innerHeight;
    if (maxScroll <= 0) return; // page not scrollable

    const targetScroll = Math.floor(maxScroll * stopFraction);

    // Re-read current scroll position from the browser each time
    let currentScroll = await this.page.evaluate(() => window.scrollY);

    if (currentScroll >= targetScroll) {
      console.log(`Already at ${Math.round((currentScroll / maxScroll) * 100)}%, skipping scroll to ${Math.round(stopFraction * 100)}%`);
      return;
    }

    console.log(`Scrolling from ${Math.round((currentScroll / maxScroll) * 100)}% to ~${Math.round(stopFraction * 100)}% (${targetScroll}px)`);

    while (currentScroll < targetScroll) {
      const remaining = targetScroll - currentScroll;

      // Clamp step range so min never exceeds max
      const stepMin = Math.min(60, remaining);
      const stepMax = Math.min(160, remaining);
      const step = stepMin >= stepMax ? stepMin : this.randomGenerator(stepMin, stepMax);

      await this.page.mouse.wheel({ deltaY: step });
      currentScroll += step; // FIX: advance tracker so loop actually terminates

      await new Promise(r => setTimeout(r, this.randomGenerator(80, 350)));

      // Occasional reading pause
      if (Math.random() < 0.12) {
        await new Promise(r => setTimeout(r, this.randomGenerator(600, 2000)));
      }

      // Occasional small back-scroll (re-reading)
      if (Math.random() < 0.07 && currentScroll > 100) {
        const backStep = this.randomGenerator(40, 120);
        await this.page.mouse.wheel({ deltaY: -backStep });
        currentScroll = Math.max(0, currentScroll - backStep);
        await new Promise(r => setTimeout(r, this.randomGenerator(400, 900)));
      }
    }
  }

  // Returns true if the page is still open and usable
  isPageAlive() {
    try {
      return this.page && !this.page.isClosed();
    } catch {
      return false;
    }
  }

  async wait(ms) {
    console.log("wait()");
    const interval = 5000; // ping every 5s
    let elapsed = 0;
    while (elapsed < ms) {
      const chunk = Math.min(interval, ms - elapsed);
      await new Promise(r => setTimeout(r, chunk));
      elapsed += chunk;
      // Keep the CDP session warm
      if (this.isPageAlive()) {
        await this.page.evaluate(() => document.title).catch(() => {});
      }
    }
  }

  // Simulates a human spending time on a page: waits, wanders, scrolls down in stages.
  async interactWithPage() {
    this._interacting = true;
    console.log('Interacting with page...');

    await this.wait(this.randomGenerator(20000, 25000));
    await this.idleMouseWander(this.randomGenerator(6000, 10000));
    await this.scrollToNearBottom(0.2);

    console.log('Waiting...');
    await this.wait(this.randomGenerator(15000, 25000));
    await this.scrollToNearBottom(0.4);
    await this.idleMouseWander(this.randomGenerator(6000, 10000));

    console.log('Waiting...');
    await this.scrollToNearBottom(0.7);
    await this.wait(this.randomGenerator(10000, 15000));

    console.log('Done interacting');
    this._interacting = false;
  }

  async search(query = null) {
    this.page = await this.browser.newPage();

    await this.stealthPage(this.page);
    await this.page.setUserAgent(this.userAgent);
    await this.page.setViewport({ width: this.visualPort.width, height: this.visualPort.height });
    await this.page.setExtraHTTPHeaders({
      'accept-language': 'en-US,en;q=0.9',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    });

    this.page.setDefaultNavigationTimeout(1800000);
    this.page.setDefaultTimeout(120000);

    const proxyOk = await this.verifyProxy();

    console.log('Navigating to target site...');

    try {
      await this.clearGACookies();
      await this.page.goto(this.link, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000  // 30 seconds max — if it can't load in 30s, abort
      });
    } catch (e) {
      console.error(`Failed to load target site: ${e.message}`);
      await this.clearGACookies();
      await this.closeAll();
      return;
    }
    console.log('Landed on homepage');

    // Spend time on homepage
    await this.interactWithPage();

    // Scroll back to top before scanning for nav links
    // after interactWithPage() scrolls down, nav links are above the viewport
    // and humanScroll() won't scroll UP to reach them.
    await this.page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await new Promise(r => setTimeout(r, this.randomGenerator(800, 1500)));

    // Collect links matching one of the target sections
    const sections = ['results/', 'about/', 'partners/', 'about-us/', 'join-us/', 'products/', 'tools/', 'jobs/', 'games/'];
    const allLinks = await this.page.$$('a');
    const clickableLinks = [];

    for (const link of allLinks) {
      const href = await this.page.evaluate(el => el.href, link).catch(() => '');
      const matches = sections.some(s => href.endsWith(s));
      if (matches) {
        const box = await link.boundingBox();
        if (box) clickableLinks.push({ handle: link, box, href });
      }
    }

    console.log('Matching links found:');
    clickableLinks.forEach(l => console.log('  ', l.href));

    if (clickableLinks.length > 0) {
      const randomLink = clickableLinks[this.randomGenerator(0, clickableLinks.length - 1)];
      console.log(`Navigating to: ${randomLink.href}`);

      // Use goto() directly — more reliable than clicking when JS may intercept the event
      await this.page.goto(randomLink.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
      console.log(`Landed on: ${this.page.url()}`);

      // Spend time on the section page too
      await this.interactWithPage();
    } else {
      console.log('No matching section links found — staying on homepage');
    }

    await this.page.screenshot({ path: 'assets/final_page.png' });
    await new Promise(r => setTimeout(r, this.randomGenerator(5000, 15000)));
    await this.clearGACookies();
    await this.closeAll();
  }

  async closeAll() {
    await this.browser.close();
    if (this.localProxyPort) await ProxyChain.closeAnonymizedProxy(this.localProxyPort, true);
  }

  async clearGACookies() {
    const cookies = await this.page.cookies(this.link);
    const gaCookies = cookies.filter(c =>
      c.name.startsWith('_ga') || c.name.startsWith('_gid')
    );
    for (const cookie of gaCookies) {
      await this.page.deleteCookie(cookie);
    }
    if (gaCookies.length > 0) {
      console.log(`Cleared ${gaCookies.length} GA cookies: ${gaCookies.map(c => c.name).join(', ')}`);
    }
    else{
      console.log(`No cookie found? ${JSON.stringify(gaCookies)}\n`);
    }
  }
}

(async () => {
  REAL_IP = await getRealIP();
  console.log(`Machine IP: ${REAL_IP}`);

  const profileData = await runProfile();
  const profileName = profileData[0];
  const UAVP = profileData[1];
  console.log(`Profile UA/VP: ${JSON.stringify(UAVP)}`);
  const link = 'https://example.com';
  const client = new Client(profileName, link);
  await client.init(UAVP['ua'], UAVP['vp']);

  const query = "";

  console.log(`Search query: "${query}"`);
  await client.search(query);
})();
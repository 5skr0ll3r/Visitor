const puppeteer = require('puppeteer');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

function getRandomName() {
  const data = fs.readFileSync('./sources/usernames.txt', 'utf8');

  const names = data
    .split('\n')
    .map(name => name.trim())
    .filter(name => name.length > 0);

  return names[Math.floor(Math.random() * names.length)];
}

function toChromeTime(date) {
  const epoch = new Date('1601-01-01T00:00:00Z').getTime();
  return (date.getTime() - epoch) * 1000;
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

function randomUrl() {
  const domains = [
    'google.com/search?q=',
    'youtube.com/results?search_query=',
    'reddit.com/search?q=',
    'amazon.com/s?k=',
    'github.com/search?q=',
  ];

  const queries = [
    'news', 'weather', 'javascript+syntax', 'ufc',
    'movies', 'tech', 'finance', 'cars',
    'travel', 'crypto', 'best+speakers',
    'best+horror+movies+2026', 'nodejs+tutorial',
    ''
  ];

  // FIX: was randomBetween(0, domains.length) which could go out of bounds
  const d = domains[randomBetween(0, domains.length - 1)];
  const q = queries[randomBetween(0, queries.length - 1)];

  return [`https://www.${d}${q}`, `Search Result For: ${q}`];
}

function generateVisits() {
  const visits = [];
  const now = new Date();

  for (let day = randomBetween(13, 23); day >= 0; day--) {
    const baseDate = new Date(now);
    baseDate.setDate(now.getDate() - day);

    let visitsToday = randomBetween(18, 23);
    let currentHour = randomBetween(8, 11);

    for (let i = 0; i < visitsToday; i++) {
      currentHour += Math.random() < 0.3
        ? randomBetween(0, 1)
        : randomBetween(1, 3);

      // Cap at hour 23 to avoid invalid dates
      if (currentHour > 23) currentHour = 23;

      const visitDate = new Date(baseDate);
      visitDate.setHours(currentHour);
      visitDate.setMinutes(randomBetween(0, 59));
      visitDate.setSeconds(randomBetween(0, 59));

      const [url, title] = randomUrl();

      visits.push({
        url,
        title,
        visit_time: toChromeTime(visitDate)
      });
    }
  }

  return visits;
}

function insertVisits(db, visits) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      let completed = 0;

      visits.forEach(v => {
        db.run(`
          INSERT INTO urls (url, title, visit_count, typed_count, last_visit_time)
          VALUES (?, ?, 1, 0, ?)
        `, [v.url, v.title, v.visit_time], function (err) {

          if (err) return reject(err);

          const urlId = this.lastID;

          db.run(`
            INSERT INTO visits (url, visit_time, from_visit, transition)
            VALUES (?, ?, 0, 805306368)
          `, [urlId, v.visit_time], (err2) => {

            if (err2) return reject(err2);

            completed++;

            if (completed === visits.length) {
              db.run("COMMIT", (err3) => {
                if (err3) return reject(err3);
                db.close();
                resolve();
              });
            }
          });
        });
      });
    });
  });
}

async function runProfile() {
  const uas = JSON.parse(fs.readFileSync('uas.json', { encoding: 'utf-8', flag: 'r' }));
  const randUAIndex = Math.floor(Math.random() * uas['desktop'].length);
  const UAVP = uas['desktop'][randUAIndex];

  const randomName = getRandomName();
  console.log("Profile:", randomName);

  // FIX: Use headless: true to match the main client — inconsistent headless mode
  // creates detectable fingerprint mismatches between profile creation and usage
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: UAVP['vp'].width, height: UAVP['vp'].height },
    userDataDir: `./profiles/${randomName}`,
    args: [
      `--window-size=${UAVP['vp'].width},${UAVP['vp'].height}`,
      `--user-agent=${UAVP['ua']}`,
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled', // FIX: hides navigator.webdriver
    ]
  });

  const page = await browser.newPage();

  // FIX: Set extra headers during profile init so they're baked into the profile
  await page.setExtraHTTPHeaders({
    'accept-language': 'en-US,en;q=0.9',
  });

  // Visit a neutral page so the profile DB is properly initialized
  await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
  await new Promise(resolve => setTimeout(resolve, 2000));
  await browser.close();
  await new Promise(resolve => setTimeout(resolve, 2000));

  const dbPath = `./profiles/${randomName}/Default/History`;
  const db = new sqlite3.Database(dbPath);

  const visits = generateVisits();
  await insertVisits(db, visits);

  console.log(`Inserted ${visits.length} visits successfully.`);
  await new Promise(resolve => setTimeout(resolve, 2000));
  return [randomName, UAVP];
}

module.exports = { runProfile };
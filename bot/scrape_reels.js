// bot/scrape_reels.js
const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");

// Paths
const REELS_URLS_PATH = path.join(__dirname, "../reels_urls.txt");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts");
const CONFIG_PATH = path.join(__dirname, "../config/configscrape_reels.json");

// Load config
const config = require("../config/configscrape_reels.json");

// Helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const nowInSeconds = () => Math.floor(Date.now() / 1000);
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 hari

// Load cookies dari environment
async function loadCookiesFromEnv() {
  const cookieString = process.env.FACEBOOK_COOKIES;
  if (!cookieString) throw new Error("FACEBOOK_COOKIES tidak ditemukan di environment!");
  return JSON.parse(cookieString).map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite
  }));
}

// Baca file & parsing: url|timestamp
async function loadReelsWithTimestamp() {
  try {
    const data = await fs.readFile(REELS_URLS_PATH, "utf8");
    const lines = data.split("\n").filter(Boolean);
    return lines.map(line => {
      const [url, ts] = line.split("|");
      return { url: url.trim(), timestamp: parseInt(ts, 10) };
    });
  } catch (e) {
    if (e.code === "ENOENT") {
      await fs.writeFile(REELS_URLS_PATH, "", "utf8"); // Buat file kosong
    }
    return [];
  }
}

// Simpan kembali ke file (setelah dibersihkan & ditambah baru)
async function saveReelsToFile(reels) {
  const content = reels.map(r => `${r.url}|${r.timestamp}`).join("\n");
  await fs.writeFile(REELS_URLS_PATH, content, "utf8");
}

// Hapus Reels lebih dari 7 hari
function filterRecentReels(reels) {
  const cutoff = nowInSeconds() - MAX_AGE_SECONDS;
  return reels.filter(r => r.timestamp >= cutoff);
}

// Ambil URL Reels dari halaman
async function scrapeReelsFromPage(page) {
  console.log("🔍 Memulai scraping Reels...");
  await page.goto(config.targetURL, { waitUntil: "networkidle2" });
  await delay(8000);

  const urls = new Set();

  for (let i = 0; i < config.maxScrolls; i++) {
    const links = await page.$$eval('a[href*="/reel/"]', els =>
      els.map(el => {
        const href = el.href.split('?')[0].split('#')[0];
        return href.includes("/reel/") ? href : null;
      }).filter(Boolean)
    );

    links.forEach(url => urls.add(url));
    console.log(`   → Ditemukan ${urls.size} Reels unik (scroll ${i + 1}/${config.maxScrolls})`);

    await page.evaluate(() => window.scrollBy(0, 1000));
    await delay(4000);
  }

  return Array.from(urls);
}

// Main function
async function main() {
  let browser;
  console.log("🔄 Memulai bot Auto Update Reels URL...");

  try {
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    browser = await puppeteer.launch({
      headless: config.headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Load cookies
    const cookies = await loadCookiesFromEnv();
    await page.setCookie(...cookies);
    console.log("✅ Cookies Facebook dimuat.");

    // Load & bersihkan history lama
    let existingReels = await loadReelsWithTimestamp();
    existingReels = filterRecentReels(existingReels);
    const existingUrls = new Set(existingReels.map(r => r.url));

    console.log(`🧹 Membersihkan: ${existingReels.length} Reels tersisa setelah filter 7 hari.`);

    // Scrape Reels baru
    const newUrls = await scrapeReelsFromPage(page);
    let newCount = 0;

    for (const url of newUrls) {
      if (!existingUrls.has(url)) {
        existingReels.push({ url, timestamp: nowInSeconds() });
        existingUrls.add(url);
        newCount++;
      }
    }

    // Simpan kembali
    await saveReelsToFile(existingReels);

    console.log(`✅ Scraping selesai.`);
    console.log(`📥 Total Reels: ${existingReels.length}`);
    console.log(`🆕 Ditambahkan: ${newCount} Reels baru`);

  } catch (error) {
    console.error("🚨 Error saat scraping:", error.message);
    try {
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, "scrape_error.png") });
    } catch {}
    process.exit(1);
  } finally {
    if (browser) await browser.close();
    console.log("🏁 Scraping selesai.");
  }
}

main();

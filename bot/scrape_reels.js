// bot/scrape_reels.js
const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");

// === PATHS ===
const REELS_URLS_PATH = path.join(__dirname, "../reels_urls.txt");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts");

// === Konfigurasi Default ===
let config = {
  headless: true,
  targetURL: "https://www.facebook.com/reels/?source=seen_tab",
  maxScrolls: 10
};

// Coba load konfigurasi eksternal jika ada
try {
  const customConfig = require("../config/configscrape_reels.json");
  Object.assign(config, customConfig);
} catch (e) {
  console.log("⚠️  configscrape_reels.json tidak ditemukan, gunakan konfigurasi default.");
}

// === Helper Functions ===
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const nowInSeconds = () => Math.floor(Date.now() / 1000);
const ONE_WEEK_IN_SECONDS = 7 * 24 * 60 * 60;

// === Load & Perbaiki Cookies ===
async function loadCookiesFromEnv() {
  const cookieString = process.env.FACEBOOK_COOKIES;
  if (!cookieString) {
    throw new Error("FACEBOOK_COOKIES tidak ditemukan di environment (GitHub Secrets).");
  }

  let cookies;
  try {
    cookies = JSON.parse(cookieString);
  } catch (e) {
    throw new Error("FACEBOOK_COOKIES tidak valid format JSON. Pastikan benar-benar JSON array.");
  }

  return cookies.map(cookie => {
    // Perbaiki sameSite jika tidak valid
    const sameSite = ['Strict', 'Lax', 'None'].includes(cookie.sameSite) ? cookie.sameSite : 'Lax';

    return {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain || '.facebook.com',
      path: cookie.path || '/',
      httpOnly: !!cookie.httpOnly,
      secure: !!cookie.secure,
      sameSite
    };
  });
}

// === Load Reels dari File (dengan timestamp) ===
async function loadReelsWithTimestamp() {
  try {
    const data = await fs.readFile(REELS_URLS_PATH, "utf8");
    const lines = data.split("\n").filter(line => line.trim() !== "");
    const parsed = lines.map(line => {
      const [url, ts] = line.split("|");
      return {
        url: url.trim(),
        timestamp: parseInt(ts, 10) || nowInSeconds()
      };
    });
    console.log(`✅ Muat ${parsed.length} Reels dari file.`);
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log("📄 File reels_urls.txt belum ada. Akan dibuat baru.");
      await fs.writeFile(REELS_URLS_PATH, "", "utf8");
      return [];
    } else {
      console.error("❌ Gagal baca reels_urls.txt:", error.message);
      throw error;
    }
  }
}

// === Simpan ke File (dengan error handling) ===
async function saveReelsToFile(reels) {
  const content = reels.map(r => `${r.url}|${r.timestamp}`).join("\n");
  try {
    await fs.writeFile(REELS_URLS_PATH, content, "utf8");
    console.log(`✅ Berhasil simpan ${reels.length} URL Reels ke: ${REELS_URLS_PATH}`);
  } catch (error) {
    console.error("❌ GAGAL simpan ke reels_urls.txt:", error.message || error);
    throw error;
  }
}

// === Filter: Hanya Reels <= 7 Hari Terakhir ===
function filterRecentReels(reels) {
  const cutoff = nowInSeconds() - ONE_WEEK_IN_SECONDS;
  return reels.filter(r => r.timestamp >= cutoff);
}

// === Scraping Reels dari Halaman ===
async function scrapeReelsFromPage(page) {
  console.log("🔍 Membuka halaman Reels:", config.targetURL);
  await page.goto(config.targetURL, { waitUntil: "networkidle2", timeout: 60000 }).catch(err => {
    console.warn("⚠️  Gagal load halaman:", err.message);
  });
  await delay(8000);

  const urls = new Set();

  for (let i = 0; i < config.maxScrolls; i++) {
    console.log(`🔄 Scroll ke-${i + 1}/${config.maxScrolls}...`);

    const links = await page.$$eval('a[href*="/reel/"]', elements =>
      elements
        .map(el => {
          const href = el.href.split("?")[0].split("#")[0];
          return href.includes("/reel/") ? href : null;
        })
        .filter(Boolean)
    );

    links.forEach(url => urls.add(url));
    console.log(`   → Ditemukan ${urls.size} Reels unik`);

    await page.evaluate(() => window.scrollBy(0, 1000));
    await delay(4000);
  }

  return Array.from(urls);
}

// === Fungsi Utama ===
async function main() {
  let browser;
  console.log("🚀 Memulai bot SCRAPE REELS...");

  try {
    // Buat folder artifacts
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    // Load cookies
    const cookies = await loadCookiesFromEnv();
    console.log(`✅ ${cookies.length} cookies dimuat.`);

    // Launch browser
    browser = await puppeteer.launch({
      headless: config.headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled"
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setCookie(...cookies);
    console.log("✅ Cookies Facebook berhasil diterapkan.");

    // Baca & bersihkan Reels lama
    let existingReels = await loadReelsWithTimestamp();
    existingReels = filterRecentReels(existingReels);
    const existingUrls = new Set(existingReels.map(r => r.url));
    console.log(`🧹 Membersihkan: ${existingReels.length} Reels tersisa setelah filter 7 hari.`);

    // Ambil Reels baru
    const newUrls = await scrapeReelsFromPage(page);
    let newCount = 0;

    for (const url of newUrls) {
      if (!existingUrls.has(url)) {
        existingReels.push({ url, timestamp: nowInSeconds() });
        existingUrls.add(url);
        newCount++;
      }
    }

    // Simpan ke file
    await saveReelsToFile(existingReels);

    // Log hasil
    console.log("✅ SCRAPING SELESAI.");
    console.log(`📥 Total Reels tersimpan: ${existingReels.length}`);
    console.log(`🆕 Ditambahkan: ${newCount} Reels baru`);

  } catch (error) {
    console.error("🚨 ERROR FATAL:", error instanceof Error ? error.message : String(error));
    try {
      await page?.screenshot({ path: path.join(ARTIFACTS_DIR, "scrape_error.png") });
      console.log("📸 Screenshot error disimpan.");
    } catch (e) {
      console.error("❌ Gagal ambil screenshot.");
    }
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
      console.log("🏁 Browser ditutup.");
    }
  }
}

// Jalankan jika file dijalankan langsung
if (require.main === module) {
  main();
}

module.exports = main;

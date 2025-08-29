// bot/update_status.js
const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

// Paths
const CONFIG_PATH = path.join(__dirname, "../config/config_update_status.json");
const GEMINI_KEYS_PATH = path.join(__dirname, "../gemini_keys.txt");
const LOG_STATUS_PATH = path.join(__dirname, "../log_status.txt");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts");

// Load config
let config;
try {
  config = require("../config/config_update_status.json");
} catch (e) {
  console.log("⚠️  config_update_status.json tidak ditemukan, gunakan default.");
  config = {
    headless: true,
    minIntervalSeconds: 60,
    maxIntervalSeconds: 180,
    gemini_prompt: "Buat status media sosial yang menarik, positif, dan viral. 1-2 kalimat, gaya santai, 1 emoji."
  };
}

// Helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const getRandomInterval = () =>
  1000 * (Math.floor(Math.random() * (config.maxIntervalSeconds - config.minIntervalSeconds + 1)) + config.minIntervalSeconds);

// Load cookies
async function loadCookiesFromEnv() {
  const cookieString = process.env.FACEBOOK_COOKIES;
  if (!cookieString) throw new Error("FACEBOOK_COOKIES tidak ditemukan di environment!");
  return JSON.parse(cookieString).map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    httpOnly: !!c.httpOnly,
    secure: !!c.secure,
    sameSite: ['Strict', 'Lax', 'None'].includes(c.sameSite) ? c.sameSite : 'Lax'
  }));
}

// Load Gemini Keys
async function loadGeminiKeys() {
  try {
    const data = await fs.readFile(GEMINI_KEYS_PATH, "utf8");
    return data.split("\n").map(k => k.trim()).filter(Boolean);
  } catch (e) {
    if (e.code === "ENOENT") throw new Error("File gemini_keys.txt tidak ditemukan!");
    throw e;
  }
}

// Generate status dari Gemini
async function generateStatusFromGemini(prompt, keys) {
  console.log("🧠 Menghubungi Gemini AI...");
  for (const [index, key] of keys.entries()) {
    try {
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${key}`,
        { contents: [{ parts: [{ text: prompt }] }] },
        { headers: { "Content-Type": "application/json" }, timeout: 10000 }
      );
      return res.data.candidates[0].content.parts[0].text.trim();
    } catch (error) {
      const msg = error.response?.data?.error?.message || error.message;
      console.error(`❌ Gagal dengan API Key #${index + 1}:`, msg);
    }
  }
  throw new Error("Semua API Key Gemini gagal.");
}

// Simpan log status
async function logStatus(status) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${status}`;
  await fs.appendFile(LOG_STATUS_PATH, logEntry + "\n", "utf8");
  console.log("📝 Status dicatat di log_status.txt");
}

// Main
async function main() {
  let browser = null;
  let page = null;

  console.log("🚀 Memulai bot Update Status di Beranda...");

  try {
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    const keys = await loadGeminiKeys();
    const cookies = await loadCookiesFromEnv();

    browser = await puppeteer.launch({
      headless: config.headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });

    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setCookie(...cookies);

    console.log("✅ Cookies dimuat. Membuka beranda...");
    await page.goto("https://www.facebook.com", { waitUntil: "networkidle2" });
    await delay(7000);

    // Scroll ke atas
    await page.evaluate(() => window.scrollTo(0, 0));
    await delay(2000);

    // Tutup popup
    const closeSelectors = ['div[aria-label="Tutup"]', 'div[aria-label="Close"]', '[aria-label="Dismiss"]'];
    for (const sel of closeSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        await page.click(sel);
        await delay(2000);
      } catch {}
    }

    // Selector fleksibel untuk area posting
    const selectors = [
      'div[role="button"]:text("Apa yang Anda pikirkan, Ainia?")',
      'div[role="button"]:text("Apa yang Anda pikirkan sekarang?")',
      'div[role="button"]:text("What\'s on your mind?")',
      'div[role="button"][aria-label*="post"]',
      '[data-pagelet="ProfileComposer"] button',
      'div.x1lcm9me.x1yr5g0i.xds686m.x10l3doa.x1e0fer8.x1jx94hy.x1o1ewxj.x3x9cwd.x1e5q0jg.x13rtm0m',
      'div.xi81zsa.x1lkfr7t.xkjl1po.x1mzt3pk.xh8yej3.x13faqbe',
      'div.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6'
    ];

    let found = false;
    for (const sel of selectors) {
      try {
        await page.waitForFunction((selector) => {
          const el = document.querySelector(selector);
          return el && el.offsetParent !== null && el.getBoundingClientRect().height > 20;
        }, { timeout: 5000 }, sel);
        await page.click(sel);
        console.log(`✅ Area postingan diaktifkan: ${sel}`);
        found = true;
        break;
      } catch {}
    }

    if (!found) {
      throw new Error("Tidak dapat menemukan area posting di beranda.");
    }

    await delay(3000);

    // Generate status
    const status = await generateStatusFromGemini(config.gemini_prompt, keys);

    // Ketik status
    const inputSelectors = [
      'div[aria-label="Postingan Anda"]',
      'div[aria-label="Your post"]',
      'div[contenteditable="true"][role="textbox"]'
    ];

    let inputFound = false;
    for (const sel of inputSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 5000 });
        await page.type(sel, status, { delay: 50 });
        inputFound = true;
        break;
      } catch {}
    }

    if (!inputFound) {
      throw new Error("Tidak dapat menemukan area input teks.");
    }

    // Klik "Berikutnya" jika muncul
    const nextSelectors = ['div[aria-label="Berikutnya"]', 'div[aria-label="Next"]'];
    for (const sel of nextSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        await page.click(sel);
        await delay(2000);
        break;
      } catch {}
    }

    // Klik "Posting"
    const postSelectors = [
      'div[aria-label="Kirim"][role="button"]',
      'div[aria-label="Posting"][role="button"]',
      'div[aria-label="Post"][role="button"]'
    ];

    let posted = false;
    for (const sel of postSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 5000, visible: true });
        await page.click(sel);
        posted = true;
        break;
      } catch {}
    }

    if (!posted) {
      throw new Error("Tidak dapat menemukan tombol 'Posting'.");
    }

    console.log(`✅ Status berhasil diupdate: "${status}"`);
    await logStatus(status);

    await delay(getRandomInterval());

  } catch (error) {
    console.error("🚨 Error:", error.message);
    if (page) {
      try {
        await page.screenshot({ path: path.join(ARTIFACTS_DIR, "update_status_error.png") });
        console.log("📸 Screenshot error disimpan.");
      } catch {}
    }
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

main();

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
    await page.setViewport({ width: 966, height: 703 });
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

    // --- 1. Klik area "Apa yang Anda pikirkan?" ---
    try {
      await Promise.race([
        page.locator('div.x1yztbdb > div > div > div > div.x1cy8zhl span').click(),
        page.locator('::-p-text(Apa yang Anda)').click(),
        page.click('div[role="button"]:text("Apa yang sedang terjadi?")'),
        page.click('div[role="button"]:text("What\'s on your mind")')
      ]);
      console.log("✅ Area postingan diaktifkan.");
      await delay(3000);
    } catch (e) {
      throw new Error("Tidak dapat mengklik area posting.");
    }

    // --- 2. Klik input teks ---
    try {
      await Promise.race([
        page.locator('::-p-aria([role="textbox"]) >>>> ::-p-aria([role="paragraph"])').click(),
        page.locator('p').click(),
        page.locator('div[contenteditable="true"][role="textbox"]').click()
      ]);
      console.log("✅ Area input teks diklik.");
      await delay(1000);
    } catch {}

    // --- 3. Generate & ketik status dari AI ---
    const status = await generateStatusFromGemini(config.gemini_prompt, keys);

    try {
      await Promise.race([
        page.locator('::-p-aria(Apa yang Anda pikirkan, Ainia?[role="textbox"])').fill(status),
        page.locator('div.x1ed109x > div.x1iyjqo2 > div > div > div.xzsf02u').fill(status),
        page.type('div[contenteditable="true"][role="textbox"]', status, { delay: 50 })
      ]);
      console.log(`✅ Status dimasukkan: "${status}"`);
    } catch (e) {
      throw new Error("Gagal memasukkan teks.");
    }

    // --- 4. Klik "Berikutnya" jika muncul ---
    try {
      await Promise.race([
        page.locator('div:nth-of-type(4) div.x1l90r2v span > span:has-text("Berikutnya")').click(),
        page.locator('::-p-text(Berikutnya)').click(),
        page.click('div[aria-label="Berikutnya"]')
      ]);
      console.log("✅ Klik 'Berikutnya'");
      await delay(2000);
    } catch {}

    // --- 5. Klik "Kirim" / "Posting" ---
    try {
      await Promise.race([
        page.locator('div:nth-of-type(1) > div > div:nth-of-type(4) div.xod5an3 span > span:has-text("Kirim")').click(),
        page.locator('::-p-text(Kirim)').click(),
        page.click('div[aria-label="Posting"][role="button"]'),
        page.click('div[aria-label="Post"][role="button"]')
      ]);
      console.log("✅ Klik 'Kirim' - Status berhasil diposting!");
    } catch (e) {
      throw new Error("Tidak dapat mengklik tombol 'Kirim'.");
    }

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

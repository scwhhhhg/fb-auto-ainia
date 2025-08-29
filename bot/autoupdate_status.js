// bot/autoupdate_status.js
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
const config = require("../config/config_update_status.json");

// Helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const getRandomInterval = () =>
  1000 * (Math.floor(Math.random() * (config.maxIntervalSeconds - config.minIntervalSeconds + 1)) + config.minIntervalSeconds);

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
  console.log("🧠 Menghubungi Gemini AI untuk membuat status...");
  for (const [index, key] of keys.entries()) {
    try {
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${key}`,
        { contents: [{ parts: [{ text: prompt }] }] },
        { headers: { "Content-Type": "application/json" }, timeout: 10000 }
      );
      const status = res.data.candidates[0].content.parts[0].text.trim();
      console.log(`✅ Status berhasil dibuat dengan API Key #${index + 1}`);
      return status;
    } catch (error) {
      const msg = error.response?.data?.error?.message || error.message;
      console.error(`❌ Gagal dengan API Key #${index + 1}:`, msg);
    }
  }
  throw new Error("Semua API Key Gemini gagal digunakan.");
}

// Simpan log status
async function logStatus(status) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${status}`;
  try {
    await fs.appendFile(LOG_STATUS_PATH, logEntry + "\n", "utf8");
    console.log("📝 Status dicatat di log_status.txt");
  } catch (e) {
    console.error("⚠️ Gagal simpan log:", e.message);
  }
}

// Main
async function main() {
  let browser;
  console.log("🚀 Memulai bot Auto Update Status...");

  try {
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    const keys = await loadGeminiKeys();
    if (keys.length === 0) throw new Error("Tidak ada API Key Gemini.");

    const cookies = await loadCookiesFromEnv();

    browser = await puppeteer.launch({
      headless: config.headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    await page.setCookie(...cookies);
    console.log("✅ Cookies dimuat.");

    // Buka beranda Facebook
    await page.goto("https://www.facebook.com", { waitUntil: "networkidle2" });
    await delay(5000);

    // Klik area "Apa yang sedang terjadi?"
    const selector = 'div[role="button"][tabindex="0"]:has-text("Apa yang sedang terjadi?"), div[role="button"]:has-text("What\'s on your mind")';
    await page.waitForSelector(selector, { timeout: 15000 });
    await page.click(selector);
    await delay(3000);

    // Hasilkan status dari Gemini
    const prompt = config.gemini_prompt;
    const status = await generateStatusFromGemini(prompt, keys);

    // Ketik status
    const inputSelector = 'div[aria-label="Postingan Anda"], div[aria-label="Your post"]';
    await page.waitForSelector(inputSelector, { timeout: 10000 });
    await page.type(inputSelector, status, { delay: 50 });

    await delay(2000);

    // Klik tombol "Posting"
    const postButton = 'div[aria-label="Posting"], div[aria-label="Post"]';
    await page.waitForSelector(postButton, { visible: true, timeout: 10000 });
    await page.click(postButton);

    console.log(`✅ Status berhasil diupdate: "${status}"`);

    // Simpan ke log
    await logStatus(status);

    // Jeda acak
    const delayTime = getRandomInterval();
    console.log(`🕒 Jeda ${delayTime / 1000}s sebelum eksekusi berikutnya...`);
    await delay(delayTime);

  } catch (error) {
    console.error("🚨 Error:", error.message);
    try {
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, "autoupdate_error.png") });
    } catch {}
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

main();

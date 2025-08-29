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

// Load cookies
async function loadCookiesFromEnv() {
  const cookieString = process.env.FACEBOOK_COOKIES;
  if (!cookieString) throw new Error("FACEBOOK_COOKIES tidak ditemukan!");
  return JSON.parse(cookieString).map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path
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
      const status = res.data.candidates[0].content.parts[0].text.trim();
      console.log(`✅ Status dari API Key #${index + 1}`);
      return status;
    } catch (error) {
      const msg = error.response?.data?.error?.message || error.message;
      console.error(`❌ Gagal dengan API Key #${index + 1}:`, msg);
    }
  }
  throw new Error("Semua API Key gagal.");
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
  let browser;
  console.log("🚀 Auto Update Status dimulai...");

  try {
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    const keys = await loadGeminiKeys();
    const cookies = await loadCookiesFromEnv();

    browser = await puppeteer.launch({
      headless: config.headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setCookie(...cookies);

    await page.goto("https://www.facebook.com", { waitUntil: "networkidle2" });
    await delay(5000);

    // Klik area "Apa yang sedang terjadi?"
    const selector = 'div[role="button"][tabindex="0"]:has-text("Apa yang sedang terjadi?"), div[role="button"]:has-text("What\'s on your mind")';
    await page.waitForSelector(selector, { timeout: 15000 });
    await page.click(selector);
    await delay(3000);

    // Generate status
    const status = await generateStatusFromGemini(config.gemini_prompt, keys);

    // Ketik status
    const input = 'div[aria-label="Postingan Anda"], div[aria-label="Your post"]';
    await page.waitForSelector(input, { timeout: 10000 });
    await page.type(input, status, { delay: 50 });

    await delay(2000);

    // Klik "Posting"
    const postButton = 'div[aria-label="Posting"], div[aria-label="Post"]';
    await page.waitForSelector(postButton, { visible: true, timeout: 10000 });
    await page.click(postButton);

    console.log(`✅ Status berhasil diupdate: "${status}"`);
    await logStatus(status);

    await delay(getRandomInterval());

  } catch (error) {
    console.error("🚨 Error:", error.message);
    await page?.screenshot({ path: path.join(ARTIFACTS_DIR, "autoupdate_error.png") });
    process.exit(1);
  } finally {
    await browser?.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = main;

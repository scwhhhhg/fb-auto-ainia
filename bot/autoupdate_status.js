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
  if (!cookieString) throw new Error("FACEBOOK_COOKIES tidak ditemukan di environment!");
  return JSON.parse(cookieString).map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    httpOnly: c.httpOnly,
    secure: c.secure,
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

  console.log("🚀 Auto Update Status dimulai...");

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
    await page.goto("https://www.facebook.com/profile.php", { waitUntil: "networkidle2", timeout: 60000 });
    await delay(5000);

    // Scroll ke atas
    await page.evaluate(() => window.scrollTo(0, 0));
    await delay(2000);

    // Tutup popup
    const closeButtons = ['div[aria-label="Tutup"]', 'div[aria-label="Close"]', '[aria-label="Dismiss"]'];
    for (const sel of closeButtons) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        await page.click(sel);
        await delay(2000);
      } catch {}
    }

    // Cari area posting
    const selectors = [
      'div[role="button"]:text("Tulis sesuatu")',
      'div[role="button"]:text("Write something")',
      'div[role="button"]:text("Buat postingan")',
      'div[role="button"][aria-label*="post"]',
      '[data-pagelet="ProfileComposer"] button',
      'div.x1lcm9me.x1yr5g0i.xds686m.x10l3doa.x1e0fer8.x1jx94hy.x1o1ewxj.x3x9cwd.x1e5q0jg.x13rtm0m',
      'div.xi81zsa.x1lkfr7t.xkjl1po.x1mzt3pk.xh8yej3.x13faqbe'
    ];

    let selectedSelector = null;
    for (const sel of selectors) {
      try {
        await page.waitForFunction((s) => {
          const el = document.querySelector(s);
          return el && el.offsetParent !== null && el.getBoundingClientRect().height > 20;
        }, { timeout: 3000 }, sel);
        selectedSelector = sel;
        break;
      } catch {}
    }

    if (!selectedSelector) {
      throw new Error("Tidak dapat menemukan area posting.");
    }

    await page.click(selectedSelector);
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

    await delay(2000);

    // 🔽 KLIK "BERIKUTNYA" JIKA MUNCUL 🔽
    const nextButtonSelectors = [
      'div[aria-label="Berikutnya"]',
      'div[aria-label="Next"]',
      'div[role="button"]:text("Berikutnya")',
      'div[role="button"]:text("Next")'
    ];

    let nextClicked = false;
    for (const sel of nextButtonSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000, visible: true });
        await page.click(sel);
        console.log(`✅ Tombol "Berikutnya" diklik: ${sel}`);
        nextClicked = true;
        await delay(2000);
        break;
      } catch (e) {
        continue;
      }
    }

    if (!nextClicked) {
      console.log("ℹ️  Tombol 'Berikutnya' tidak muncul. Lanjut ke 'Posting'...");
    }

    // Klik tombol "Posting"
    const postButtonSelectors = [
      'div[aria-label="Kirim"]',
      'div[aria-label="Posting"]',
      'div[aria-label="Post"]',
      'div[role="button"]:text("Kirim")',
      'div[role="button"]:text("Posting")',
      'div[role="button"]:text("Post")'
    ];

    let posted = false;
    for (const sel of postButtonSelectors) {
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
        await page.screenshot({ path: path.join(ARTIFACTS_DIR, "autoupdate_error.png") });
        console.log("📸 Screenshot error disimpan.");
      } catch (e) {
        console.error("❌ Gagal ambil screenshot:", e.message);
      }
    }
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = main;

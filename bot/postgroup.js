// bot/postgroup.js
const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

// Paths
const TARGET_GROUPS_PATH = path.join(__dirname, "../target_groups.txt");
const POST_CONTENT_PATH = path.join(__dirname, "../post_content.txt");
const REELS_URLS_PATH = path.join(__dirname, "../reels_urls.txt");
const LAST_CONTENT_INDEX_PATH = path.join(__dirname, "../last_content_index.txt");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts");
const GEMINI_KEYS_PATH = path.join(__dirname, "../gemini_keys.txt");

// Load config
const config = require("../config/configpostgroup.json");

// Helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const getRandomInterval = () =>
  1000 * (Math.floor(Math.random() * (config.maxIntervalSeconds - config.minIntervalSeconds + 1)) + config.minIntervalSeconds);

// HAPUS VALIDASI LISENSI — Tidak perlu lagi
async function checkLicense() {
  console.log("✅ Validasi lisensi dinonaktifkan. Bot berjalan lokal.");
  return true;
}

// Load cookies
async function loadCookiesFromEnv() {
  const cookieString = process.env.FACEBOOK_COOKIES;
  if (!cookieString) throw new Error("FACEBOOK_COOKIES tidak ditemukan!");
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

// Load target groups
async function loadTargetGroups() {
  try {
    const data = await fs.readFile(TARGET_GROUPS_PATH, "utf8");
    return data.split("\n").map(line => line.trim()).filter(Boolean);
  } catch (e) {
    if (e.code === "ENOENT") throw new Error("File target_groups.txt tidak ditemukan!");
    throw e;
  }
}

// Load Gemini Keys
async function loadGeminiKeys() {
  try {
    const keys = await fs.readFile(GEMINI_KEYS_PATH, "utf8");
    return keys.split("\n").map(k => k.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

// Generate konten dari Gemini
async function generateContentFromGemini() {
  if (!config.ai_status?.enabled) return null;
  const keys = await loadGeminiKeys();
  if (keys.length === 0) return null;

  const prompt = config.ai_status.prompt;
  for (const key of keys) {
    try {
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${key}`,
        { contents: [{ parts: [{ text: prompt }] }] },
        { headers: { "Content-Type": "application/json" } }
      );
      return res.data.candidates[0].content.parts[0].text.trim();
    } catch (e) {
      continue;
    }
  }
  return null;
}

// Load konten berdasarkan mode
async function loadPostContent() {
  try {
    if (config.post_mode === "reels") {
      const data = await fs.readFile(REELS_URLS_PATH, "utf8");
      return data.split("\n").map(url => url.trim()).filter(url => url.startsWith("https://"));
    } else {
      const data = await fs.readFile(POST_CONTENT_PATH, "utf8");
      return data.split("---").map(text => text.trim()).filter(Boolean);
    }
  } catch (e) {
    throw new Error(`${config.post_mode === "reels" ? "reels_urls.txt" : "post_content.txt"} tidak ditemukan!`);
  }
}

// Load & save index
async function loadLastIndex() {
  try {
    const data = await fs.readFile(LAST_CONTENT_INDEX_PATH, "utf8");
    return parseInt(data.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

async function saveLastIndex(idx) {
  await fs.writeFile(LAST_CONTENT_INDEX_PATH, String(idx), "utf8");
}

// Main
async function main() {
  let browser;
  console.log("🚀 Memulai bot Auto Posting Grup...");

  try {
    await checkLicense();
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    const targetGroups = await loadTargetGroups();
    let postContent = await loadPostContent();
    let lastIndex = await loadLastIndex();

    if (targetGroups.length === 0) return console.log("❌ Tidak ada grup target.");
    if (postContent.length === 0) return console.log("❌ Konten kosong.");

    // Tambahkan konten baru dari AI jika diaktifkan
    if (config.ai_status?.enabled) {
      const newContent = await generateContentFromGemini();
      if (newContent && !postContent.includes(newContent)) {
        postContent.push(newContent);
        await fs.writeFile(POST_CONTENT_PATH, postContent.join("---\n"), "utf8");
        console.log("💾 Konten baru dari AI disimpan.");
      }
    }

    browser = await puppeteer.launch({
      headless: config.headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const cookies = await loadCookiesFromEnv();
    await page.setCookie(...cookies);
    console.log("✅ Cookies dimuat.");

    for (const group of targetGroups) {
      const content = postContent[lastIndex % postContent.length];
      console.log(`\n📝 Posting ke: ${group}`);
      console.log(`📄 Konten: ${content.substring(0, 100)}...`);

      try {
        await page.goto(group, { waitUntil: "networkidle2" });
        await delay(7000);

        const selector = 'div[role="button"][tabindex="0"]:has-text("Tulis sesuatu"), div[role="button"]:has-text("Write something")';
        await page.waitForSelector(selector, { timeout: 15000 });
        await page.click(selector);
        await delay(3000);

        const input = 'div[aria-label*="post"], div[aria-label*="Tulis"]';
        await page.waitForSelector(input, { timeout: 10000 });
        await page.type(input, content, { delay: 50 });

        await delay(1000 * config.linkPreviewIntervalSeconds);

        const postButton = 'div[aria-label="Posting"], div[aria-label="Post"]';
        await page.waitForSelector(postButton, { visible: true, timeout: 10000 });
        await page.click(postButton);

        console.log(`✅ Posting berhasil ke: ${group}`);
        lastIndex++;
        await delay(getRandomInterval());

      } catch (error) {
        console.error(`❌ Gagal ke ${group}:`, error.message);
        await page.screenshot({ path: path.join(ARTIFACTS_DIR, `error_${targetGroups.indexOf(group)}.png`) });
      }
    }

    await saveLastIndex(lastIndex);
    console.log("🏁 Bot selesai.");

  } catch (error) {
    console.error("🚨 Error:", error.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

main();
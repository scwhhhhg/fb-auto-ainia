// bot/autoshare_reels.js
const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

// Paths
const TARGET_GROUPS_PATH = path.join(__dirname, "../target_groups.txt");
const REELS_URLS_PATH = path.join(__dirname, "../reels_urls.txt");
const GEMINI_KEYS_PATH = path.join(__dirname, "../gemini_keys.txt");
const CONFIG_PATH = path.join(__dirname, "../config/configshare_reels.json");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts");
const LOG_CAPTION_PATH = path.join(__dirname, "../log_caption.txt");

// Load config
const config = require("../config/configshare_reels.json");

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

// Load target groups
async function loadTargetGroups() {
  try {
    const data = await fs.readFile(TARGET_GROUPS_PATH, "utf8");
    return data.split("\n").map(g => g.trim()).filter(Boolean);
  } catch (e) {
    if (e.code === "ENOENT") throw new Error("File target_groups.txt tidak ditemukan!");
    throw e;
  }
}

// Load Reels URLs
async function loadReelsUrls() {
  try {
    const data = await fs.readFile(REELS_URLS_PATH, "utf8");
    return data.split("\n").map(u => u.trim()).filter(u => u.startsWith("https://www.facebook.com/reel/"));
  } catch (e) {
    if (e.code === "ENOENT") throw new Error("File reels_urls.txt tidak ditemukan!");
    throw e;
  }
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

// Generate caption dari Gemini
async function generateCaptionFromGemini(videoCaption = "") {
  if (!config.ai_caption.enabled) return config.ai_caption.static_text || "";

  const keys = await loadGeminiKeys();
  const prompt = config.ai_caption.prompt
    .replace("{CAPTION_VIDEO}", videoCaption.substring(0, 200))
    .trim();

  for (const [index, key] of keys.entries()) {
    try {
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${key}`,
        { contents: [{ parts: [{ text: prompt }] }] },
        { headers: { "Content-Type": "application/json" }, timeout: 10000 }
      );
      const caption = res.data.candidates[0].content.parts[0].text.trim();
      console.log(`✅ Caption dari Gemini (API Key #${index + 1}): ${caption}`);
      return caption;
    } catch (error) {
      const msg = error.response?.data?.error?.message || error.message;
      console.error(`❌ Gagal dengan API Key #${index + 1}:`, msg);
    }
  }
  console.log("⚠️ Semua API Key gagal. Gunakan caption default.");
  return config.ai_caption.fallback_text || "Lihat video ini! 🚀";
}

// Simpan log caption
async function logCaption(reelUrl, caption) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${reelUrl} | ${caption}`;
  try {
    await fs.appendFile(LOG_CAPTION_PATH, logEntry + "\n", "utf8");
  } catch (e) {
    console.error("⚠️ Gagal simpan log caption:", e.message);
  }
}

// Main
async function main() {
  let browser;
  console.log("📤 Memulai Auto Share Reels + Caption AI...");

  try {
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    const groups = await loadTargetGroups();
    const reels = await loadReelsUrls();
    const cookies = await loadCookiesFromEnv();

    if (groups.length === 0) throw new Error("Tidak ada grup target.");
    if (reels.length === 0) throw new Error("Tidak ada Reels di reels_urls.txt.");

    browser = await puppeteer.launch({
      headless: config.headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setCookie(...cookies);

    for (const group of groups) {
      const reelUrl = reels[Math.floor(Math.random() * reels.length)];
      console.log(`\n📌 Membagikan ke grup: ${group}`);

      try {
        await page.goto(reelUrl, { waitUntil: "networkidle2" });
        await delay(5000);

        // Ambil caption video asli (untuk prompt AI)
        const videoCaption = await page.$eval('div[data-ad-preview="message"]', el => el.textContent).catch(() => "");

        // Klik "Bagikan"
        const shareBtn = await page.$('div[aria-label="Bagikan"], div[aria-label="Share"]');
        if (shareBtn) await shareBtn.click();
        await delay(3000);

        // Pilih "Bagikan ke Grup"
        const shareToGroup = await page.$('span:text("Bagikan ke grup"), span:text("Share to Group")');
        if (shareToGroup) await shareToGroup.click();
        await delay(3000);

        // Input nama grup
        const input = await page.$('input[type="text"], div[contenteditable="true"]');
        if (input) {
          await input.click();
          await page.keyboard.type(group.split("/").pop(), { delay: 100 });
        }
        await delay(2000);

        const option = await page.$('div[role="listbox"] div[role="option"]:first-child');
        if (option) await option.click();
        await delay(1000);

        // Tambahkan caption dari AI
        const captionBox = await page.$('div[aria-label="Komentar Anda"], div[aria-label="Your comment"]');
        if (captionBox) {
          await captionBox.click();
          const caption = await generateCaptionFromGemini(videoCaption);
         

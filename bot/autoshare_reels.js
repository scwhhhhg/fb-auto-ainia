// bot/autoshare_reels.js
const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

// Paths
const TARGET_GROUPS_PATH = path.join(__dirname, "../target_groups.txt");
const REELS_URLS_PATH = path.join(__dirname, "../reels_urls.txt");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts");
const GEMINI_KEYS_PATH = path.join(__dirname, "../gemini_keys.txt");
const SHARED_REELS_HISTORY_PATH = path.join(__dirname, "../shared_reels_history.txt");
const CONFIG_PATH = path.join(__dirname, "../config/configshare_reels.json");

// Load config
const config = require("../config/configshare_reels.json");

// Helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const getRandomInterval = () =>
  1000 * (Math.floor(Math.random() * (config.maxIntervalSeconds - config.minIntervalSeconds + 1)) + config.minIntervalSeconds);

const MAX_HISTORY_DAYS = 7;
const oneWeekAgo = Math.floor(Date.now() / 1000) - MAX_HISTORY_DAYS * 24 * 60 * 60;

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

// Load daftar Reels dari file
async function loadReelsUrls() {
  try {
    const data = await fs.readFile(REELS_URLS_PATH, "utf8");
    return data.split("\n").map(url => url.trim()).filter(url => url.startsWith("https://www.facebook.com/reel/"));
  } catch (e) {
    if (e.code === "ENOENT") throw new Error("File reels_urls.txt tidak ditemukan!");
    throw e;
  }
}

// Bersihkan history > 7 hari
async function cleanupOldHistory() {
  try {
    const data = await fs.readFile(SHARED_REELS_HISTORY_PATH, "utf8");
    const lines = data.split("\n").filter(Boolean);
    const recentLines = lines.filter(line => {
      const [_, timestampStr] = line.split("|");
      const timestamp = parseInt(timestampStr, 10);
      return !isNaN(timestamp) && timestamp >= oneWeekAgo;
    });
    await fs.writeFile(SHARED_REELS_HISTORY_PATH, recentLines.join("\n"), "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") {
      console.error("⚠️ Gagal cleanup history:", e.message);
    } else {
      await fs.writeFile(SHARED_REELS_HISTORY_PATH, "", "utf8");
    }
  }
}

// Load history Reels yang sudah dibagikan
async function loadSharedReelsHistory() {
  await cleanupOldHistory();
  try {
    const data = await fs.readFile(SHARED_REELS_HISTORY_PATH, "utf8");
    const lines = data.split("\n").filter(Boolean);
    return new Set(lines.map(line => line.split("|")[0]));
  } catch {
    return new Set();
  }
}

// Simpan Reels ke history
async function addReelToHistory(url) {
  const now = Math.floor(Date.now() / 1000);
  const entry = `${url}|${now}`;
  try {
    const data = await fs.readFile(SHARED_REELS_HISTORY_PATH, "utf8");
    const lines = data.split("\n").filter(Boolean);
    lines.push(entry);
    await fs.writeFile(SHARED_REELS_HISTORY_PATH, lines.join("\n"), "utf8");
  } catch {
    await fs.writeFile(SHARED_REELS_HISTORY_PATH, entry, "utf8");
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

// Generate caption dari Gemini
async function generateCaptionFromGemini(videoCaption) {
  const prompt = config.ai_caption_prompt.replace("{CAPTION_VIDEO}", videoCaption).trim();
  const keys = await loadGeminiKeys();
  if (keys.length === 0) return null;

  for (const key of keys) {
    try {
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${key}`,
        { contents: [{ parts: [{ text: prompt }] }] },
        { headers: { "Content-Type": "application/json" } }
      );
      return res.data.candidates[0].content.parts[0].text.trim();
    } catch (e) {
      console.error("Gemini error:", e.response?.data?.error?.message || e.message);
      continue;
    }
  }
  return null;
}

// Main function
async function main() {
  let browser;
  console.log("🚀 Memulai bot Auto-Share Reels...");

  try {
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    const targetGroups = await loadTargetGroups();
    const reelsList = await loadReelsUrls();
    const sharedHistory = await loadSharedReelsHistory();

    if (targetGroups.length === 0) throw new Error("Tidak ada grup target.");
    if (reelsList.length === 0) throw new Error("Tidak ada Reels di reels_urls.txt.");

    browser = await puppeteer.launch({
      headless: config.headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const cookies = await loadCookiesFromEnv();
    await page.setCookie(...cookies);
    console.log("✅ Cookies dimuat.");

    let sharedCount = 0;
    const maxShares = Math.min(config.maxSharesPerRun, targetGroups.length);

    for (const group of targetGroups) {
      if (sharedCount >= maxShares) break;

      // Cari Reels yang belum pernah dibagikan
      let reelUrl = null;
      for (const url of reelsList) {
        if (!sharedHistory.has(url)) {
          reelUrl = url;
          break;
        }
      }

      if (!reelUrl) {
        console.log("❌ Semua Reels sudah dibagikan dalam 7 hari terakhir.");
        break;
      }

      console.log(`📌 Membagikan ke grup: ${group}`);

      try {
        await page.goto(reelUrl, { waitUntil: "networkidle2", timeout: 60000 });
        await delay(5000);

        // Klik tombol "Bagikan"
        const shareButton = await page.$('div[aria-label="Bagikan"], div[aria-label="Share"]');
        if (!shareButton) throw new Error("Tombol bagikan tidak ditemukan");
        await shareButton.click();
        await delay(3000);

        // Pilih "Bagikan ke Grup"
        const shareToGroup = await page.$('span:text("Bagikan ke grup"), span:text("Share to Group")');
        if (!shareToGroup) throw new Error("Opsi 'Bagikan ke grup' tidak muncul");
        await shareToGroup.click();
        await delay(3000);

        // Input nama grup
        const groupInput = await page.$('input[type="text"], div[contenteditable="true"]');
        if (!groupInput) throw new Error("Input grup tidak ditemukan");
        await groupInput.click();
        await page.keyboard.type(group.split("/").pop().split("?")[0], { delay: 100 });
        await delay(2000);

        // Pilih opsi pertama
        const firstOption = await page.$('div[role="listbox"] div[role="option"]:first-child');
        if (firstOption) await firstOption.click();
        await delay(1000);

        // Tambahkan caption
        if (config.caption_mode === "ai" || config.caption_mode === "static") {
          const captionBox = await page.$('div[aria-label="Komentar Anda"], div[aria-label="Your comment"]');
          if (captionBox) {
            await captionBox.click();
            let caption = "";

            if (config.caption_mode === "ai") {
              const videoText = await page.$eval('div[data-ad-preview="message"]', el => el.textContent).catch(() => "");
              caption = await generateCaptionFromGemini(videoText) || config.static_caption;
            } else {
              caption = config.static_caption;
            }

            await page.keyboard.type(caption, { delay: 100 });
          }
        }

        // Klik "Posting"
        const postButton = await page.$('div[aria-label="Posting"], div[aria-label="Post"]');
        if (postButton) {
          await postButton.click();
          console.log(`✅ Berhasil share ke: ${group}`);
          await addReelToHistory(reelUrl);
          sharedCount++;
        } else {
          console.log("❌ Tombol 'Posting' tidak ditemukan.");
        }

        await delay(getRandomInterval());

      } catch (error) {
        console.error(`❌ Gagal share ke ${group}:`, error.message);
        await page.screenshot({ path: path.join(ARTIFACTS_DIR, `share_error_${sharedCount}.png`) });
        await page.keyboard.press("Escape").catch(() => {});
      }
    }

    console.log(`🏁 Selesai. ${sharedCount} Reels berhasil dibagikan.`);

  } catch (error) {
    console.error("🚨 Error:", error.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

main();
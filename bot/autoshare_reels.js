// bot/autoshare_reels.js
const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");

// Paths
const TARGET_GROUPS_PATH = path.join(__dirname, "../target_groups.txt");
const REELS_URLS_PATH = path.join(__dirname, "../reels_urls.txt");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts");
const GEMINI_KEYS_PATH = path.join(__dirname, "../gemini_keys.txt");
const CONFIG_PATH = path.join(__dirname, "../config/configshare_reels.json");

// Load config
let config;
try {
  config = require("../config/configshare_reels.json");
} catch (e) {
  console.log("⚠️ configshare_reels.json tidak ditemukan, gunakan default.");
  config = {
    headless: true,
    minIntervalSeconds: 60,
    maxIntervalSeconds: 180,
    ai_caption: {
      enabled: false,
      static_text: "Lihat video ini! 🚀"
    }
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
    if (e.code === "ENOENT") return [];
    throw e;
  }
}

// Generate caption dari Gemini
async function generateCaptionFromGemini(videoCaption = "") {
  if (!config.ai_caption?.enabled) return config.ai_caption?.static_text || "";

  const keys = await loadGeminiKeys();
  if (keys.length === 0) return "Lihat video ini! 🚀";

  const prompt = config.ai_caption.prompt
    ? config.ai_caption.prompt.replace("{CAPTION_VIDEO}", videoCaption.substring(0, 200))
    : `Buat caption viral untuk Reels ini: ${videoCaption}. Gaya santai, 1-2 kalimat, 1 emoji.`;

  for (const key of keys) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await res.json();
      return data.candidates[0].content.parts[0].text.trim();
    } catch (error) {
      console.error("Gemini error:", error.message);
      continue;
    }
  }
  return "Lihat video ini! 🚀";
}

// Main
async function main() {
  let browser = null;
  let page = null;

  console.log("📤 Memulai Auto Share Reels...");

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

    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setCookie(...cookies);

    for (const group of groups) {
      const reelUrl = reels[Math.floor(Math.random() * reels.length)];
      console.log(`\n📌 Membagikan ke grup: ${group}`);

      try {
        await page.goto(reelUrl, { waitUntil: "networkidle2" });
        await delay(5000);

        // Klik tombol "Bagikan"
        const shareBtn = await page.$('div[aria-label="Bagikan"], div[aria-label="Share"]');
        if (shareBtn) {
          await shareBtn.click();
          await delay(3000);
        } else {
          throw new Error("Tombol 'Bagikan' tidak ditemukan.");
        }

        // Cari dan klik tombol "Bagikan ke grup" tanpa :text()
        const shareToGroupXpath = "//span[text()='Bagikan ke grup'] | //span[text()='Share to Group']";
        const [shareToGroup] = await page.$x(shareToGroupXpath);
        if (shareToGroup) {
          await shareToGroup.click();
          console.log("✅ Tombol 'Bagikan ke grup' diklik.");
          await delay(3000);
        } else {
          throw new Error("Tombol 'Bagikan ke grup' tidak ditemukan.");
        }

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

        // Ambil caption video (untuk AI)
        const videoCaption = await page.$eval('div[data-ad-preview="message"]', el => el.textContent).catch(() => "");

        // Tambahkan caption
        const captionBox = await page.$('div[aria-label="Komentar Anda"], div[aria-label="Your comment"]');
        if (captionBox) {
          await captionBox.click();
          const caption = await generateCaptionFromGemini(videoCaption);
          await page.keyboard.type(caption, { delay: 100 });
        }

        // Klik "Posting"
        const postBtn = await page.$('div[aria-label="Posting"], div[aria-label="Post"]');
        if (postBtn) {
          await postBtn.click();
          console.log(`✅ Berhasil share ke: ${group}`);
        }

        await delay(getRandomInterval());

      } catch (error) {
        console.error(`❌ Gagal share ke ${group}:`, error.message);
        if (page) {
          try {
            await page.screenshot({ path: path.join(ARTIFACTS_DIR, `share_error_${Date.now()}.png`) });
          } catch {}
        }
      }
    }

    console.log("✅ Semua tugas selesai.");

  } catch (error) {
    console.error("🚨 Error:", error.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

main();

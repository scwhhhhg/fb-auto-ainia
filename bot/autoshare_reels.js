// bot/autoshare_reels.js
const puppeteer = require("puppeteer"); // v23.0.0 or later
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
      const fetch = require("node-fetch");
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

// Function to click share button using Locator.race (from recording)
async function clickShareButton(page, timeout = 10000) {
  try {
    await puppeteer.Locator.race([
      page.locator('::-p-aria(Bagikan) >>>> ::-p-aria([role="generic"])'),
      page.locator('div.xuk3077 div:nth-of-type(4) i'),
      page.locator('div[aria-label="Bagikan"]'),
      page.locator('div[aria-label="Share"]'),
      page.locator('::-p-aria(Share) >>>> ::-p-aria([role="generic"])'),
      page.locator('[data-testid="post_share_button"]')
    ])
      .setTimeout(timeout)
      .click();
    return true;
  } catch (error) {
    console.error("Error clicking share button:", error.message);
    return false;
  }
}

// Function to click "Share to Group" button
async function clickShareToGroupButton(page, timeout = 10000) {
  try {
    await puppeteer.Locator.race([
      page.locator('div:nth-of-type(4) div:nth-of-type(5) i'),
      page.locator('::-p-text(Bagikan ke grup)'),
      page.locator('::-p-text(Share to Group)'),
      page.locator('div[role="button"]:has-text("Bagikan ke grup")'),
      page.locator('div[role="button"]:has-text("Share to Group")'),
      page.locator('span:has-text("Bagikan ke grup")'),
      page.locator('span:has-text("Share to Group")')
    ])
      .setTimeout(timeout)
      .click();
    return true;
  } catch (error) {
    console.error("Error clicking share to group button:", error.message);
    return false;
  }
}

// Function to select group from dropdown
async function selectGroupFromDropdown(page, groupName, timeout = 10000) {
  try {
    // Wait for and click the input field
    await puppeteer.Locator.race([
      page.locator('input[type="text"][placeholder*="grup"]'),
      page.locator('input[type="text"][placeholder*="group"]'),
      page.locator('input[type="text"]'),
      page.locator('div[contenteditable="true"]')
    ])
      .setTimeout(timeout)
      .click();

    await delay(1000);

    // Clear existing text and type group name
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.press('Delete');
    
    await page.keyboard.type(groupName, { delay: 100 });
    await delay(2000);

    // Select first option from dropdown (similar to recording pattern)
    await puppeteer.Locator.race([
      page.locator('div[role="listbox"] div[role="option"]:first-child'),
      page.locator('div[role="option"]:first-child'),
      page.locator('ul[role="listbox"] li:first-child'),
      page.locator('[role="option"]').setEnsureElementIsInTheViewport(false).nth(0)
    ])
      .setTimeout(5000)
      .click();

    return true;
  } catch (error) {
    console.error("Error selecting group:", error.message);
    return false;
  }
}

// Function to add caption
async function addCaption(page, caption, timeout = 5000) {
  try {
    await puppeteer.Locator.race([
      page.locator('div[aria-label="Komentar Anda"]'),
      page.locator('div[aria-label="Your comment"]'),
      page.locator('div[contenteditable="true"][data-text*="Tulis"]'),
      page.locator('div[contenteditable="true"][data-text*="Write"]'),
      page.locator('textarea[placeholder*="comment"]'),
      page.locator('div[contenteditable="true"]')
    ])
      .setTimeout(timeout)
      .click();

    await delay(1000);
    await page.keyboard.type(caption, { delay: 80 });
    return true;
  } catch (error) {
    console.error("Error adding caption:", error.message);
    return false;
  }
}

// Function to click post button (similar to recording pattern)
async function clickPostButton(page, timeout = 10000) {
  try {
    await puppeteer.Locator.race([
      page.locator('div.x1uvtmcs > div > div > div > div > div.x78zum5 div.x1l90r2v span > span'),
      page.locator('div[aria-label="Posting"]'),
      page.locator('div[aria-label="Post"]'),
      page.locator('button[type="submit"]'),
      page.locator('div[role="button"][aria-label*="Post"]'),
      page.locator('div[role="button"][aria-label*="Posting"]'),
      page.locator('::-p-text(Posting)'),
      page.locator('::-p-text(Post)')
    ])
      .setTimeout(timeout)
      .click();
    return true;
  } catch (error) {
    console.error("Error clicking post button:", error.message);
    return false;
  }
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
    const timeout = 10000;
    page.setDefaultTimeout(timeout);

    // Set viewport similar to recording
    await page.setViewport({ width: 966, height: 703 });
    await page.setCookie(...cookies);

    for (const group of groups) {
      const reelUrl = reels[Math.floor(Math.random() * reels.length)];
      console.log(`\n📌 Membagikan ke grup: ${group}`);
      console.log(`🎬 Reels URL: ${reelUrl}`);

      try {
        // Navigate to reel (similar to recording)
        await page.goto('https://www.facebook.com/');
        await delay(3000);
        await page.goto(reelUrl);
        await delay(7000);

        // Step 1: Click share button
        console.log("🔍 Mencari tombol 'Bagikan/Share'...");
        const shareClicked = await clickShareButton(page, timeout);
        if (!shareClicked) {
          throw new Error("Tombol 'Bagikan/Share' tidak ditemukan.");
        }
        console.log("✅ Tombol 'Bagikan/Share' diklik.");
        await delay(3000);

        // Step 2: Click "Share to Group"
        console.log("🔍 Mencari tombol 'Bagikan ke grup'...");
        const shareToGroupClicked = await clickShareToGroupButton(page, timeout);
        if (!shareToGroupClicked) {
          throw new Error("Tombol 'Bagikan ke grup' tidak ditemukan.");
        }
        console.log("✅ Tombol 'Bagikan ke grup' diklik.");
        await delay(4000);

        // Step 3: Select group
        console.log("🔍 Memilih grup dari dropdown...");
        const groupName = group.split("/").pop();
        const groupSelected = await selectGroupFromDropdown(page, groupName, timeout);
        if (!groupSelected) {
          throw new Error("Gagal memilih grup dari dropdown.");
        }
        console.log(`✅ Grup dipilih: ${groupName}`);
        await delay(2000);

        // Step 4: Add caption (optional)
        console.log("🔍 Menambahkan caption...");
        let videoCaption = "";
        try {
          videoCaption = await page.$eval('div[data-ad-preview="message"]', el => el.textContent);
        } catch (e) {
          // Caption not found, use empty string
        }

        const caption = await generateCaptionFromGemini(videoCaption);
        const captionAdded = await addCaption(page, caption, 5000);
        if (captionAdded) {
          console.log(`✅ Caption ditambahkan: ${caption}`);
        } else {
          console.log("⚠️ Area komentar tidak ditemukan, lanjut tanpa caption.");
        }
        await delay(2000);

        // Step 5: Click post button
        console.log("🔍 Mencari tombol 'Posting/Post'...");
        const postClicked = await clickPostButton(page, timeout);
        if (postClicked) {
          console.log(`✅ Berhasil share ke: ${group}`);
        } else {
          console.log(`⚠️ Tombol 'Post' tidak ditemukan, kemungkinan sudah ter-post: ${group}`);
        }

        const interval = getRandomInterval();
        console.log(`🕒 Jeda selama ${interval/1000} detik sebelum ke grup berikutnya...`);
        await delay(interval);

      } catch (error) {
        console.error(`❌ Gagal share ke ${group}:`, error.message);
        if (page) {
          try {
            const screenshotPath = path.join(ARTIFACTS_DIR, `share_error_${Date.now()}_${groups.indexOf(group)}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`📸 Screenshot error disimpan: ${screenshotPath}`);
          } catch (screenshotError) {
            console.error("Gagal mengambil screenshot:", screenshotError.message);
          }
        }
        
        // Continue to next group instead of stopping
        continue;
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

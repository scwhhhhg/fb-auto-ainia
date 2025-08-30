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

// Function to wait for and click element with multiple selectors
async function waitAndClick(page, selectors, timeout = 10000) {
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: timeout / selectors.length, visible: true });
      const element = await page.$(selector);
      if (element) {
        await element.click();
        return true;
      }
    } catch (e) {
      // Continue to next selector
    }
  }
  return false;
}

// Function to wait for XPath with multiple options
async function waitAndClickXPath(page, xpaths, timeout = 10000) {
  const timeoutPerXpath = timeout / xpaths.length;
  
  for (const xpath of xpaths) {
    try {
      await page.waitForXPath(xpath, { timeout: timeoutPerXpath, visible: true });
      const [element] = await page.$x(xpath);
      if (element) {
        await element.click();
        return true;
      }
    } catch (e) {
      // Continue to next xpath
    }
  }
  return false;
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
      console.log(`🎬 Reels URL: ${reelUrl}`);

      try {
        await page.goto(reelUrl, { waitUntil: "networkidle2" });
        await delay(7000);

        // Multiple selectors untuk tombol "Bagikan/Share"
        const shareSelectors = [
          'div[aria-label="Bagikan"]',
          'div[aria-label="Share"]',
          'div[role="button"][aria-label*="Bagikan"]',
          'div[role="button"][aria-label*="Share"]',
          '[data-testid="post_share_button"]',
          'div[role="button"]:has-text("Bagikan")',
          'div[role="button"]:has-text("Share")'
        ];

        const shareXPaths = [
          '//div[@role="button" and (@aria-label="Bagikan" or @aria-label="Share")]',
          '//div[@role="button" and (contains(text(), "Bagikan") or contains(text(), "Share"))]',
          '//span[text()="Bagikan"]/parent::div[@role="button"]',
          '//span[text()="Share"]/parent::div[@role="button"]',
          '//div[contains(@aria-label, "Bagikan") or contains(@aria-label, "Share")][@role="button"]'
        ];

        console.log("🔍 Mencari tombol 'Bagikan/Share'...");
        
        let shareClicked = false;
        
        // Try CSS selectors first
        shareClicked = await waitAndClick(page, shareSelectors, 8000);
        
        // If CSS selectors fail, try XPath
        if (!shareClicked) {
          shareClicked = await waitAndClickXPath(page, shareXPaths, 8000);
        }

        if (!shareClicked) {
          throw new Error("Tombol 'Bagikan/Share' tidak ditemukan setelah mencoba semua selector.");
        }

        console.log("✅ Tombol 'Bagikan/Share' diklik.");
        await delay(4000);

        // Multiple selectors untuk "Bagikan ke grup"
        const shareToGroupXPaths = [
          '//span[text()="Bagikan ke grup"]/ancestor::div[@role="button"]',
          '//span[text()="Share to Group"]/ancestor::div[@role="button"]',
          '//div[@role="button" and contains(., "Bagikan ke grup")]',
          '//div[@role="button" and contains(., "Share to Group")]',
          '//div[contains(text(), "Bagikan ke grup")][@role="button"]',
          '//div[contains(text(), "Share to Group")][@role="button"]'
        ];

        console.log("🔍 Mencari tombol 'Bagikan ke grup'...");
        const shareToGroupClicked = await waitAndClickXPath(page, shareToGroupXPaths, 10000);

        if (!shareToGroupClicked) {
          throw new Error("Tombol 'Bagikan ke grup' tidak ditemukan.");
        }

        console.log("✅ Tombol 'Bagikan ke grup' diklik.");
        await delay(4000);

        // Input nama grup dengan multiple selectors
        const inputSelectors = [
          'input[type="text"][placeholder*="grup"]',
          'input[type="text"][placeholder*="group"]',
          'div[contenteditable="true"][data-text*="grup"]',
          'div[contenteditable="true"][data-text*="group"]',
          'input[type="text"]',
          'div[contenteditable="true"]'
        ];

        console.log("🔍 Mencari input field untuk grup...");
        let inputFound = false;
        
        for (const selector of inputSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 2000, visible: true });
            const input = await page.$(selector);
            if (input) {
              await input.click();
              await delay(1000);
              
              // Clear existing text
              await page.keyboard.down('Control');
              await page.keyboard.press('KeyA');
              await page.keyboard.up('Control');
              await page.keyboard.press('Delete');
              
              // Type group name (extract from URL)
              const groupName = group.split("/").pop();
              await page.keyboard.type(groupName, { delay: 100 });
              console.log(`✅ Mengetik nama grup: ${groupName}`);
              inputFound = true;
              break;
            }
          } catch (e) {
            continue;
          }
        }

        if (!inputFound) {
          throw new Error("Input field untuk grup tidak ditemukan.");
        }

        await delay(3000);

        // Pilih grup pertama dari dropdown
        const optionSelectors = [
          'div[role="listbox"] div[role="option"]:first-child',
          'div[role="option"]:first-child',
          'ul[role="listbox"] li:first-child',
          'div[data-testid*="typeahead"] div:first-child'
        ];

        console.log("🔍 Mencari opsi grup di dropdown...");
        const optionClicked = await waitAndClick(page, optionSelectors, 5000);
        
        if (optionClicked) {
          console.log("✅ Grup dipilih dari dropdown.");
        } else {
          console.log("⚠️ Dropdown tidak ditemukan, lanjut ke langkah berikutnya.");
        }

        await delay(2000);

        // Ambil caption video untuk AI (optional)
        let videoCaption = "";
        try {
          videoCaption = await page.$eval('div[data-ad-preview="message"]', el => el.textContent);
        } catch (e) {
          // Caption not found, use empty string
        }

        // Tambahkan caption dengan multiple selectors
        const captionSelectors = [
          'div[aria-label="Komentar Anda"]',
          'div[aria-label="Your comment"]',
          'div[contenteditable="true"][data-text*="Tulis"]',
          'div[contenteditable="true"][data-text*="Write"]',
          'textarea[placeholder*="comment"]',
          'div[contenteditable="true"]'
        ];

        console.log("🔍 Mencari area komentar...");
        let captionAdded = false;
        
        for (const selector of captionSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 2000, visible: true });
            const captionBox = await page.$(selector);
            if (captionBox) {
              await captionBox.click();
              await delay(1000);
              
              const caption = await generateCaptionFromGemini(videoCaption);
              await page.keyboard.type(caption, { delay: 80 });
              console.log(`✅ Caption ditambahkan: ${caption}`);
              captionAdded = true;
              break;
            }
          } catch (e) {
            continue;
          }
        }

        if (!captionAdded) {
          console.log("⚠️ Area komentar tidak ditemukan, lanjut tanpa caption.");
        }

        await delay(2000);

        // Klik tombol "Posting/Post"
        const postSelectors = [
          'div[aria-label="Posting"]',
          'div[aria-label="Post"]',
          'button[type="submit"]',
          'div[role="button"][aria-label*="Post"]',
          'div[role="button"][aria-label*="Posting"]'
        ];

        const postXPaths = [
          '//div[@role="button" and (@aria-label="Posting" or @aria-label="Post")]',
          '//button[text()="Posting" or text()="Post"]',
          '//div[@role="button" and (contains(text(), "Posting") or contains(text(), "Post"))]'
        ];

        console.log("🔍 Mencari tombol 'Posting/Post'...");
        
        let postClicked = await waitAndClick(page, postSelectors, 5000);
        
        if (!postClicked) {
          postClicked = await waitAndClickXPath(page, postXPaths, 5000);
        }

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

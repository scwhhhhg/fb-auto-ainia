// bot/update_status.js - FIXED VERSION
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

// Debug function to find elements
async function debugElements(page) {
  console.log("🔍 Debug: Mencari elemen posting...");
  
  // Screenshot untuk debug
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, "debug_page.png") });
  console.log("📸 Debug screenshot disimpan di debug_page.png");
  
  // Cek semua div dengan role button
  const buttons = await page.evaluate(() => {
    const elements = document.querySelectorAll('div[role="button"]');
    return Array.from(elements).map((el, index) => ({
      index,
      text: el.innerText?.slice(0, 100) || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      className: el.className || '',
      visible: el.offsetParent !== null
    }));
  });
  
  console.log("🔍 Semua button yang ditemukan:", buttons.filter(b => b.visible));
  
  // Cek elemen dengan contenteditable
  const editables = await page.evaluate(() => {
    const elements = document.querySelectorAll('[contenteditable="true"]');
    return Array.from(elements).map((el, index) => ({
      index,
      tagName: el.tagName,
      ariaLabel: el.getAttribute('aria-label') || '',
      placeholder: el.getAttribute('placeholder') || '',
      className: el.className || '',
      visible: el.offsetParent !== null
    }));
  });
  
  console.log("🔍 Elemen contenteditable yang ditemukan:", editables.filter(e => e.visible));
}

// Improved function to find and click post area
async function findAndClickPostArea(page) {
  console.log("🔍 Mencari area posting...");
  
  // Wait for page to fully load
  await page.waitForLoadState?.('networkidle') || delay(5000);
  
  // Comprehensive selectors for different Facebook layouts
  const postAreaSelectors = [
    // Indonesian text variations
    'div[role="button"]:has-text("Apa yang Anda pikirkan")',
    'div[role="button"]:has-text("What\'s on your mind")',
    '[aria-label*="Create a post"]',
    '[aria-label*="Write something"]',
    '[aria-label*="Tulis sesuatu"]',
    
    // Generic selectors
    'div[role="button"][aria-describedby]',
    'div[data-pagelet="ProfileComposer"] div[role="button"]',
    'div[data-pagelet="composer"] div[role="button"]',
    
    // Fallback selectors
    'div.x1i10hfl[role="button"]',
    'div[role="button"]:not([aria-hidden="true"])',
  ];
  
  // Try each selector
  for (const selector of postAreaSelectors) {
    try {
      console.log(`🔍 Mencoba selector: ${selector}`);
      
      // Wait for element to be present and visible
      await page.waitForFunction((sel) => {
        const elements = document.querySelectorAll(sel);
        for (const el of elements) {
          if (el.offsetParent !== null && 
              el.getBoundingClientRect().height > 10 &&
              el.getBoundingClientRect().width > 10) {
            return true;
          }
        }
        return false;
      }, { timeout: 8000 }, selector);
      
      // Find the actual clickable element
      const element = await page.evaluateHandle((sel) => {
        const elements = document.querySelectorAll(sel);
        for (const el of elements) {
          if (el.offsetParent !== null && 
              el.getBoundingClientRect().height > 10 &&
              el.getBoundingClientRect().width > 10) {
            return el;
          }
        }
        return null;
      }, selector);
      
      if (element) {
        // Scroll to element
        await page.evaluate((el) => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, element);
        
        await delay(2000);
        
        // Click the element
        await element.click();
        console.log(`✅ Area posting ditemukan dan diklik: ${selector}`);
        await delay(3000);
        return true;
      }
    } catch (error) {
      console.log(`❌ Selector gagal: ${selector} - ${error.message}`);
    }
  }
  
  return false;
}

// Improved function to type status
async function typeStatus(page, status) {
  console.log("⌨️  Mengetik status...");
  
  // Wait for composer to open
  await delay(3000);
  
  const inputSelectors = [
    // Rich text editor selectors
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"][aria-label*="post"]',
    'div[contenteditable="true"][aria-label*="Post"]',
    'div[contenteditable="true"][aria-multiline="true"]',
    
    // Fallback selectors
    '[contenteditable="true"]',
    'div[data-text="true"]',
    'div.notranslate',
  ];
  
  for (const selector of inputSelectors) {
    try {
      console.log(`⌨️  Mencoba input selector: ${selector}`);
      
      await page.waitForSelector(selector, { timeout: 8000, visible: true });
      
      // Clear any existing text
      await page.click(selector);
      await page.keyboard.down('Control');
      await page.keyboard.press('KeyA');
      await page.keyboard.up('Control');
      await delay(500);
      
      // Type the status
      await page.type(selector, status, { delay: 100 });
      console.log(`✅ Status berhasil diketik: "${status}"`);
      
      await delay(2000);
      return true;
    } catch (error) {
      console.log(`❌ Input selector gagal: ${selector} - ${error.message}`);
    }
  }
  
  return false;
}

// Improved function to publish post
async function publishPost(page) {
  console.log("📤 Mencari tombol publish...");
  
  // Wait a bit for the post button to become available
  await delay(3000);
  
  const publishSelectors = [
    // Indonesian
    'div[aria-label="Kirim"][role="button"]',
    'div[aria-label="Posting"][role="button"]',
    'div[aria-label="Bagikan"][role="button"]',
    
    // English
    'div[aria-label="Post"][role="button"]',
    'div[aria-label="Share"][role="button"]',
    'div[aria-label="Publish"][role="button"]',
    
    // Generic
    'div[role="button"]:has-text("Post")',
    'div[role="button"]:has-text("Posting")',
    'button[type="submit"]',
  ];
  
  for (const selector of publishSelectors) {
    try {
      console.log(`📤 Mencoba publish selector: ${selector}`);
      
      // Wait for button to be clickable
      await page.waitForFunction((sel) => {
        const elements = document.querySelectorAll(sel);
        for (const el of elements) {
          if (el.offsetParent !== null && 
              !el.disabled &&
              el.getAttribute('aria-disabled') !== 'true' &&
              el.getBoundingClientRect().height > 10) {
            return true;
          }
        }
        return false;
      }, { timeout: 10000 }, selector);
      
      // Click the publish button
      await page.click(selector);
      console.log(`✅ Tombol publish diklik: ${selector}`);
      
      // Wait for post to be published
      await delay(5000);
      
      // Check if post was successful (look for success indicators)
      try {
        await page.waitForFunction(() => {
          return document.querySelector('[aria-label*="posted"]') ||
                 document.querySelector('[data-testid="post-success"]') ||
                 !document.querySelector('div[role="dialog"]'); // Dialog closed
        }, { timeout: 10000 });
        
        return true;
      } catch {
        console.log("⚠️  Tidak dapat konfirmasi post berhasil, tapi tombol sudah diklik");
        return true;
      }
      
    } catch (error) {
      console.log(`❌ Publish selector gagal: ${selector} - ${error.message}`);
    }
  }
  
  return false;
}

// Main function
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
      args: [
        "--no-sandbox", 
        "--disable-setuid-sandbox", 
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor"
      ]
    });

    page = await browser.newPage();
    
    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });
    
    // Set cookies
    await page.setCookie(...cookies);

    console.log("✅ Cookies dimuat. Membuka beranda...");
    
    // Try both home and profile page
    const urls = [
      "https://www.facebook.com/",
      "https://www.facebook.com/profile.php"
    ];
    
    let pageLoaded = false;
    for (const url of urls) {
      try {
        await page.goto(url, { 
          waitUntil: "domcontentloaded",
          timeout: 30000 
        });
        
        await delay(8000);
        
        // Check if page loaded successfully
        const title = await page.title();
        if (!title.includes("Facebook") && !title.includes("Meta")) {
          throw new Error("Page tidak dimuat dengan benar");
        }
        
        console.log(`✅ Berhasil membuka: ${url}`);
        pageLoaded = true;
        break;
      } catch (error) {
        console.log(`❌ Gagal membuka ${url}: ${error.message}`);
      }
    }
    
    if (!pageLoaded) {
      throw new Error("Tidak dapat membuka Facebook");
    }

    // Handle popups and notifications
    const closeSelectors = [
      'div[aria-label="Tutup"]',
      'div[aria-label="Close"]', 
      '[aria-label="Dismiss"]',
      '[aria-label="Not Now"]',
      '[aria-label="Tidak Sekarang"]',
      'div[role="button"]:has-text("Not Now")',
      'div[role="button"]:has-text("Tidak Sekarang")'
    ];
    
    for (const sel of closeSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        await page.click(sel);
        await delay(2000);
        console.log(`✅ Popup ditutup: ${sel}`);
      } catch {}
    }

    // Debug current page
    if (!config.headless) {
      await debugElements(page);
    }

    // Find and click post area
    const postAreaFound = await findAndClickPostArea(page);
    if (!postAreaFound) {
      throw new Error("Tidak dapat menemukan area posting di beranda.");
    }

    // Generate status
    const status = await generateStatusFromGemini(config.gemini_prompt, keys);
    console.log(`🤖 Status yang dihasilkan: "${status}"`);

    // Type status
    const statusTyped = await typeStatus(page, status);
    if (!statusTyped) {
      throw new Error("Tidak dapat mengetik status.");
    }

    // Publish post
    const postPublished = await publishPost(page);
    if (!postPublished) {
      throw new Error("Tidak dapat mempublish post.");
    }

    console.log(`✅ Status berhasil diupdate: "${status}"`);
    await logStatus(status);

    // Final screenshot for verification
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "success_status_update.png") });
    console.log("📸 Screenshot sukses disimpan.");

    await delay(getRandomInterval());

  } catch (error) {
    console.error("🚨 Error:", error.message);
    if (page) {
      try {
        await page.screenshot({ path: path.join(ARTIFACTS_DIR, "update_status_error.png") });
        console.log("📸 Screenshot error disimpan.");
        
        // Save page HTML for debugging
        const html = await page.content();
        await fs.writeFile(path.join(ARTIFACTS_DIR, "error_page.html"), html);
        console.log("📄 HTML page disimpan untuk debug.");
      } catch {}
    }
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('🛑 Bot dihentikan oleh user');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Bot dihentikan oleh sistem');
  process.exit(0);
});

main();

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
  console.log("🔍 Debug: Menganalisa halaman Facebook...");
  
  // Screenshot untuk debug
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, "debug_page.png") });
  console.log("📸 Debug screenshot disimpan di debug_page.png");
  
  // Analisa semua elemen yang mungkin bisa diklik
  const pageAnalysis = await page.evaluate(() => {
    const result = {
      buttons: [],
      inputs: [],
      composers: [],
      pageInfo: {
        title: document.title,
        url: window.location.href,
        userAgent: navigator.userAgent
      }
    };
    
    // Cek semua button
    const buttons = document.querySelectorAll('div[role="button"]');
    buttons.forEach((button, index) => {
      const rect = button.getBoundingClientRect();
      const text = (button.innerText || button.textContent || '').slice(0, 100);
      const ariaLabel = button.getAttribute('aria-label') || '';
      
      if (button.offsetParent !== null && rect.height > 20) {
        result.buttons.push({
          index,
          text: text.trim(),
          ariaLabel,
          className: button.className,
          position: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
          visible: true
        });
      }
    });
    
    // Cek input areas
    const inputs = document.querySelectorAll('[contenteditable="true"], [role="textbox"], textarea');
    inputs.forEach((input, index) => {
      const rect = input.getBoundingClientRect();
      const ariaLabel = input.getAttribute('aria-label') || '';
      const placeholder = input.getAttribute('placeholder') || '';
      
      if (input.offsetParent !== null) {
        result.inputs.push({
          index,
          tagName: input.tagName,
          ariaLabel,
          placeholder,
          className: input.className,
          position: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
        });
      }
    });
    
    // Cek composer areas
    const composers = document.querySelectorAll('[data-pagelet*="composer"], [data-pagelet*="Composer"]');
    composers.forEach((composer, index) => {
      result.composers.push({
        index,
        pagelet: composer.getAttribute('data-pagelet'),
        innerHTML: composer.innerHTML.slice(0, 200)
      });
    });
    
    return result;
  });
  
  console.log("📊 Analisa halaman:");
  console.log(`- Title: ${pageAnalysis.pageInfo.title}`);
  console.log(`- URL: ${pageAnalysis.pageInfo.url}`);
  console.log(`- Buttons ditemukan: ${pageAnalysis.buttons.length}`);
  console.log(`- Input areas ditemukan: ${pageAnalysis.inputs.length}`);
  console.log(`- Composer areas ditemukan: ${pageAnalysis.composers.length}`);
  
  // Show relevant buttons (potential post buttons)
  const relevantButtons = pageAnalysis.buttons.filter(btn => 
    btn.text.toLowerCase().includes('apa yang') ||
    btn.text.toLowerCase().includes('what') ||
    btn.ariaLabel.toLowerCase().includes('post') ||
    btn.ariaLabel.toLowerCase().includes('tulis') ||
    btn.ariaLabel.toLowerCase().includes('create') ||
    (btn.position.top > 100 && btn.position.top < 500 && btn.position.width > 200)
  );
  
  console.log("🎯 Button yang relevan:");
  relevantButtons.forEach(btn => {
    console.log(`  - Text: "${btn.text}" | AriaLabel: "${btn.ariaLabel}" | Pos: ${btn.position.top}px`);
  });
  
  console.log("📝 Input areas:");
  pageAnalysis.inputs.forEach(input => {
    console.log(`  - ${input.tagName} | AriaLabel: "${input.ariaLabel}" | Placeholder: "${input.placeholder}"`);
  });
  
  // Save full analysis to file
  await require('fs').promises.writeFile(
    path.join(ARTIFACTS_DIR, "page_analysis.json"), 
    JSON.stringify(pageAnalysis, null, 2)
  );
  console.log("📄 Analisa lengkap disimpan di page_analysis.json");
}

// Improved function to find and click post area
async function findAndClickPostArea(page) {
  console.log("🔍 Mencari area posting...");
  
  // Wait for page to fully load
  await delay(8000);
  
  // Strategy 1: Find by text content using evaluate
  console.log("🔍 Strategi 1: Mencari berdasarkan teks...");
  const textBasedResult = await page.evaluate(() => {
    const texts = [
      "Apa yang Anda pikirkan",
      "What's on your mind", 
      "Apa yang kamu pikirkan",
      "Tulis sesuatu",
      "Write something",
      "Share an update"
    ];
    
    const allButtons = document.querySelectorAll('div[role="button"]');
    for (const button of allButtons) {
      const buttonText = button.innerText || button.textContent || '';
      const ariaLabel = button.getAttribute('aria-label') || '';
      const fullText = (buttonText + ' ' + ariaLabel).toLowerCase();
      
      for (const searchText of texts) {
        if (fullText.includes(searchText.toLowerCase())) {
          if (button.offsetParent !== null && 
              button.getBoundingClientRect().height > 20 &&
              button.getBoundingClientRect().width > 100) {
            return { found: true, element: button };
          }
        }
      }
    }
    return { found: false };
  });
  
  if (textBasedResult.found) {
    try {
      await page.evaluate((el) => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, textBasedResult.element);
      await delay(2000);
      await page.evaluate((el) => el.click(), textBasedResult.element);
      console.log("✅ Area posting ditemukan dengan pencarian teks!");
      await delay(3000);
      return true;
    } catch (error) {
      console.log(`❌ Gagal klik elemen teks: ${error.message}`);
    }
  }
  
  // Strategy 2: Common CSS selectors
  console.log("🔍 Strategi 2: CSS selector umum...");
  const commonSelectors = [
    '[aria-label*="Create"]',
    '[aria-label*="post"]',
    '[aria-label*="Post"]',
    '[aria-label*="Tulis"]',
    '[data-pagelet="ProfileComposer"] [role="button"]',
    '[data-pagelet="composer"] [role="button"]',
    'div.x1i10hfl[role="button"]',
    'div[role="button"][tabindex="0"]'
  ];
  
  for (const selector of commonSelectors) {
    try {
      console.log(`🔍 Mencoba selector: ${selector}`);
      
      const elements = await page.$(selector);
      for (const element of elements) {
        const isVisible = await page.evaluate((el) => {
          return el.offsetParent !== null && 
                 el.getBoundingClientRect().height > 20 &&
                 el.getBoundingClientRect().width > 100;
        }, element);
        
        if (isVisible) {
          await page.evaluate((el) => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, element);
          await delay(2000);
          await element.click();
          console.log(`✅ Area posting ditemukan: ${selector}`);
          await delay(3000);
          return true;
        }
      }
    } catch (error) {
      console.log(`❌ Selector gagal: ${selector} - ${error.message}`);
    }
  }
  
  // Strategy 3: Find by position (top area of page)
  console.log("🔍 Strategi 3: Mencari di area atas halaman...");
  const positionBasedResult = await page.evaluate(() => {
    const allButtons = document.querySelectorAll('div[role="button"]');
    const candidates = [];
    
    for (const button of allButtons) {
      const rect = button.getBoundingClientRect();
      if (rect.top > 100 && rect.top < 500 && // In upper area
          rect.height > 30 && rect.width > 200 && // Reasonable size
          button.offsetParent !== null) { // Visible
        candidates.push({
          element: button,
          top: rect.top,
          text: (button.innerText || '').slice(0, 50)
        });
      }
    }
    
    // Sort by position (topmost first)
    candidates.sort((a, b) => a.top - b.top);
    
    return candidates.length > 0 ? { found: true, element: candidates[0].element } : { found: false };
  });
  
  if (positionBasedResult.found) {
    try {
      await page.evaluate((el) => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, positionBasedResult.element);
      await delay(2000);
      await page.evaluate((el) => el.click(), positionBasedResult.element);
      console.log("✅ Area posting ditemukan berdasarkan posisi!");
      await delay(3000);
      return true;
    } catch (error) {
      console.log(`❌ Gagal klik elemen posisi: ${error.message}`);
    }
  }
  
  // Strategy 4: Look for composer or input areas directly
  console.log("🔍 Strategi 4: Mencari area input langsung...");
  const inputSelectors = [
    '[contenteditable="true"]',
    '[role="textbox"]',
    'textarea',
    '[data-text="true"]'
  ];
  
  for (const selector of inputSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        const isVisible = await page.evaluate((el) => {
          return el.offsetParent !== null && 
                 el.getBoundingClientRect().height > 20;
        }, element);
        
        if (isVisible) {
          await page.evaluate((el) => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, element);
          await delay(2000);
          await element.click();
          console.log(`✅ Area input ditemukan langsung: ${selector}`);
          await delay(3000);
          return true;
        }
      }
    } catch (error) {
      console.log(`❌ Input selector gagal: ${selector} - ${error.message}`);
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
  
  // Strategy 1: Find by text content
  console.log("📤 Strategi 1: Mencari tombol berdasarkan teks...");
  const textBasedResult = await page.evaluate(() => {
    const texts = ['Post', 'Posting', 'Kirim', 'Bagikan', 'Share', 'Publikasikan'];
    const allButtons = document.querySelectorAll('div[role="button"], button');
    
    for (const button of allButtons) {
      const buttonText = (button.innerText || button.textContent || '').trim();
      const ariaLabel = button.getAttribute('aria-label') || '';
      
      for (const searchText of texts) {
        if (buttonText === searchText || ariaLabel.includes(searchText)) {
          if (button.offsetParent !== null && 
              !button.disabled &&
              button.getAttribute('aria-disabled') !== 'true' &&
              button.getBoundingClientRect().height > 20) {
            return { found: true, element: button, text: buttonText };
          }
        }
      }
    }
    return { found: false };
  });
  
  if (textBasedResult.found) {
    try {
      await page.evaluate((el) => el.click(), textBasedResult.element);
      console.log(`✅ Tombol publish diklik: "${textBasedResult.text}"`);
      await delay(5000);
      return true;
    } catch (error) {
      console.log(`❌ Gagal klik tombol teks: ${error.message}`);
    }
  }
  
  // Strategy 2: Find by aria-label
  console.log("📤 Strategi 2: Mencari berdasarkan aria-label...");
  const ariaLabels = [
    'Kirim',
    'Posting', 
    'Bagikan',
    'Post',
    'Share',
    'Publish'
  ];
  
  for (const label of ariaLabels) {
    try {
      const elements = await page.$(`[aria-label="${label}"][role="button"]`);
      for (const element of elements) {
        const isEnabled = await page.evaluate((el) => {
          return el.offsetParent !== null && 
                 !el.disabled &&
                 el.getAttribute('aria-disabled') !== 'true';
        }, element);
        
        if (isEnabled) {
          await element.click();
          console.log(`✅ Tombol publish diklik via aria-label: "${label}"`);
          await delay(5000);
          return true;
        }
      }
    } catch (error) {
      console.log(`❌ Aria-label gagal: ${label} - ${error.message}`);
    }
  }
  
  // Strategy 3: Find enabled buttons in composer area
  console.log("📤 Strategi 3: Mencari tombol aktif di area composer...");
  const activeButtonResult = await page.evaluate(() => {
    const allButtons = document.querySelectorAll('div[role="button"], button');
    const enabledButtons = [];
    
    for (const button of allButtons) {
      if (button.offsetParent !== null && 
          !button.disabled &&
          button.getAttribute('aria-disabled') !== 'true') {
        
        const rect = button.getBoundingClientRect();
        const text = (button.innerText || '').trim();
        const ariaLabel = button.getAttribute('aria-label') || '';
        
        // Look for buttons that might be publish buttons
        if ((text.length > 0 && text.length < 20) || 
            (ariaLabel.length > 0 && ariaLabel.length < 50)) {
          enabledButtons.push({
            element: button,
            text: text,
            ariaLabel: ariaLabel,
            position: rect
          });
        }
      }
    }
    
    // Sort by position (bottom-right buttons are usually publish buttons)
    enabledButtons.sort((a, b) => b.position.top - a.position.top);
    
    return enabledButtons.length > 0 ? { found: true, buttons: enabledButtons } : { found: false };
  });
  
  if (activeButtonResult.found) {
    for (const buttonInfo of activeButtonResult.buttons.slice(0, 3)) { // Try top 3
      try {
        console.log(`📤 Mencoba tombol: "${buttonInfo.text}" / "${buttonInfo.ariaLabel}"`);
        await page.evaluate((el) => el.click(), buttonInfo.element);
        await delay(3000);
        
        // Check if we're still in composer (if not, probably succeeded)
        const stillInComposer = await page.evaluate(() => {
          return document.querySelector('div[role="dialog"]') !== null ||
                 document.querySelector('[contenteditable="true"]') !== null;
        });
        
        if (!stillInComposer) {
          console.log(`✅ Post berhasil dipublish!`);
          return true;
        }
      } catch (error) {
        console.log(`❌ Gagal klik tombol aktif: ${error.message}`);
      }
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

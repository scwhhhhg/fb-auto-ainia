// bot/update_status.js - GITHUB ACTIONS VERSION
const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

// Paths
const CONFIG_PATH = path.join(__dirname, "../config/config_update_status.json");
const GEMINI_KEYS_PATH = path.join(__dirname, "../gemini_keys.txt");
const LOG_STATUS_PATH = path.join(__dirname, "../log_status.txt");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts");

// GitHub Actions specific config
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

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

// Force headless on GitHub Actions
if (isGitHubActions) {
  config.headless = true;
  console.log("🤖 Running in GitHub Actions - forced headless mode");
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
        { headers: { "Content-Type": "application/json" }, timeout: 15000 }
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

// GitHub Actions compatible debug function
async function debugElements(page) {
  console.log("🔍 Debug: Menganalisa halaman Facebook...");
  
  try {
    // Screenshot untuk debug
    await page.screenshot({ 
      path: path.join(ARTIFACTS_DIR, "debug_page.png"),
      fullPage: false,
      clip: { x: 0, y: 0, width: 1366, height: 768 }
    });
    console.log("📸 Debug screenshot disimpan di debug_page.png");
  } catch (error) {
    console.log("⚠️  Gagal membuat screenshot:", error.message);
  }
  
  // Analisa halaman
  try {
    const pageAnalysis = await page.evaluate(() => {
      const result = {
        buttons: [],
        inputs: [],
        composers: [],
        pageInfo: {
          title: document.title,
          url: window.location.href,
          readyState: document.readyState
        }
      };
      
      // Cek semua button
      const buttons = document.querySelectorAll('div[role="button"]');
      buttons.forEach((button, index) => {
        if (index < 50) { // Limit untuk menghindari output yang terlalu besar
          const rect = button.getBoundingClientRect();
          const text = (button.innerText || button.textContent || '').slice(0, 100);
          const ariaLabel = button.getAttribute('aria-label') || '';
          
          if (button.offsetParent !== null && rect.height > 20) {
            result.buttons.push({
              index,
              text: text.trim(),
              ariaLabel,
              position: { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) },
              visible: true
            });
          }
        }
      });
      
      // Cek input areas
      const inputs = document.querySelectorAll('[contenteditable="true"], [role="textbox"], textarea');
      inputs.forEach((input, index) => {
        if (index < 20) { // Limit
          const rect = input.getBoundingClientRect();
          const ariaLabel = input.getAttribute('aria-label') || '';
          const placeholder = input.getAttribute('placeholder') || '';
          
          if (input.offsetParent !== null) {
            result.inputs.push({
              index,
              tagName: input.tagName,
              ariaLabel,
              placeholder,
              position: { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) }
            });
          }
        }
      });
      
      return result;
    });
    
    console.log("📊 Analisa halaman:");
    console.log(`- Title: ${pageAnalysis.pageInfo.title}`);
    console.log(`- URL: ${pageAnalysis.pageInfo.url}`);
    console.log(`- Ready State: ${pageAnalysis.pageInfo.readyState}`);
    console.log(`- Buttons ditemukan: ${pageAnalysis.buttons.length}`);
    console.log(`- Input areas ditemukan: ${pageAnalysis.inputs.length}`);
    
    // Show relevant buttons
    const relevantButtons = pageAnalysis.buttons.filter(btn => 
      btn.text.toLowerCase().includes('apa yang') ||
      btn.text.toLowerCase().includes('what') ||
      btn.ariaLabel.toLowerCase().includes('post') ||
      btn.ariaLabel.toLowerCase().includes('tulis') ||
      btn.ariaLabel.toLowerCase().includes('create') ||
      (btn.position.top > 100 && btn.position.top < 500 && btn.position.width > 200)
    ).slice(0, 5); // Limit output
    
    console.log("🎯 Button yang relevan:");
    relevantButtons.forEach(btn => {
      console.log(`  - "${btn.text}" | AriaLabel: "${btn.ariaLabel}" | Pos: ${btn.position.top}px`);
    });
    
    // Save analysis
    await fs.writeFile(
      path.join(ARTIFACTS_DIR, "page_analysis.json"), 
      JSON.stringify(pageAnalysis, null, 2)
    );
    console.log("📄 Analisa disimpan di page_analysis.json");
    
  } catch (error) {
    console.error("❌ Error saat analisa halaman:", error.message);
  }
}

// GitHub Actions optimized function to find post area
async function findAndClickPostArea(page) {
  console.log("🔍 Mencari area posting...");
  
  // Wait for page load
  await delay(10000); // Longer wait for CI environment
  
  // Strategy 1: Text-based search with timeout handling
  console.log("🔍 Strategi 1: Mencari berdasarkan teks...");
  try {
    const textBasedResult = await Promise.race([
      page.evaluate(() => {
        const texts = [
          "Apa yang Anda pikirkan",
          "What's on your mind", 
          "Apa yang kamu pikirkan",
          "Tulis sesuatu",
          "Write something"
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
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
    ]);
    
    if (textBasedResult.found) {
      await page.evaluate((el) => {
        el.scrollIntoView({ behavior: 'auto', block: 'center' });
      }, textBasedResult.element);
      await delay(3000);
      await page.evaluate((el) => el.click(), textBasedResult.element);
      console.log("✅ Area posting ditemukan dengan pencarian teks!");
      await delay(5000);
      return true;
    }
  } catch (error) {
    console.log(`❌ Strategi 1 gagal: ${error.message}`);
  }
  
  // Strategy 2: CSS selectors with retry
  console.log("🔍 Strategi 2: CSS selector dengan retry...");
  const selectors = [
    '[aria-label*="Create"]',
    '[aria-label*="post"]',
    '[aria-label*="Post"]',
    'div[role="button"][tabindex="0"]'
  ];
  
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const selector of selectors) {
      try {
        console.log(`🔍 Mencoba selector (attempt ${attempt + 1}): ${selector}`);
        
        const elements = await page.$$(selector);
        for (const element of elements) {
          const isVisible = await page.evaluate((el) => {
            return el.offsetParent !== null && 
                   el.getBoundingClientRect().height > 20 &&
                   el.getBoundingClientRect().width > 100;
          }, element);
          
          if (isVisible) {
            await page.evaluate((el) => {
              el.scrollIntoView({ behavior: 'auto', block: 'center' });
            }, element);
            await delay(3000);
            await element.click();
            console.log(`✅ Area posting ditemukan: ${selector}`);
            await delay(5000);
            return true;
          }
        }
      } catch (error) {
        console.log(`❌ Selector gagal: ${selector} - ${error.message}`);
      }
    }
    
    if (attempt < 2) {
      console.log(`⏳ Retry dalam 5 detik...`);
      await delay(5000);
    }
  }
  
  return false;
}

// GitHub Actions optimized typing function
async function typeStatus(page, status) {
  console.log("⌨️  Mengetik status...");
  
  await delay(5000);
  
  const inputSelectors = [
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"][aria-multiline="true"]',
    '[contenteditable="true"]'
  ];
  
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const selector of inputSelectors) {
      try {
        console.log(`⌨️  Mencoba input (attempt ${attempt + 1}): ${selector}`);
        
        const elements = await page.$$(selector);
        for (const element of elements) {
          const isVisible = await page.evaluate((el) => {
            return el.offsetParent !== null && el.getBoundingClientRect().height > 10;
          }, element);
          
          if (isVisible) {
            await element.click();
            await delay(1000);
            
            // Clear existing text
            await page.keyboard.down('Control');
            await page.keyboard.press('KeyA');
            await page.keyboard.up('Control');
            await delay(500);
            
            // Type status character by character for better compatibility
            for (const char of status) {
              await page.keyboard.type(char, { delay: 50 });
            }
            
            console.log(`✅ Status berhasil diketik: "${status}"`);
            await delay(3000);
            return true;
          }
        }
      } catch (error) {
        console.log(`❌ Input attempt gagal: ${error.message}`);
      }
    }
    
    if (attempt < 2) {
      console.log(`⏳ Retry input dalam 3 detik...`);
      await delay(3000);
    }
  }
  
  return false;
}

// GitHub Actions optimized publish function
async function publishPost(page) {
  console.log("📤 Mencari tombol publish...");
  
  await delay(5000);
  
  // Strategy 1: Text-based search for publish button
  try {
    const publishResult = await page.evaluate(() => {
      const texts = ['Post', 'Posting', 'Kirim', 'Bagikan', 'Share'];
      const allButtons = document.querySelectorAll('div[role="button"], button');
      
      for (const button of allButtons) {
        const buttonText = (button.innerText || button.textContent || '').trim();
        const ariaLabel = button.getAttribute('aria-label') || '';
        
        for (const searchText of texts) {
          if (buttonText === searchText || ariaLabel.includes(searchText)) {
            if (button.offsetParent !== null && 
                !button.disabled &&
                button.getAttribute('aria-disabled') !== 'true') {
              return { found: true, element: button, text: buttonText || ariaLabel };
            }
          }
        }
      }
      return { found: false };
    });
    
    if (publishResult.found) {
      await page.evaluate((el) => el.click(), publishResult.element);
      console.log(`✅ Tombol publish diklik: "${publishResult.text}"`);
      await delay(8000); // Longer wait for CI
      
      // Check if post was successful
      const success = await page.evaluate(() => {
        return !document.querySelector('div[role="dialog"]') || 
               document.querySelector('[data-testid*="post"]');
      });
      
      if (success) {
        console.log("✅ Post berhasil dipublish!");
        return true;
      }
    }
  } catch (error) {
    console.log(`❌ Publish attempt gagal: ${error.message}`);
  }
  
  return false;
}

// Main function optimized for GitHub Actions
async function main() {
  let browser = null;
  let page = null;

  console.log("🚀 Memulai bot Update Status di GitHub Actions...");

  try {
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    const keys = await loadGeminiKeys();
    const cookies = await loadCookiesFromEnv();

    // GitHub Actions optimized browser launch
    browser = await puppeteer.launch({
      headless: config.headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process", // Important for CI environments
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--memory-pressure-off"
      ]
    });

    page = await browser.newPage();
    
    // Set realistic user agent and viewport
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });
    
    // Set cookies
    await page.setCookie(...cookies);

    console.log("✅ Cookies dimuat. Membuka Facebook...");
    
    // Try to access Facebook with retry
    let pageLoaded = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.goto("https://www.facebook.com/", { 
          waitUntil: "domcontentloaded",
          timeout: 45000 
        });
        
        await delay(15000); // Longer wait for CI
        
        const title = await page.title();
        if (title.includes("Facebook") || title.includes("Meta")) {
          console.log(`✅ Facebook berhasil dibuka (attempt ${attempt + 1})`);
          pageLoaded = true;
          break;
        }
      } catch (error) {
        console.log(`❌ Attempt ${attempt + 1} gagal: ${error.message}`);
        if (attempt < 2) {
          await delay(10000);
        }
      }
    }
    
    if (!pageLoaded) {
      throw new Error("Tidak dapat membuka Facebook setelah 3 attempt");
    }

    // Handle popups
    const closeSelectors = ['div[aria-label="Tutup"]', 'div[aria-label="Close"]', '[aria-label="Dismiss"]'];
    for (const sel of closeSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        await page.click(sel);
        await delay(2000);
      } catch {}
    }

    // Debug page if needed
    await debugElements(page);

    // Find and click post area
    const postAreaFound = await findAndClickPostArea(page);
    if (!postAreaFound) {
      throw new Error("Tidak dapat menemukan area posting setelah semua strategi.");
    }

    // Generate status
    const status = await generateStatusFromGemini(config.gemini_prompt, keys);
    console.log(`🤖 Status yang dihasilkan: "${status}"`);

    // Type status
    const statusTyped = await typeStatus(page, status);
    if (!statusTyped) {
      throw new Error("Tidak dapat mengetik status setelah retry.");
    }

    // Publish post
    const postPublished = await publishPost(page);
    if (!postPublished) {
      throw new Error("Tidak dapat mempublish post.");
    }

    console.log(`✅ Status berhasil diupdate: "${status}"`);
    await logStatus(status);

    // Final screenshot
    try {
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, "success_status_update.png") });
      console.log("📸 Screenshot sukses disimpan.");
    } catch {}

  } catch (error) {
    console.error("🚨 Error:", error.message);
    
    if (page) {
      try {
        await page.screenshot({ 
          path: path.join(ARTIFACTS_DIR, "update_status_error.png"),
          fullPage: false
        });
        console.log("📸 Screenshot error disimpan.");
        
        const html = await page.content();
        await fs.writeFile(path.join(ARTIFACTS_DIR, "error_page.html"), html);
        console.log("📄 HTML page disimpan untuk debug.");
      } catch (debugError) {
        console.log("⚠️  Gagal menyimpan debug files:", debugError.message);
      }
    }
    
    // Exit with error code untuk GitHub Actions
    process.exit(1);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
}

// Handle process termination untuk GitHub Actions
process.on('SIGINT', async () => {
  console.log('🛑 Bot dihentikan oleh user');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Bot dihentikan oleh sistem');
  process.exit(0);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

main();

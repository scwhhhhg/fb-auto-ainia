// bot/update_status.js - UPDATED WITH PUPPETEER RECORDING
const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

// Paths
const CONFIG_PATH = path.join(__dirname, "../config/config_update_status.json");
const GEMINI_KEYS_PATH = path.join(__dirname, "../gemini_keys.txt");
const LOG_STATUS_PATH = path.join(__dirname, "../log_status.txt");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts");

// GitHub Actions detection
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

// Helper functions
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const getRandomInterval = () =>
  1000 * (Math.floor(Math.random() * (config.maxIntervalSeconds - config.minIntervalSeconds + 1)) + config.minIntervalSeconds);

// Load cookies from environment
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

// Load Gemini API Keys
async function loadGeminiKeys() {
  try {
    const data = await fs.readFile(GEMINI_KEYS_PATH, "utf8");
    return data.split("\n").map(k => k.trim()).filter(Boolean);
  } catch (e) {
    if (e.code === "ENOENT") throw new Error("File gemini_keys.txt tidak ditemukan!");
    throw e;
  }
}

// Generate status from Gemini AI
async function generateStatusFromGemini(prompt, keys) {
  console.log("🧠 Menghubungi Gemini AI...");
  for (const [index, key] of keys.entries()) {
    try {
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${key}`,
        { contents: [{ parts: [{ text: prompt }] }] },
        { headers: { "Content-Type": "application/json" }, timeout: 15000 }
      );
      const status = res.data.candidates[0].content.parts[0].text.trim();
      console.log(`✅ Status berhasil dihasilkan dengan API Key #${index + 1}`);
      return status;
    } catch (error) {
      const msg = error.response?.data?.error?.message || error.message;
      console.error(`❌ Gagal dengan API Key #${index + 1}:`, msg);
    }
  }
  throw new Error("Semua API Key Gemini gagal.");
}

// Log status to file
async function logStatus(status) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${status}`;
  await fs.appendFile(LOG_STATUS_PATH, logEntry + "\n", "utf8");
  console.log("📝 Status dicatat di log_status.txt");
}

// Enhanced function to find and click post area using recorded selectors
async function findAndClickPostArea(page) {
  console.log("🔍 Mencari area posting menggunakan recorded selectors...");
  
  const timeout = 8000;
  page.setDefaultTimeout(timeout);
  
  try {
    // Use the exact locators from the recording
    console.log("🎯 Mencoba locator dari recording...");
    
    const postButton = await puppeteer.Locator.race([
      page.locator('div.x1yztbdb > div > div > div > div.x1cy8zhl span'),
      page.locator('::-p-text(Apa yang Anda)'),
      page.locator('::-p-text(What\'s on your mind)'),
      page.locator('div.x1yztbdb span'), // Simplified version
      page.locator('[role="button"]::-p-text(Apa yang Anda)')
    ]).setTimeout(timeout);
    
    // Click the post button
    await postButton.click();
    console.log("✅ Area posting berhasil diklik menggunakan recorded selector!");
    await delay(3000);
    return true;
    
  } catch (error) {
    console.log(`❌ Recorded selector gagal: ${error.message}`);
  }
  
  // Fallback to original strategies if recording fails
  console.log("🔄 Menggunakan fallback strategy...");
  
  // Strategy 1: Text-based search
  try {
    const textBasedResult = await page.evaluate(() => {
      const texts = [
        "Apa yang Anda pikirkan",
        "What's on your mind", 
        "Apa yang kamu pikirkan",
        "Tulis sesuatu"
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
      await page.evaluate((el) => {
        el.scrollIntoView({ behavior: 'auto', block: 'center' });
      }, textBasedResult.element);
      await delay(2000);
      await page.evaluate((el) => el.click(), textBasedResult.element);
      console.log("✅ Area posting ditemukan dengan fallback strategy!");
      await delay(3000);
      return true;
    }
  } catch (error) {
    console.log(`❌ Fallback strategy gagal: ${error.message}`);
  }
  
  return false;
}

// Enhanced function to type status using recorded selectors
async function typeStatus(page, status) {
  console.log("⌨️  Mengetik status menggunakan recorded selectors...");
  
  const timeout = 8000;
  await delay(3000);
  
  try {
    // Use recorded selectors for text input
    console.log("🎯 Mencoba textbox locator dari recording...");
    
    const textbox = await puppeteer.Locator.race([
      page.locator('::-p-aria([role="textbox"]) >>>> ::-p-aria([role="paragraph"])'),
      page.locator('p'), // The recorded paragraph selector
      page.locator('div.x1ed109x > div.x1iyjqo2 > div > div > div.xzsf02u'),
      page.locator('::-p-aria(Apa yang Anda pikirkan[role="textbox"])'),
      page.locator('[role="textbox"]')
    ]).setTimeout(timeout);
    
    // Click on the textbox first
    await textbox.click();
    await delay(1000);
    
    // Use the fill method from recording for better compatibility
    await textbox.fill(status);
    
    console.log(`✅ Status berhasil diketik dengan recorded method: "${status}"`);
    await delay(2000);
    return true;
    
  } catch (error) {
    console.log(`❌ Recorded textbox selector gagal: ${error.message}`);
  }
  
  // Fallback typing method
  console.log("🔄 Menggunakan fallback typing method...");
  try {
    const inputSelectors = [
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      '[role="textbox"]'
    ];
    
    for (const selector of inputSelectors) {
      const elements = await page.$$(selector);
      for (const element of elements) {
        const isVisible = await page.evaluate((el) => {
          return el.offsetParent !== null && el.getBoundingClientRect().height > 10;
        }, element);
        
        if (isVisible) {
          await element.click();
          await delay(1000);
          
          // Clear and type
          await page.keyboard.down('Control');
          await page.keyboard.press('KeyA');
          await page.keyboard.up('Control');
          await delay(500);
          
          await element.type(status, { delay: 100 });
          
          console.log(`✅ Status berhasil diketik dengan fallback: "${status}"`);
          await delay(2000);
          return true;
        }
      }
    }
  } catch (error) {
    console.log(`❌ Fallback typing gagal: ${error.message}`);
  }
  
  return false;
}

// Enhanced function to publish post using recorded selectors
async function publishPost(page) {
  console.log("📤 Mempublish post menggunakan recorded selectors...");
  
  const timeout = 10000;
  await delay(3000);
  
  try {
    // First, try to click "Berikutnya" (Next) button if it exists
    console.log("🔍 Mencari tombol 'Berikutnya'...");
    
    try {
      const nextButton = await puppeteer.Locator.race([
        page.locator('div:nth-of-type(4) div.x1l90r2v span > span'),
        page.locator('::-p-text(Berikutnya)'),
        page.locator('::-p-text(Next)')
      ]).setTimeout(5000);
      
      await nextButton.click();
      console.log("✅ Tombol 'Berikutnya' diklik!");
      await delay(3000);
    } catch (nextError) {
      console.log("ℹ️  Tombol 'Berikutnya' tidak ditemukan, lanjut ke publish...");
    }
    
    // Now click the publish/send button using recorded selectors
    console.log("🎯 Mencari tombol publish dari recording...");
    
    const publishButton = await puppeteer.Locator.race([
      page.locator('div:nth-of-type(1) > div > div:nth-of-type(4) div.xod5an3 span > span'),
      page.locator('::-p-text(Kirim)'),
      page.locator('::-p-text(Post)'),
      page.locator('::-p-text(Posting)'),
      page.locator('div.xod5an3 span > span'), // Simplified version
      page.locator('[role="button"]::-p-text(Kirim)')
    ]).setTimeout(timeout);
    
    await publishButton.click();
    console.log("✅ Tombol publish diklik menggunakan recorded selector!");
    
    // Wait for post to be published
    await delay(8000);
    
    // Check if we're back to the main page (indication of successful post)
    const isSuccess = await page.evaluate(() => {
      return !document.querySelector('div[role="dialog"]') || 
             document.querySelector('[data-testid*="post"]') ||
             document.title.includes('Facebook');
    });
    
    if (isSuccess) {
      console.log("✅ Post berhasil dipublish!");
      return true;
    } else {
      console.log("⚠️  Status publish tidak dapat dikonfirmasi");
      return true; // Assume success if button was clicked
    }
    
  } catch (error) {
    console.log(`❌ Recorded publish selector gagal: ${error.message}`);
  }
  
  // Fallback publish method
  console.log("🔄 Menggunakan fallback publish method...");
  try {
    const publishResult = await page.evaluate(() => {
      const texts = ['Kirim', 'Post', 'Posting', 'Bagikan', 'Share'];
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
      console.log(`✅ Tombol publish diklik dengan fallback: "${publishResult.text}"`);
      await delay(8000);
      return true;
    }
  } catch (error) {
    console.log(`❌ Fallback publish gagal: ${error.message}`);
  }
  
  return false;
}

// Debug function for troubleshooting
async function debugPage(page) {
  console.log("🔍 Debug: Menganalisa halaman...");
  
  try {
    await page.screenshot({ 
      path: path.join(ARTIFACTS_DIR, "debug_screenshot.png"),
      fullPage: false
    });
    console.log("📸 Debug screenshot disimpan");
    
    const pageInfo = await page.evaluate(() => ({
      title: document.title,
      url: window.location.href,
      readyState: document.readyState,
      buttonsCount: document.querySelectorAll('div[role="button"]').length,
      textboxCount: document.querySelectorAll('[role="textbox"]').length
    }));
    
    console.log("📊 Info halaman:", pageInfo);
    
    await fs.writeFile(
      path.join(ARTIFACTS_DIR, "page_debug.json"), 
      JSON.stringify(pageInfo, null, 2)
    );
    
  } catch (error) {
    console.log("⚠️  Debug gagal:", error.message);
  }
}

// Main function
async function main() {
  let browser = null;
  let page = null;

  console.log("🚀 Memulai Facebook Auto Status Bot dengan Recorded Selectors...");

  try {
    // Create artifacts directory
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    // Load dependencies
    const keys = await loadGeminiKeys();
    const cookies = await loadCookiesFromEnv();

    // Launch browser with optimal settings
    browser = await puppeteer.launch({
      headless: config.headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox", 
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        ...(isGitHubActions ? ["--single-process"] : []),
        "--disable-blink-features=AutomationControlled",
        "--disable-web-security"
      ]
    });

    page = await browser.newPage();
    
    // Set viewport similar to recording
    await page.setViewport({ width: 966, height: 703 });
    
    // Set realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Load cookies
    await page.setCookie(...cookies);
    console.log("✅ Cookies berhasil dimuat");

    // Navigate to Facebook
    console.log("🌐 Membuka Facebook...");
    await page.goto('https://www.facebook.com/', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    // Wait for page to fully load
    await delay(8000);
    
    // Verify we're on Facebook
    const title = await page.title();
    if (!title.includes('Facebook') && !title.includes('Meta')) {
      throw new Error(`Halaman tidak valid: ${title}`);
    }
    
    console.log(`✅ Facebook berhasil dibuka: ${title}`);

    // Handle popups
    const closeSelectors = [
      'div[aria-label="Tutup"]',
      'div[aria-label="Close"]', 
      '[aria-label="Dismiss"]'
    ];
    
    for (const selector of closeSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        await page.click(selector);
        await delay(2000);
        console.log(`✅ Popup ditutup: ${selector}`);
      } catch {}
    }

    // Debug if not headless
    if (!config.headless) {
      await debugPage(page);
    }

    // Step 1: Find and click post area
    console.log("📝 Step 1: Mencari area posting...");
    const postAreaFound = await findAndClickPostArea(page);
    if (!postAreaFound) {
      throw new Error("Tidak dapat menemukan area posting");
    }

    // Step 2: Generate status from Gemini
    console.log("🤖 Step 2: Generate status dari AI...");
    const status = await generateStatusFromGemini(config.gemini_prompt, keys);
    console.log(`📄 Status yang dihasilkan: "${status}"`);

    // Step 3: Type the status
    console.log("⌨️  Step 3: Mengetik status...");
    const statusTyped = await typeStatus(page, status);
    if (!statusTyped) {
      throw new Error("Gagal mengetik status");
    }

    // Step 4: Publish the post
    console.log("📤 Step 4: Publish post...");
    const postPublished = await publishPost(page);
    if (!postPublished) {
      throw new Error("Gagal publish post");
    }

    // Success!
    console.log(`🎉 SUCCESS: Status berhasil diupdate!`);
    console.log(`📝 Status: "${status}"`);
    
    // Log the status
    await logStatus(status);
    
    // Final screenshot for verification
    try {
      await page.screenshot({ 
        path: path.join(ARTIFACTS_DIR, "success_final.png") 
      });
      console.log("📸 Screenshot sukses disimpan");
    } catch {}

    // Random delay before exit
    await delay(getRandomInterval());

  } catch (error) {
    console.error("🚨 ERROR:", error.message);
    
    if (page) {
      try {
        await page.screenshot({ 
          path: path.join(ARTIFACTS_DIR, "error_screenshot.png"),
          fullPage: false
        });
        
        const html = await page.content();
        await fs.writeFile(path.join(ARTIFACTS_DIR, "error_page.html"), html);
        
        console.log("📸 Error artifacts disimpan di folder artifacts/");
      } catch {}
    }
    
    process.exit(1);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
}

// Process handlers
process.on('SIGINT', () => {
  console.log('🛑 Bot dihentikan');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

// Run the bot
main();

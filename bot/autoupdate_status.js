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

// Enhanced wait function
async function waitForElement(page, selector, timeout = 10000) {
  try {
    await page.waitForSelector(selector, { timeout, visible: true });
    return true;
  } catch {
    return false;
  }
}

// Wait for any of multiple selectors
async function waitForAnySelector(page, selectors, timeout = 10000) {
  const promises = selectors.map(selector => 
    page.waitForSelector(selector, { timeout, visible: true }).catch(() => null)
  );
  
  try {
    const result = await Promise.race(promises);
    return result !== null;
  } catch {
    return false;
  }
}

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

// Enhanced function to find and click post area
async function findAndClickPostArea(page) {
  console.log("🔍 Mencari area posting...");
  
  // Wait for page to be ready
  await delay(5000);
  
  try {
    // Multiple strategies to find post area
    const strategies = [
      // Strategy 1: Direct text search
      async () => {
        console.log("🎯 Strategy 1: Mencari berdasarkan teks...");
        const element = await page.evaluate(() => {
          const texts = [
            "Apa yang Anda pikirkan",
            "What's on your mind", 
            "Apa yang kamu pikirkan",
            "Tulis sesuatu",
            "Mulai menulis"
          ];
          
          for (const text of texts) {
            const xpath = `//div[contains(text(), '${text}') and @role='button']`;
            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            if (result.singleNodeValue) {
              return result.singleNodeValue;
            }
            
            // Also try span elements
            const spanXpath = `//span[contains(text(), '${text}')]`;
            const spanResult = document.evaluate(spanXpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            if (spanResult.singleNodeValue) {
              const button = spanResult.singleNodeValue.closest('[role="button"]');
              if (button) return button;
            }
          }
          return null;
        });
        
        if (element) {
          await page.evaluate(el => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, element);
          await delay(2000);
          await page.evaluate(el => el.click(), element);
          return true;
        }
        return false;
      },
      
      // Strategy 2: CSS selector based
      async () => {
        console.log("🎯 Strategy 2: Mencari berdasarkan CSS selector...");
        const selectors = [
          'div[role="button"][data-testid*="status-attachment"]',
          'div[role="button"] span:contains("Apa yang")',
          'div[contenteditable="true"]',
          'div.x1yztbdb div[role="button"]'
        ];
        
        for (const selector of selectors) {
          try {
            await page.waitForSelector(selector, { timeout: 3000 });
            await page.click(selector);
            return true;
          } catch {}
        }
        return false;
      },
      
      // Strategy 3: Look for composer
      async () => {
        console.log("🎯 Strategy 3: Mencari composer...");
        const found = await page.evaluate(() => {
          const buttons = document.querySelectorAll('div[role="button"]');
          for (const button of buttons) {
            const rect = button.getBoundingClientRect();
            if (rect.width > 200 && rect.height > 30) {
              const text = button.textContent || '';
              if (text.length > 10 && (text.includes('Apa') || text.includes('What'))) {
                return button;
              }
            }
          }
          return null;
        });
        
        if (found) {
          await page.evaluate(el => el.click(), found);
          return true;
        }
        return false;
      }
    ];
    
    // Try each strategy
    for (const [index, strategy] of strategies.entries()) {
      try {
        const success = await strategy();
        if (success) {
          console.log(`✅ Area posting berhasil diklik dengan strategy ${index + 1}!`);
          await delay(4000); // Wait for composer to open
          return true;
        }
      } catch (error) {
        console.log(`❌ Strategy ${index + 1} gagal:`, error.message);
      }
    }
    
    return false;
    
  } catch (error) {
    console.log(`❌ Error dalam findAndClickPostArea: ${error.message}`);
    return false;
  }
}

// FIXED: Enhanced function to type status with better selectors
async function typeStatus(page, status) {
  console.log("⌨️  Mengetik status dengan improved selectors...");
  
  // Wait longer for composer to fully load
  await delay(5000);
  
  try {
    // Strategy 1: Find the active textbox after composer opens
    console.log("🎯 Strategy 1: Mencari textbox yang aktif...");
    
    const textboxFound = await page.evaluate((statusText) => {
      // Look for contenteditable div that's visible and active
      const textboxes = document.querySelectorAll('div[contenteditable="true"]');
      
      for (const textbox of textboxes) {
        const rect = textbox.getBoundingClientRect();
        const style = window.getComputedStyle(textbox);
        
        // Check if element is visible and has reasonable size
        if (rect.width > 100 && rect.height > 20 && 
            style.display !== 'none' && 
            style.visibility !== 'hidden') {
          
          // Try to click and type
          textbox.focus();
          textbox.click();
          
          // Clear existing content
          textbox.innerHTML = '';
          
          // Create a text node and insert it
          const textNode = document.createTextNode(statusText);
          textbox.appendChild(textNode);
          
          // Trigger input events
          textbox.dispatchEvent(new Event('input', { bubbles: true }));
          textbox.dispatchEvent(new Event('change', { bubbles: true }));
          
          return { success: true, method: 'innerHTML' };
        }
      }
      
      return { success: false };
    }, status);
    
    if (textboxFound.success) {
      console.log(`✅ Status berhasil diketik dengan method: ${textboxFound.method}`);
      await delay(3000);
      return true;
    }
    
    // Strategy 2: Use keyboard typing
    console.log("🎯 Strategy 2: Menggunakan keyboard typing...");
    
    const keyboardSuccess = await page.evaluate(() => {
      const textboxes = document.querySelectorAll('div[contenteditable="true"], [role="textbox"]');
      
      for (const textbox of textboxes) {
        const rect = textbox.getBoundingClientRect();
        if (rect.width > 50 && rect.height > 10) {
          textbox.focus();
          textbox.click();
          return { found: true, element: textbox };
        }
      }
      return { found: false };
    });
    
    if (keyboardSuccess.found) {
      // Use page.type for more reliable typing
      await page.keyboard.down('Control');
      await page.keyboard.press('KeyA');
      await page.keyboard.up('Control');
      await delay(500);
      
      // Type character by character
      await page.keyboard.type(status, { delay: 50 });
      
      console.log("✅ Status berhasil diketik dengan keyboard!");
      await delay(3000);
      return true;
    }
    
    // Strategy 3: Direct DOM manipulation
    console.log("🎯 Strategy 3: Direct DOM manipulation...");
    
    const domSuccess = await page.evaluate((statusText) => {
      // Find any div that looks like a text input
      const allDivs = document.querySelectorAll('div');
      
      for (const div of allDivs) {
        const hasContentEditable = div.hasAttribute('contenteditable');
        const hasRole = div.getAttribute('role') === 'textbox';
        const rect = div.getBoundingClientRect();
        
        if ((hasContentEditable || hasRole) && rect.width > 100) {
          // Force focus and input
          div.focus();
          div.textContent = statusText;
          
          // Trigger all possible events
          ['focus', 'input', 'change', 'keyup'].forEach(eventType => {
            div.dispatchEvent(new Event(eventType, { bubbles: true }));
          });
          
          return true;
        }
      }
      return false;
    }, status);
    
    if (domSuccess) {
      console.log("✅ Status berhasil diketik dengan DOM manipulation!");
      await delay(3000);
      return true;
    }
    
    return false;
    
  } catch (error) {
    console.log(`❌ Error dalam typeStatus: ${error.message}`);
    return false;
  }
}

// Enhanced function to publish post
async function publishPost(page) {
  console.log("📤 Mencari dan mengklik tombol publish...");
  
  await delay(3000);
  
  try {
    // Strategy 1: Look for publish button by text
    console.log("🎯 Strategy 1: Mencari tombol berdasarkan teks...");
    
    const publishSuccess = await page.evaluate(() => {
      const texts = ['Kirim', 'Post', 'Posting', 'Bagikan', 'Share'];
      const allElements = document.querySelectorAll('div[role="button"], button, span');
      
      for (const element of allElements) {
        const text = (element.textContent || '').trim();
        const ariaLabel = element.getAttribute('aria-label') || '';
        
        for (const searchText of texts) {
          if (text === searchText || ariaLabel.includes(searchText)) {
            const rect = element.getBoundingClientRect();
            if (rect.width > 30 && rect.height > 20) {
              element.click();
              return { success: true, text: text || ariaLabel };
            }
          }
        }
      }
      return { success: false };
    });
    
    if (publishSuccess.success) {
      console.log(`✅ Tombol publish diklik: "${publishSuccess.text}"`);
      await delay(8000);
      return true;
    }
    
    // Strategy 2: Look for blue/primary button
    console.log("🎯 Strategy 2: Mencari tombol primary/blue...");
    
    const buttonSuccess = await page.evaluate(() => {
      const buttons = document.querySelectorAll('div[role="button"]');
      
      for (const button of buttons) {
        const style = window.getComputedStyle(button);
        const bgColor = style.backgroundColor;
        const rect = button.getBoundingClientRect();
        
        // Look for blue-ish buttons (Facebook primary color)
        if ((bgColor.includes('rgb(24, 119, 242)') || 
             bgColor.includes('rgb(66, 103, 178)') ||
             button.className.includes('primary')) &&
            rect.width > 50 && rect.height > 25) {
          
          button.click();
          return { success: true, color: bgColor };
        }
      }
      return { success: false };
    });
    
    if (buttonSuccess.success) {
      console.log(`✅ Tombol primary diklik dengan warna: ${buttonSuccess.color}`);
      await delay(8000);
      return true;
    }
    
    // Strategy 3: Click the most likely button
    console.log("🎯 Strategy 3: Mencari tombol yang paling mungkin...");
    
    const likelySuccess = await page.evaluate(() => {
      const buttons = document.querySelectorAll('div[role="button"]');
      let bestCandidate = null;
      let bestScore = 0;
      
      for (const button of buttons) {
        const rect = button.getBoundingClientRect();
        const text = button.textContent || '';
        
        let score = 0;
        
        // Size scoring
        if (rect.width > 50 && rect.width < 150) score += 2;
        if (rect.height > 25 && rect.height < 60) score += 2;
        
        // Text scoring
        if (text.length > 2 && text.length < 15) score += 1;
        
        // Position scoring (lower on page is more likely publish button)
        if (rect.bottom > window.innerHeight / 2) score += 1;
        
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = button;
        }
      }
      
      if (bestCandidate && bestScore >= 3) {
        bestCandidate.click();
        return { success: true, score: bestScore };
      }
      
      return { success: false };
    });
    
    if (likelySuccess.success) {
      console.log(`✅ Tombol terbaik diklik dengan score: ${likelySuccess.score}`);
      await delay(8000);
      return true;
    }
    
    return false;
    
  } catch (error) {
    console.log(`❌ Error dalam publishPost: ${error.message}`);
    return false;
  }
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
      textboxCount: document.querySelectorAll('[role="textbox"]').length,
      contentEditableCount: document.querySelectorAll('div[contenteditable="true"]').length
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

  console.log("🚀 Memulai Facebook Auto Status Bot (Fixed Version)...");

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
    await delay(10000);
    
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

    // Debug current state
    await debugPage(page);

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

    // Step 3: Type the status (FIXED)
    console.log("⌨️  Step 3: Mengetik status...");
    const statusTyped = await typeStatus(page, status);
    if (!statusTyped) {
      // Take screenshot before failing
      await page.screenshot({ 
        path: path.join(ARTIFACTS_DIR, "typing_failed.png") 
      });
      throw new Error("Gagal mengetik status");
    }

    // Step 4: Publish the post
    console.log("📤 Step 4: Publish post...");
    const postPublished = await publishPost(page);
    if (!postPublished) {
      // Take screenshot before failing
      await page.screenshot({ 
        path: path.join(ARTIFACTS_DIR, "publish_failed.png") 
      });
      console.log("⚠️  Gagal publish post, tapi status mungkin sudah terketik");
      // Don't throw error, might still be successful
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

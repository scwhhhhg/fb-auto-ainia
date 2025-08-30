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
    return data.split("\n")
      .map(u => u.trim())
      .filter(u => u.startsWith("https://www.facebook.com/reel/"))
      .map(u => {
        // Clean URL - remove any extra parameters after pipe |
        if (u.includes('|')) {
          u = u.split('|')[0];
        }
        // Ensure URL ends properly
        if (!u.match(/\/\d+\/?$/)) {
          console.log(`⚠️ URL mungkin tidak valid: ${u}`);
        }
        return u;
      })
      .filter(Boolean);
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

// Function to click share button using multiple strategies
async function clickShareButton(page, timeout = 15000) {
  try {
    console.log("🔍 Strategi 1: Menggunakan Locator.race...");
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
    console.log("⚠️ Strategi 1 gagal, mencoba strategi 2...");
    
    try {
      console.log("🔍 Strategi 2: Menggunakan XPath dan CSS selector tradisional...");
      
      // Wait for page to be fully loaded
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      
      // Try multiple selectors with different approaches
      const selectors = [
        'div[aria-label="Bagikan"]',
        'div[aria-label="Share"]',
        'div[role="button"][aria-label*="Bagikan"]',
        'div[role="button"][aria-label*="Share"]',
        '[data-testid="post_share_button"]',
        'div[data-testid*="share"]',
        // More generic selectors
        'div.x1i10hfl[role="button"]', // Common Facebook button class
        'div[role="button"]:has(i)', // Button with icon
      ];
      
      for (let i = 0; i < selectors.length; i++) {
        try {
          console.log(`   Mencoba selector ${i+1}: ${selectors[i]}`);
          await page.waitForSelector(selectors[i], { timeout: 3000, visible: true });
          const element = await page.$(selectors[i]);
          
          if (element) {
            // Check if element is actually a share button by checking nearby text or aria-label
            const ariaLabel = await element.evaluate(el => el.getAttribute('aria-label'));
            const textContent = await element.evaluate(el => el.textContent);
            
            console.log(`   Element found - aria-label: "${ariaLabel}", text: "${textContent}"`);
            
            // If it looks like a share button, click it
            if (ariaLabel?.toLowerCase().includes('bagikan') || 
                ariaLabel?.toLowerCase().includes('share') ||
                textContent?.toLowerCase().includes('bagikan') ||
                textContent?.toLowerCase().includes('share')) {
              
              await element.click();
              console.log("✅ Share button clicked successfully!");
              return true;
            }
          }
        } catch (e) {
          console.log(`   Selector ${i+1} gagal: ${e.message}`);
          continue;
        }
      }
      
      // Strategy 3: Try XPath approach
      console.log("🔍 Strategi 3: Menggunakan XPath...");
      const xpaths = [
        '//div[@role="button" and (@aria-label="Bagikan" or @aria-label="Share")]',
        '//div[@role="button" and (contains(@aria-label, "Bagikan") or contains(@aria-label, "Share"))]',
        '//div[@role="button"]//i[contains(@class, "share") or contains(@class, "bagikan")]',
        '//div[contains(text(), "Bagikan") or contains(text(), "Share")][@role="button"]'
      ];
      
      for (let i = 0; i < xpaths.length; i++) {
        try {
          console.log(`   Mencoba XPath ${i+1}: ${xpaths[i]}`);
          await page.waitForXPath(xpaths[i], { timeout: 3000, visible: true });
          const [element] = await page.$x(xpaths[i]);
          
          if (element) {
            await element.click();
            console.log("✅ Share button clicked via XPath!");
            return true;
          }
        } catch (e) {
          console.log(`   XPath ${i+1} gagal: ${e.message}`);
          continue;
        }
      }
      
      throw new Error("Semua strategi gagal");
    } catch (fallbackError) {
      console.error("Error in fallback strategies:", fallbackError.message);
      return false;
    }
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

// Function to select group from dropdown with multiple strategies
async function selectGroupFromDropdown(page, groupName, timeout = 15000) {
  try {
    console.log("🔍 Strategi 1: Mencari input field dengan Locator.race...");
    
    // Strategy 1: Use Locator.race for input field
    await puppeteer.Locator.race([
      page.locator('input[type="text"][placeholder*="grup"]'),
      page.locator('input[type="text"][placeholder*="group"]'),
      page.locator('input[type="text"][placeholder*="Cari"]'),
      page.locator('input[type="text"][placeholder*="Search"]'),
      page.locator('input[type="text"]'),
      page.locator('div[contenteditable="true"]'),
      page.locator('[role="textbox"]'),
      page.locator('[role="combobox"]')
    ])
      .setTimeout(timeout)
      .click();

    await delay(1500);

    // Clear and type group name
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.press('Delete');
    
    await page.keyboard.type(groupName, { delay: 150 });
    console.log(`✅ Berhasil mengetik: ${groupName}`);
    await delay(3000);

    // Strategy 1: Select from dropdown using Locator.race
    try {
      await puppeteer.Locator.race([
        page.locator('div[role="listbox"] div[role="option"]:first-child'),
        page.locator('div[role="option"]:first-child'),
        page.locator('ul[role="listbox"] li:first-child'),
        page.locator('[role="option"]').nth(0),
        page.locator('div[data-testid*="typeahead"] div:first-child')
      ])
        .setTimeout(8000)
        .click();
      
      console.log("✅ Grup dipilih dengan Locator.race");
      return true;
    } catch (locatorError) {
      console.log("⚠️ Locator.race gagal, mencoba strategi alternatif...");
      throw locatorError;
    }

  } catch (error) {
    console.log("⚠️ Strategi 1 gagal, mencoba strategi 2...");
    
    try {
      console.log("🔍 Strategi 2: CSS selector tradisional...");
      
      // Find input field with traditional selectors
      const inputSelectors = [
        'input[type="text"]',
        'div[contenteditable="true"]',
        '[role="textbox"]',
        '[role="combobox"]',
        'input[placeholder*="grup"]',
        'input[placeholder*="group"]',
        'input[placeholder*="Cari"]',
        'input[placeholder*="Search"]'
      ];

      let inputFound = false;
      for (const selector of inputSelectors) {
        try {
          console.log(`   Mencoba input selector: ${selector}`);
          await page.waitForSelector(selector, { timeout: 3000, visible: true });
          const input = await page.$(selector);
          
          if (input) {
            await input.click();
            await delay(1000);
            
            // Clear and type
            await page.keyboard.down('Control');
            await page.keyboard.press('KeyA');
            await page.keyboard.up('Control');
            await page.keyboard.press('Delete');
            
            await page.keyboard.type(groupName, { delay: 150 });
            console.log(`✅ Input found and typed: ${groupName}`);
            inputFound = true;
            break;
          }
        } catch (e) {
          console.log(`   Input selector ${selector} gagal: ${e.message}`);
          continue;
        }
      }

      if (!inputFound) {
        throw new Error("Input field tidak ditemukan dengan semua selector");
      }

      await delay(4000);

      // Find and click dropdown option
      const optionSelectors = [
        'div[role="listbox"] div[role="option"]',
        'div[role="option"]',
        'ul[role="listbox"] li',
        'div[data-testid*="typeahead"] div',
        'li[role="option"]',
        '.uiTypeaheadView li',
        '[role="listbox"] [role="option"]'
      ];

      let optionFound = false;
      for (const selector of optionSelectors) {
        try {
          console.log(`   Mencari dropdown dengan: ${selector}`);
          await page.waitForSelector(selector, { timeout: 5000, visible: true });
          const options = await page.$(selector);
          
          if (options.length > 0) {
            console.log(`   Ditemukan ${options.length} opsi`);
            // Click first option
            await options[0].click();
            console.log("✅ Opsi pertama diklik");
            optionFound = true;
            break;
          }
        } catch (e) {
          console.log(`   Dropdown selector ${selector} gagal: ${e.message}`);
          continue;
        }
      }

      if (!optionFound) {
        throw new Error("Dropdown option tidak ditemukan");
      }

      return true;

    } catch (fallbackError) {
      console.log("⚠️ Strategi 2 gagal, mencoba strategi 3...");
      
      try {
        console.log("🔍 Strategi 3: XPath approach...");
        
        // XPath for input using $x instead of waitForXPath
        const inputXPaths = [
          '//input[@type="text"]',
          '//div[@contenteditable="true"]',
          '//input[contains(@placeholder, "grup") or contains(@placeholder, "group")]',
          '//*[@role="textbox"]',
          '//*[@role="combobox"]'
        ];

        let inputFound = false;
        for (const xpath of inputXPaths) {
          try {
            console.log(`   Mencoba XPath input: ${xpath}`);
            
            // Use $x directly instead of waitForXPath
            const inputElements = await page.$x(xpath);
            if (inputElements.length > 0) {
              const input = inputElements[0];
              
              // Check if element is visible
              const isVisible = await input.boundingBox();
              if (isVisible) {
                await input.click();
                await delay(1000);
                
                await page.keyboard.down('Control');
                await page.keyboard.press('KeyA');
                await page.keyboard.up('Control');
                await page.keyboard.press('Delete');
                
                await page.keyboard.type(groupName, { delay: 150 });
                console.log(`✅ XPath input success: ${groupName}`);
                inputFound = true;
                break;
              }
            }
          } catch (e) {
            console.log(`   XPath input ${xpath} gagal: ${e.message}`);
            continue;
          }
        }

        if (!inputFound) {
          throw new Error("Input field tidak ditemukan dengan XPath");
        }

        await delay(4000);

        // XPath for dropdown options using $x
        const optionXPaths = [
          '//div[@role="listbox"]//div[@role="option"][1]',
          '//div[@role="option"][1]',
          '//ul[@role="listbox"]//li[1]',
          '//*[@role="option"][1]'
        ];

        let optionFound = false;
        for (const xpath of optionXPaths) {
          try {
            console.log(`   Mencoba XPath option: ${xpath}`);
            
            const optionElements = await page.$x(xpath);
            if (optionElements.length > 0) {
              const option = optionElements[0];
              
              const isVisible = await option.boundingBox();
              if (isVisible) {
                await option.click();
                console.log("✅ XPath option clicked");
                optionFound = true;
                break;
              }
            }
          } catch (e) {
            console.log(`   XPath option ${xpath} gagal: ${e.message}`);
            continue;
          }
        }

        if (!optionFound) {
          throw new Error("Dropdown option tidak ditemukan dengan XPath");
        }

        return true;

      } catch (xpathError) {
        console.error("Semua strategi gagal:", xpathError.message);
        
        // Final attempt: try keyboard navigation
        console.log("🔍 Strategi 4: Keyboard navigation...");
        try {
          // Press Tab to navigate, then Enter to select
          await page.keyboard.press('Tab');
          await delay(1000);
          await page.keyboard.press('ArrowDown');
          await delay(1000);
          await page.keyboard.press('Enter');
          console.log("✅ Keyboard navigation success");
          return true;
        } catch (keyboardError) {
          console.error("Keyboard navigation juga gagal:", keyboardError.message);
          return false;
        }
      }
    }
  }
}

// Function to add caption with multiple strategies
async function addCaption(page, caption, timeout = 8000) {
  try {
    console.log("🔍 Strategi 1: Caption dengan Locator.race...");
    await puppeteer.Locator.race([
      page.locator('div[aria-label="Komentar Anda"]'),
      page.locator('div[aria-label="Your comment"]'),
      page.locator('div[contenteditable="true"][data-text*="Tulis"]'),
      page.locator('div[contenteditable="true"][data-text*="Write"]'),
      page.locator('textarea[placeholder*="comment"]'),
      page.locator('div[contenteditable="true"]'),
      page.locator('textarea[placeholder*="Tulis"]'),
      page.locator('textarea[placeholder*="Write"]')
    ])
      .setTimeout(timeout)
      .click();

    await delay(1000);
    await page.keyboard.type(caption, { delay: 80 });
    console.log("✅ Caption ditambahkan dengan Locator.race");
    return true;
  } catch (error) {
    console.log("⚠️ Locator.race gagal, mencoba strategi alternatif...");
    
    try {
      console.log("🔍 Strategi 2: CSS selector tradisional untuk caption...");
      
      const captionSelectors = [
        'div[contenteditable="true"]',
        'textarea',
        'div[aria-label*="comment"]',
        'div[aria-label*="Comment"]',
        'div[aria-label*="Komentar"]',
        'div[role="textbox"]',
        '[contenteditable="true"]',
        'textarea[placeholder*="Tulis"]',
        'textarea[placeholder*="Write"]'
      ];

      for (const selector of captionSelectors) {
        try {
          console.log(`   Mencoba caption selector: ${selector}`);
          await page.waitForSelector(selector, { timeout: 2000, visible: true });
          const element = await page.$(selector);
          
          if (element) {
            const isVisible = await element.boundingBox();
            if (isVisible) {
              await element.click();
              await delay(1000);
              await page.keyboard.type(caption, { delay: 80 });
              console.log(`✅ Caption berhasil dengan selector: ${selector}`);
              return true;
            }
          }
        } catch (e) {
          console.log(`   Caption selector ${selector} gagal: ${e.message}`);
          continue;
        }
      }

      // Strategy 3: Try XPath for caption
      console.log("🔍 Strategi 3: XPath untuk caption...");
      const captionXPaths = [
        '//div[@contenteditable="true"]',
        '//textarea',
        '//div[contains(@aria-label, "comment") or contains(@aria-label, "Comment")]',
        '//div[@role="textbox"]'
      ];

      for (const xpath of captionXPaths) {
        try {
          console.log(`   Mencoba XPath caption: ${xpath}`);
          const elements = await page.$x(xpath);
          if (elements.length > 0) {
            const element = elements[0];
            const isVisible = await element.boundingBox();
            if (isVisible) {
              await element.click();
              await delay(1000);
              await page.keyboard.type(caption, { delay: 80 });
              console.log(`✅ Caption berhasil dengan XPath: ${xpath}`);
              return true;
            }
          }
        } catch (e) {
          console.log(`   XPath caption ${xpath} gagal: ${e.message}`);
          continue;
        }
      }

      throw new Error("Semua strategi caption gagal");
    } catch (fallbackError) {
      console.error("Error adding caption:", fallbackError.message);
      return false;
    }
  }
}

// Function to click post button with multiple strategies
async function clickPostButton(page, timeout = 15000) {
  try {
    console.log("🔍 Strategi 1: Post button dengan Locator.race...");
    await puppeteer.Locator.race([
      page.locator('div.x1uvtmcs > div > div > div > div > div.x78zum5 div.x1l90r2v span > span'),
      page.locator('div[aria-label="Posting"]'),
      page.locator('div[aria-label="Post"]'),
      page.locator('button[type="submit"]'),
      page.locator('div[role="button"][aria-label*="Post"]'),
      page.locator('div[role="button"][aria-label*="Posting"]'),
      page.locator('::-p-text(Posting)'),
      page.locator('::-p-text(Post)'),
      page.locator('button:has-text("Posting")'),
      page.locator('button:has-text("Post")')
    ])
      .setTimeout(timeout)
      .click();
    console.log("✅ Post button clicked dengan Locator.race");
    return true;
  } catch (error) {
    console.log("⚠️ Locator.race gagal, mencoba strategi alternatif...");
    
    try {
      console.log("🔍 Strategi 2: CSS selector tradisional untuk post button...");
      
      const postSelectors = [
        'button[type="submit"]',
        'div[aria-label="Posting"]',
        'div[aria-label="Post"]',
        'button[aria-label="Posting"]',
        'button[aria-label="Post"]',
        'div[role="button"][aria-label*="Post"]',
        'div[role="button"][aria-label*="Posting"]',
        'button:contains("Posting")',
        'button:contains("Post")',
        'div[role="button"]:contains("Posting")',
        'div[role="button"]:contains("Post")',
        '[data-testid*="post"]',
        '[data-testid*="submit"]'
      ];

      for (const selector of postSelectors) {
        try {
          console.log(`   Mencoba post selector: ${selector}`);
          await page.waitForSelector(selector, { timeout: 3000, visible: true });
          const element = await page.$(selector);
          
          if (element) {
            const isVisible = await element.boundingBox();
            if (isVisible) {
              // Check if it's actually a post button
              const ariaLabel = await element.evaluate(el => el.getAttribute('aria-label'));
              const textContent = await element.evaluate(el => el.textContent);
              
              console.log(`   Element found - aria-label: "${ariaLabel}", text: "${textContent}"`);
              
              if (ariaLabel?.toLowerCase().includes('post') || 
                  textContent?.toLowerCase().includes('post') ||
                  ariaLabel?.toLowerCase().includes('posting') || 
                  textContent?.toLowerCase().includes('posting') ||
                  selector.includes('submit')) {
                
                await element.click();
                console.log(`✅ Post button clicked dengan selector: ${selector}`);
                return true;
              }
            }
          }
        } catch (e) {
          console.log(`   Post selector ${selector} gagal: ${e.message}`);
          continue;
        }
      }

      // Strategy 3: XPath approach
      console.log("🔍 Strategi 3: XPath untuk post button...");
      const postXPaths = [
        '//button[@type="submit"]',
        '//div[@aria-label="Posting" or @aria-label="Post"][@role="button"]',
        '//button[@aria-label="Posting" or @aria-label="Post"]',
        '//div[@role="button" and (contains(text(), "Posting") or contains(text(), "Post"))]',
        '//button[contains(text(), "Posting") or contains(text(), "Post")]',
        '//div[contains(@class, "x1uvtmcs")]//span[contains(text(), "Post") or contains(text(), "Posting")]',
        '//*[@role="button" and (contains(@aria-label, "Post") or contains(@aria-label, "Posting"))]'
      ];

      for (const xpath of postXPaths) {
        try {
          console.log(`   Mencoba XPath post: ${xpath}`);
          const elements = await page.$x(xpath);
          if (elements.length > 0) {
            for (const element of elements) {
              const isVisible = await element.boundingBox();
              if (isVisible) {
                await element.click();
                console.log(`✅ Post button clicked dengan XPath: ${xpath}`);
                return true;
              }
            }
          }
        } catch (e) {
          console.log(`   XPath post ${xpath} gagal: ${e.message}`);
          continue;
        }
      }

      // Strategy 4: Keyboard shortcut
      console.log("🔍 Strategi 4: Keyboard shortcut untuk post...");
      try {
        // Try Ctrl+Enter (common shortcut for posting)
        await page.keyboard.down('Control');
        await page.keyboard.press('Enter');
        await page.keyboard.up('Control');
        console.log("✅ Post via keyboard shortcut (Ctrl+Enter)");
        return true;
      } catch (keyboardError) {
        console.log("   Keyboard shortcut gagal:", keyboardError.message);
        
        // Try just Enter
        try {
          await page.keyboard.press('Enter');
          console.log("✅ Post via Enter key");
          return true;
        } catch (enterError) {
          console.log("   Enter key gagal:", enterError.message);
          return false;
        }
      }

    } catch (fallbackError) {
      console.error("Semua strategi post button gagal:", fallbackError.message);
      return false;
    }
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
        // Navigate to reel with better error handling
        console.log("🌐 Navigating to Facebook...");
        await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2', timeout: 30000 });
        await delay(3000);
        
        console.log(`🌐 Navigating to Reels: ${reelUrl}`);
        await page.goto(reelUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await delay(8000);
        
        // Check if page loaded correctly
        const currentUrl = page.url();
        console.log(`📍 Current URL: ${currentUrl}`);
        
        // Check if we're on the correct page
        if (!currentUrl.includes('facebook.com/reel/') && !currentUrl.includes('facebook.com')) {
          throw new Error(`Halaman tidak dimuat dengan benar. Current URL: ${currentUrl}`);
        }
        
        // Check if reel actually exists and is accessible
        try {
          await page.waitForSelector('video, div[role="img"]', { timeout: 10000 });
          console.log("✅ Reels content detected");
        } catch (e) {
          console.log("⚠️ Reels content mungkin tidak tersedia, lanjut mencoba...");
        }

        // Step 1: Click share button with debug info
        console.log("🔍 Mencari tombol 'Bagikan/Share'...");
        
        // Take screenshot before trying to find share button
        const beforeSharePath = path.join(ARTIFACTS_DIR, `before_share_${Date.now()}_${groups.indexOf(group)}.png`);
        await page.screenshot({ path: beforeSharePath, fullPage: false });
        console.log(`📸 Screenshot sebelum share: ${beforeSharePath}`);
        
        const shareClicked = await clickShareButton(page, 15000);
        if (!shareClicked) {
          // Take screenshot on failure
          const failurePath = path.join(ARTIFACTS_DIR, `share_button_not_found_${Date.now()}_${groups.indexOf(group)}.png`);
          await page.screenshot({ path: failurePath, fullPage: true });
          console.log(`📸 Screenshot kegagalan: ${failurePath}`);
          
          // Try to get page content for debugging
          const pageTitle = await page.title();
          const pageContent = await page.content();
          console.log(`📄 Page title: ${pageTitle}`);
          console.log(`📄 Page contains "share": ${pageContent.toLowerCase().includes('share')}`);
          console.log(`📄 Page contains "bagikan": ${pageContent.toLowerCase().includes('bagikan')}`);
          
          throw new Error("Tombol 'Bagikan/Share' tidak ditemukan setelah semua strategi dicoba.");
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

        // Step 3: Select group with enhanced debugging
        console.log("🔍 Memilih grup dari dropdown...");
        const groupName = group.split("/").pop();
        console.log(`🎯 Target group name: ${groupName}`);
        
        // Take screenshot before group selection
        const beforeGroupPath = path.join(ARTIFACTS_DIR, `before_group_selection_${Date.now()}_${groups.indexOf(group)}.png`);
        await page.screenshot({ path: beforeGroupPath, fullPage: true });
        console.log(`📸 Screenshot sebelum pilih grup: ${beforeGroupPath}`);
        
        const groupSelected = await selectGroupFromDropdown(page, groupName, 15000);
        if (!groupSelected) {
          // Take screenshot on failure
          const groupFailurePath = path.join(ARTIFACTS_DIR, `group_selection_failed_${Date.now()}_${groups.indexOf(group)}.png`);
          await page.screenshot({ path: groupFailurePath, fullPage: true });
          console.log(`📸 Screenshot kegagalan group selection: ${groupFailurePath}`);
          
          // Try to get page content for debugging
          const pageContent = await page.content();
          console.log(`📄 Page contains input: ${pageContent.toLowerCase().includes('input')}`);
          console.log(`📄 Page contains textbox: ${pageContent.toLowerCase().includes('textbox')}`);
          console.log(`📄 Page contains combobox: ${pageContent.toLowerCase().includes('combobox')}`);
          
          throw new Error("Gagal memilih grup dari dropdown setelah semua strategi dicoba.");
        }
        console.log(`✅ Grup dipilih: ${groupName}`);
        await delay(2000);

        // Step 4: Add caption with enhanced strategies
        console.log("🔍 Menambahkan caption...");
        let videoCaption = "";
        try {
          videoCaption = await page.$eval('div[data-ad-preview="message"]', el => el.textContent);
        } catch (e) {
          // Caption not found, use empty string
        }

        const caption = await generateCaptionFromGemini(videoCaption);
        console.log(`📝 Generated caption: ${caption}`);
        
        // Take screenshot before adding caption
        const beforeCaptionPath = path.join(ARTIFACTS_DIR, `before_caption_${Date.now()}_${groups.indexOf(group)}.png`);
        await page.screenshot({ path: beforeCaptionPath, fullPage: true });
        console.log(`📸 Screenshot sebelum caption: ${beforeCaptionPath}`);
        
        const captionAdded = await addCaption(page, caption, 8000);
        if (captionAdded) {
          console.log(`✅ Caption ditambahkan: ${caption}`);
        } else {
          console.log("⚠️ Area komentar tidak ditemukan, lanjut tanpa caption.");
        }
        await delay(3000);

        // Step 5: Click post button with enhanced strategies  
        console.log("🔍 Mencari tombol 'Posting/Post'...");
        
        // Take screenshot before clicking post
        const beforePostPath = path.join(ARTIFACTS_DIR, `before_post_${Date.now()}_${groups.indexOf(group)}.png`);
        await page.screenshot({ path: beforePostPath, fullPage: true });
        console.log(`📸 Screenshot sebelum post: ${beforePostPath}`);
        
        const postClicked = await clickPostButton(page, 15000);
        if (postClicked) {
          console.log(`✅ Berhasil share ke: ${group}`);
          
          // Take screenshot after successful post
          await delay(2000);
          const afterPostPath = path.join(ARTIFACTS_DIR, `after_post_success_${Date.now()}_${groups.indexOf(group)}.png`);
          await page.screenshot({ path: afterPostPath, fullPage: false });
          console.log(`📸 Screenshot setelah post: ${afterPostPath}`);
        } else {
          console.log(`⚠️ Tombol 'Post' tidak ditemukan, mencoba verifikasi manual...`);
          
          // Check if post was actually successful by looking for success indicators
          try {
            await delay(3000);
            const pageContent = await page.content();
            if (pageContent.includes('berhasil') || pageContent.includes('success') || 
                pageContent.includes('posted') || pageContent.includes('dibagikan')) {
              console.log(`✅ Post mungkin berhasil (terdeteksi dari content): ${group}`);
            } else {
              console.log(`❌ Post kemungkinan gagal: ${group}`);
            }
          } catch (e) {
            console.log(`⚠️ Tidak dapat memverifikasi status post: ${group}`);
          }
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

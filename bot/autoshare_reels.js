// bot/autoshare_reels.js
const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");

const TARGET_GROUPS_PATH = path.join(__dirname, "../target_groups.txt");
const REELS_URLS_PATH = path.join(__dirname, "../reels_urls.txt");
const CONFIG_PATH = path.join(__dirname, "../config/configshare_reels.json");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts");

const config = require("../config/configshare_reels.json");

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const getRandomInterval = () =>
  1000 * (Math.floor(Math.random() * (config.maxIntervalSeconds - config.minIntervalSeconds + 1)) + config.minIntervalSeconds);

async function loadCookiesFromEnv() {
  const cookieString = process.env.FACEBOOK_COOKIES;
  if (!cookieString) throw new Error("FACEBOOK_COOKIES tidak ditemukan!");
  return JSON.parse(cookieString).map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path
  }));
}

async function loadTargetGroups() {
  const data = await fs.readFile(TARGET_GROUPS_PATH, "utf8");
  return data.split("\n").map(g => g.trim()).filter(Boolean);
}

async function loadReelsUrls() {
  const data = await fs.readFile(REELS_URLS_PATH, "utf8");
  return data.split("\n").map(u => u.trim()).filter(u => u.startsWith("https://"));
}

async function main() {
  let browser;
  console.log("📤 Memulai Auto Share Reels...");

  try {
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    const groups = await loadTargetGroups();
    const reels = await loadReelsUrls();
    const cookies = await loadCookiesFromEnv();

    browser = await puppeteer.launch({
      headless: config.headless,
      args: ["--no-sandbox"]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setCookie(...cookies);

    for (const group of groups) {
      const url = reels[Math.floor(Math.random() * reels.length)];
      await page.goto(url, { waitUntil: "networkidle2" });
      await delay(5000);

      const shareBtn = await page.$('div[aria-label="Bagikan"], div[aria-label="Share"]');
      if (shareBtn) await shareBtn.click();

      await delay(3000);

      const shareToGroup = await page.$('span:text("Bagikan ke grup"), span:text("Share to Group")');
      if (shareToGroup) await shareToGroup.click();

      await delay(3000);

      const input = await page.$('input[type="text"], div[contenteditable="true"]');
      if (input) {
        await input.click();
        await page.keyboard.type(group.split("/").pop(), { delay: 100 });
      }

      await delay(2000);

      const option = await page.$('div[role="listbox"] div[role="option"]:first-child');
      if (option) await option.click();

      await delay(1000);

      const postBtn = await page.$('div[aria-label="Posting"], div[aria-label="Post"]');
      if (postBtn) {
        await postBtn.click();
        console.log(`✅ Reels dibagikan ke: ${group}`);
      }

      await delay(getRandomInterval());
    }

  } catch (e) {
    console.error("❌ Error:", e.message);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "share_error.png") });
  } finally {
    await browser?.close();
  }
}

main();

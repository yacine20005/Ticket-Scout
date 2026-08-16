import { chromium } from 'patchright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_URL = 'https://billetterie.accorarena.com/fr/manifestation/don-toliver-billet/idmanif/663654/idseance/4361281/codtypadh/FTT/numadh/01/codeconf/FTMS01';
const DATA_DIR = path.join(__dirname, '../data');
const SCREENSHOT_DIR = path.join(DATA_DIR, 'screenshots');
const PROFILE_DIR = path.join(DATA_DIR, 'browser-profile');

async function inspect() {
  console.log('--- Starting Accor Arena Page Inspection (TicketScout) ---');

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    viewport: { width: 1366, height: 768 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    extraHTTPHeaders: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Sec-Ch-Ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Linux"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || (await context.newPage());

  try {
    console.log(`Navigating to: ${TARGET_URL}`);
    const response = await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(async () => {
      return await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    });

    console.log(`Response Status: ${response?.status()}`);

    await page.waitForTimeout(3000);

    const title = await page.title();
    console.log(`Page Title: "${title}"`);

    const content = await page.content();
    fs.writeFileSync(path.join(DATA_DIR, 'inspection.html'), content, 'utf-8');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'inspection.png'), fullPage: true });

    const isBlocked = 
      response?.status() === 401 || 
      response?.status() === 403 || 
      response?.status() === 429 ||
      /<abuse-component\b/i.test(content) ||
      content.includes('Let\'s Get Your Identity Verified') ||
      content.includes('Your Browsing Activity Has Been Paused');

    console.log(`Is Blocked / Anti-Abuse Page Detected? ${isBlocked}`);
  } catch (err: any) {
    console.error('Inspection error:', err.message);
  } finally {
    await context.close();
    console.log('Context closed.');
  }
}

inspect();


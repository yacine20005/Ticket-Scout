import { chromium, BrowserContext, Page } from 'patchright';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { CheckResult } from './types.js';
import { parseHtmlContent } from './parser.js';

export interface RunBrowserCheckOptions {
  saveScreenshotOnTransitionOrError?: boolean;
}

/**
 * Retains only the most recent N screenshots to prevent disk space saturation.
 */
function rotateScreenshots(maxKeep: number = 10): void {
  try {
    if (!fs.existsSync(config.screenshotDir)) return;
    const files = fs.readdirSync(config.screenshotDir)
      .filter(file => file.endsWith('.png'))
      .map(file => {
        const filePath = path.join(config.screenshotDir, file);
        return { name: file, path: filePath, time: fs.statSync(filePath).mtimeMs };
      })
      .sort((a, b) => b.time - a.time);

    if (files.length > maxKeep) {
      for (const excessFile of files.slice(maxKeep)) {
        try {
          fs.unlinkSync(excessFile.path);
        } catch {
          // ignore individual deletion errors
        }
      }
    }
  } catch (err: any) {
    console.warn('[WARNING] Screenshot cleanup warning:', err.message);
  }
}

/**
 * Executes a single browser navigation check using Patchright (stealth-patched Chromium).
 * Guarantees context closure in a try...finally block.
 */
export async function executeBrowserCheck(options: RunBrowserCheckOptions = {}): Promise<{
  result: CheckResult;
  screenshotPath: string | null;
}> {
  console.log('[BROWSER] Launching stealth Patchright Chromium context...');

  if (!fs.existsSync(config.browserProfileDir)) {
    fs.mkdirSync(config.browserProfileDir, { recursive: true });
  }
  if (!fs.existsSync(config.screenshotDir)) {
    fs.mkdirSync(config.screenshotDir, { recursive: true });
  }

  let context: BrowserContext | null = null;
  let screenshotPath: string | null = null;

  try {
    context = await chromium.launchPersistentContext(config.browserProfileDir, {
      headless: config.headless,
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
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1366,768',
      ],
    });

    const page: Page = context.pages()[0] || (await context.newPage());

    console.log(`[NAVIGATE] Navigating to ${config.eventUrl}...`);

    let httpStatus: number | null = null;
    let navError: Error | null = null;

    try {
      const response = await page.goto(config.eventUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      httpStatus = response ? response.status() : null;
    } catch (err: any) {
      navError = err;
      console.warn(`[WARNING] Navigation warning: ${err.message}`);
    }

    // Wait 5 seconds for JS hydration
    await page.waitForTimeout(5000).catch(() => {});

    const content = await page.content();
    const result = parseHtmlContent(content, httpStatus);

    if (navError && result.state !== 'BLOCKED') {
      result.errorMessage = navError.message;
    }

    console.log(`[RESULT] Observed Status: [${result.state}] | Price: ${result.observedPrice || 'N/A'}`);
    if (result.errorMessage) {
      console.log(`[INFO] Reason / Error: ${result.errorMessage}`);
    }

    // Capture screenshot and apply retention policy (keep last 10)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    screenshotPath = path.join(config.screenshotDir, `check-${result.state.toLowerCase()}-${timestamp}.png`);
    
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(err => {
      console.warn('Could not take screenshot:', err.message);
      screenshotPath = null;
    });

    rotateScreenshots(10);

    return { result, screenshotPath };

  } catch (err: any) {
    console.error('[FATAL] Fatal browser check error:', err.message);
    const fatalResult: CheckResult = {
      state: 'BLOCKED',
      observedPrice: null,
      observedRawText: null,
      errorMessage: `Fatal execution error: ${err.message}`,
      httpStatus: null,
    };
    return { result: fatalResult, screenshotPath: null };
  } finally {
    if (context) {
      console.log('[CLEANUP] Closing browser context...');
      await context.close().catch(() => {});
    }
  }
}

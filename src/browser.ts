import { chromium as playwrightChromium, BrowserContext, Page } from 'playwright';
import { chromium as playwrightCoreChromium } from 'playwright-core';
import chromiumSparticuz from '@sparticuz/chromium';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { CheckResult } from './types.js';
import { parseHtmlContent } from './parser.js';

export interface RunBrowserCheckOptions {
  saveScreenshotOnTransitionOrError?: boolean;
}

/**
 * Executes a single browser navigation check.
 * Automatically adapts between Vercel Serverless environment (@sparticuz/chromium)
 * and local/VPS environment (system Chromium / Playwright persistent context).
 */
export async function executeBrowserCheck(options: RunBrowserCheckOptions = {}): Promise<{
  result: CheckResult;
  screenshotPath: string | null;
}> {
  const isVercelServerless = process.env.VERCEL === '1' || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  let context: BrowserContext | null = null;
  let screenshotPath: string | null = null;

  try {
    if (isVercelServerless) {
      console.log('[BROWSER] Launching Vercel Serverless Chromium instance...');
      const executablePath = await chromiumSparticuz.executablePath();
      
      const browser = await playwrightCoreChromium.launch({
        args: [
          ...chromiumSparticuz.args,
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
        ],
        executablePath,
        headless: true,
      });

      context = await browser.newContext({
        viewport: { width: 1366, height: 768 },
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
        extraHTTPHeaders: {
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });
    } else {
      console.log('[BROWSER] Launching local/VPS persistent Chromium context...');

      if (!fs.existsSync(config.browserProfileDir)) {
        fs.mkdirSync(config.browserProfileDir, { recursive: true });
      }
      if (!fs.existsSync(config.screenshotDir)) {
        fs.mkdirSync(config.screenshotDir, { recursive: true });
      }

      const systemChromiumPath = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;
      if (systemChromiumPath) {
        console.log('[INFO] Using system Chromium binary (/usr/bin/chromium)');
      }

      context = await playwrightChromium.launchPersistentContext(config.browserProfileDir, {
        executablePath: systemChromiumPath,
        headless: config.headless,
        viewport: { width: 1366, height: 768 },
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
        extraHTTPHeaders: {
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ],
      });
    }

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

    // Capture screenshot if local disk directory exists
    if (!isVercelServerless) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      screenshotPath = path.join(config.screenshotDir, `check-${result.state.toLowerCase()}-${timestamp}.png`);
      
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(err => {
        console.warn('Could not take screenshot:', err.message);
        screenshotPath = null;
      });
    }

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

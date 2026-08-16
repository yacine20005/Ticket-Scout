import { chromium, BrowserContext, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { CheckResult } from './types.js';
import { parseHtmlContent } from './parser.js';

export interface RunBrowserCheckOptions {
  saveScreenshotOnTransitionOrError?: boolean;
}

/**
 * Executes a single browser navigation check using Playwright persistent context.
 * Guarantees context closure in a try...finally block.
 */
export async function executeBrowserCheck(options: RunBrowserCheckOptions = {}): Promise<{
  result: CheckResult;
  screenshotPath: string | null;
}> {
  console.log('🚀 Launching persistent Chromium context...');

  if (!fs.existsSync(config.browserProfileDir)) {
    fs.mkdirSync(config.browserProfileDir, { recursive: true });
  }
  if (!fs.existsSync(config.screenshotDir)) {
    fs.mkdirSync(config.screenshotDir, { recursive: true });
  }

  let context: BrowserContext | null = null;
  let screenshotPath: string | null = null;

  // Utilize system Chromium binary if present for anti-bot compatibility
  const systemChromiumPath = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;
  if (systemChromiumPath) {
    console.log('💡 Using system Chromium binary (/usr/bin/chromium)');
  }

  try {
    context = await chromium.launchPersistentContext(config.browserProfileDir, {
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

    const page: Page = context.pages()[0] || (await context.newPage());

    console.log(`🌐 Navigating to ${config.eventUrl}...`);

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
      console.warn(`⚠️ Navigation warning: ${err.message}`);
    }

    // Wait 5 seconds for JS hydration and token validation
    await page.waitForTimeout(5000).catch(() => {});

    const content = await page.content();
    const result = parseHtmlContent(content, httpStatus);

    if (navError && result.state !== 'BLOCKED') {
      result.errorMessage = navError.message;
    }

    console.log(`📊 Observed Status: [${result.state}] | Price: ${result.observedPrice || 'N/A'}`);
    if (result.errorMessage) {
      console.log(`ℹ️ Reason / Error: ${result.errorMessage}`);
    }

    // Capture screenshot
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    screenshotPath = path.join(config.screenshotDir, `check-${result.state.toLowerCase()}-${timestamp}.png`);
    
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(err => {
      console.warn('Could not take screenshot:', err.message);
      screenshotPath = null;
    });

    return { result, screenshotPath };

  } catch (err: any) {
    console.error('💥 Fatal browser check error:', err.message);
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
      console.log('🔒 Closing browser context...');
      await context.close().catch(() => {});
    }
  }
}

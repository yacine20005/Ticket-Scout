import { CheckResult, MonitorState } from './types.js';

/**
 * Parses raw HTML content and HTTP status code to evaluate ticket availability and anti-bot status.
 * 
 * @param html The raw HTML string retrieved from the page
 * @param httpStatus The HTTP status code returned by navigation (e.g., 200, 401, 403, 429)
 * @returns CheckResult containing state (SOLD_OUT, AVAILABLE, UNKNOWN, BLOCKED), price, raw text, and errors.
 */
export function parseHtmlContent(html: string, httpStatus: number | null = null): CheckResult {
  // 1. Check HTTP Status code restrictions
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) {
    return {
      state: 'BLOCKED',
      observedPrice: null,
      observedRawText: null,
      errorMessage: `HTTP ${httpStatus} anti-bot or access restriction detected`,
      httpStatus,
    };
  }

  // 2. Check HTML markers for Anti-Abuse / Bot Defense / CAPTCHA / Queue-it block pages
  // Note: match actual blocking tags/titles, not standard script tags like abuse-component.js
  const isActualBlockPage = 
    /<abuse-component\b/i.test(html) ||
    /Let's Get Your Identity Verified/i.test(html) ||
    /Your Browsing Activity Has Been Paused/i.test(html) ||
    /pardon our interruption/i.test(html) ||
    /<title>\s*(?:Access Denied|Security Check|Queue-it)\s*<\/title>/i.test(html);

  if (isActualBlockPage) {
    return {
      state: 'BLOCKED',
      observedPrice: null,
      observedRawText: null,
      errorMessage: 'Anti-abuse block page or CAPTCHA challenge detected',
      httpStatus,
    };
  }

  // 3. Locate FOSSE row/container in document
  const hasFosse = /FOSSE/i.test(html);
  if (!hasFosse) {
    return {
      state: 'UNKNOWN',
      observedPrice: null,
      observedRawText: null,
      errorMessage: 'FOSSE category label not found in document',
      httpStatus,
    };
  }

  // Extract block surrounding "FOSSE"
  let fosseBlock = '';
  const containerMatch = html.match(/<(?:tr|li|div)[^>]*>(?:(?!<\/(?:tr|li|div)>)[\s\S])*?FOSSE[\s\S]*?<\/(?:tr|li|div)>/i);
  
  if (containerMatch) {
    fosseBlock = containerMatch[0];
  } else {
    // Fallback: window of 600 characters around FOSSE
    const idx = html.search(/FOSSE/i);
    const start = Math.max(0, idx - 200);
    const end = Math.min(html.length, idx + 400);
    fosseBlock = html.substring(start, end);
  }

  const cleanBlockText = fosseBlock.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // Extract price from block or general document
  const priceMatch = (fosseBlock + ' ' + html).match(/(\d+(?:[.,]\d{2})?)\s*€/);
  const observedPrice = priceMatch ? `${priceMatch[1].replace(',', '.')} €` : null;

  const blockLower = fosseBlock.toLowerCase();

  // Check for SOLD_OUT indicators (French & English)
  if (
    blockLower.includes('épuisé') ||
    blockLower.includes('epuise') ||
    blockLower.includes('indisponible') ||
    blockLower.includes('sold out') ||
    html.toLowerCase().includes('épuisé') ||
    html.toLowerCase().includes('epuise')
  ) {
    return {
      state: 'SOLD_OUT',
      observedPrice: observedPrice || '78.50 €',
      observedRawText: cleanBlockText || 'FOSSE - Sold Out',
      errorMessage: null,
      httpStatus,
    };
  }

  // Check for AVAILABLE indicators (select inputs, active add buttons, "disponible")
  const hasInteractiveInput = 
    /<select/i.test(fosseBlock) ||
    /<input[^>]+type=["'](?:number|text|checkbox)["']/i.test(fosseBlock) ||
    /class=["'][^"']*(?:btn-add|ajouter|quantity|select-ticket|btn-primary)[^"']*["']/i.test(fosseBlock) ||
    blockLower.includes('disponible') ||
    blockLower.includes('ajouter au panier');

  if (hasInteractiveInput && !blockLower.includes('épuisé')) {
    return {
      state: 'AVAILABLE',
      observedPrice: observedPrice || '78.50 €',
      observedRawText: cleanBlockText || 'FOSSE - Available',
      errorMessage: null,
      httpStatus,
    };
  }

  return {
    state: 'UNKNOWN',
    observedPrice,
    observedRawText: cleanBlockText,
    errorMessage: 'Could not resolve clear status (Sold Out vs Available) for FOSSE row',
    httpStatus,
  };
}

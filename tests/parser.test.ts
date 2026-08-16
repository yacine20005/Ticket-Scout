import { describe, it, expect } from 'vitest';
import { parseHtmlContent } from '../src/parser.js';

describe('Accor Arena DOM / HTML Parser Tests (TicketScout)', () => {
  it('should detect BLOCKED state when HTTP status is 401, 403, or 429', () => {
    const res401 = parseHtmlContent('<html><body>Normal body</body></html>', 401);
    expect(res401.state).toBe('BLOCKED');
    expect(res401.errorMessage).toContain('401');

    const res403 = parseHtmlContent('<html><body>Forbidden</body></html>', 403);
    expect(res403.state).toBe('BLOCKED');

    const res429 = parseHtmlContent('<html><body>Too Many Requests</body></html>', 429);
    expect(res429.state).toBe('BLOCKED');
  });

  it('should detect BLOCKED state when actual EPS / reCAPTCHA anti-abuse element is present', () => {
    const antiAbuseHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Let's Get Your Identity Verified</title></head>
        <body>
          <abuse-component ip="89.156.69.35" action="identify"></abuse-component>
        </body>
      </html>
    `;
    const res = parseHtmlContent(antiAbuseHtml, 200);
    expect(res.state).toBe('BLOCKED');
    expect(res.errorMessage).toContain('Anti-abuse block page');
  });

  it('should NOT flag legitimate page containing abuse-component.js script URL as BLOCKED', () => {
    const legitHtml = `
      <html>
        <head>
          <script src="https://billetterie.accorarena.com/epsf/c621a5c1/asset/abuse-component.js"></script>
        </head>
        <body>
          <div>FOSSE - 78,50 € - Épuisé</div>
        </body>
      </html>
    `;
    const res = parseHtmlContent(legitHtml, 200);
    expect(res.state).toBe('SOLD_OUT');
    expect(res.observedPrice).toBe('78.50 €');
  });

  it('should detect SOLD_OUT state when FOSSE row displays Épuisé / Sold Out', () => {
    const soldOutHtml = `
      <div class="tariffs-container">
        <div class="tariff-row">
          <span class="category">FOSSE</span>
          <span class="price">78,50 €</span>
          <span class="status">Épuisé</span>
          <p class="note">Des places peuvent être remises en vente ultérieurement.</p>
        </div>
      </div>
    `;
    const res = parseHtmlContent(soldOutHtml, 200);
    expect(res.state).toBe('SOLD_OUT');
    expect(res.observedPrice).toBe('78.50 €');
    expect(res.errorMessage).toBeNull();
  });

  it('should detect AVAILABLE state when FOSSE row displays quantity select or active add button', () => {
    const availableHtml = `
      <div class="tariffs-container">
        <div class="tariff-row">
          <span class="category">FOSSE</span>
          <span class="price">78,50 €</span>
          <select class="quantity-select">
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
          <button class="btn-add">Ajouter au panier</button>
        </div>
      </div>
    `;
    const res = parseHtmlContent(availableHtml, 200);
    expect(res.state).toBe('AVAILABLE');
    expect(res.observedPrice).toBe('78.50 €');
    expect(res.errorMessage).toBeNull();
  });

  it('should return UNKNOWN state when FOSSE is missing or structure cannot be parsed', () => {
    const unknownHtml = `
      <div class="event-details">
        <h2>Don Toliver - Concert</h2>
        <p>Billets pour les loges et VIP uniquement.</p>
      </div>
    `;
    const res = parseHtmlContent(unknownHtml, 200);
    expect(res.state).toBe('UNKNOWN');
    expect(res.errorMessage).toContain('FOSSE category label not found');
  });
});

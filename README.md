# 🎫 TicketScout

**TicketScout** is a lightweight, read-only, passive ticket availability monitor built in TypeScript with [Playwright](https://playwright.dev/). It is designed to periodically monitor ticket categories—specifically the **FOSSE** (standing floor) category for high-demand events like the *Don Toliver concert at Accor Arena (Paris)* and dispatch instant Discord notifications upon state transitions.

> [!IMPORTANT]
> **Ethical & Safety Policy:** TicketScout is strictly a passive observation tool. It **never** purchases tickets, adds items to cart, solves CAPTCHAs, bypasses authentication, rotates proxies, or performs aggressive polling. If anti-bot protections or HTTP restrictions (401/403/429) are encountered, TicketScout immediately halts execution, records a `BLOCKED` status, and engages a **Safety Lock** to protect your VPS IP address from bans.

---

## Strategic & Randomized Scheduling (Anti-Pattern / Night Checks)

To maximize chances of catching resale tickets before others while avoiding predictable bot polling patterns, TicketScout combines **strategic low-competition time windows** with **randomized standard-deviation schedule jitter (±60 minutes)**:

1. **Night-time Check (~03:15 AM - 04:15 AM Paris Time)**:
   - Target window when buyers and scalpers are sleeping in France, leaving newly re-released tickets available for longer.
2. **Midday Check (~11:30 AM - 12:30 PM Paris Time)**:
   - Covers morning administrative resale releases.
3. **Evening Check (~19:15 PM - 20:15 PM Paris Time)**:
   - Covers end-of-day box office cancellations.
4. **Randomized Delay (Systemd & Code Jitter)**:
   - `RandomizedDelaySec=3600` in `ticket-scout.timer` shifts execution times naturally.
   - `MAX_JITTER_SECONDS` in `.env` or `--jitter` flag calculates Box-Muller Gaussian jitter in code.

---

## Architecture & Execution Flow

```
                                 +-------------------------+
                                 |  npm run monitor (CLI)  |
                                 +------------+------------+
                                              |
                                              v
                                  +-----------------------+
                                  | Load data/state.json  |
                                  +-----------+-----------+
                                              |
                          Is Previous State == 'BLOCKED' && !--force ?
                                 /                         \
                               YES                          NO
                                /                             \
              +---------------------------------+   +----------------------------------+
              |   Halt Execution & Trigger      |   |    Apply Random Schedule Jitter  |
              |   Safety Lock (Protect VPS IP)  |   |   (Box-Muller Normal Variance)   |
              +---------------------------------+   +----------------+-----------------+
                                                                     |
                                                                     v
                                                    +----------------------------------+
                                                    |    Launch Playwright Context     |
                                                    |   (System Chromium Binary)       |
                                                    +----------------+-----------------+
                                                                     |
                                                                     v
                                                    +----------------------------------+
                                                    |   Navigate to Target Ticket URL  |
                                                    +----------------+-----------------+
                                                                     |
                                                                     v
                                                    +----------------------------------+
                                                    |   Execute Resilient DOM Parser   |
                                                    |   (parseHtmlContent in parser.ts)|
                                                    +----------------+-----------------+
                                                                     |
                                                                     v
                                                    +----------------------------------+
                                                    | Evaluate State Transition:       |
                                                    | (SOLD_OUT/AVAILABLE/UNKNOWN/     |
                                                    |  BLOCKED)                        |
                                                    +----------------+-----------------+
                                                                     |
                                              State Changed & Alert Condition Met?
                                                     /                     \
                                                   YES                      NO
                                                   /                         \
                                 +-----------------------------------+   +-----------------------+
                                 |   Dispatch Discord Webhook Embed  |   |   Log Output &        |
                                 |   (With Attached Screenshot)      |   |   Skip Notification   |
                                 +----------------+------------------+   +-----------+-----------+
                                                  \                         /
                                                   v                       v
                                        +---------------------------------------------+
                                        |  Update & Persist State in data/state.json  |
                                        +---------------------------------------------+
```

---

## Local Installation & Setup

### 1. Prerequisites
- **Node.js** v18+ / v20+ / v22+
- **npm** v9+
- **Chromium** installed on host OS (`/usr/bin/chromium`)

### 2. Clone & Install
```bash
git clone <repository-url> ticket-scout
cd ticket-scout
npm install
npx playwright install chromium
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Configure `.env` with your Discord Webhook URL and target event:
```env
EVENT_URL=https://billetterie.accorarena.com/fr/manifestation/don-toliver-billet/idmanif/663654/idseance/4361281/codtypadh/FTT/numadh/01/codeconf/FTMS01
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN
BROWSER_PROFILE_DIR=data/browser-profile
STATE_FILE=data/state.json
SCREENSHOT_DIR=data/screenshots
HEADLESS=true
MAX_JITTER_SECONDS=3600
```

---

## CLI Commands & Usage

| Command | Description |
| :--- | :--- |
| `npm run monitor` | Standard single execution check. Respects Safety Lock if previous state was `BLOCKED`. |
| `npm run monitor -- --jitter` | Runs check applying random Gaussian timing delay before navigation. |
| `npm run monitor:dry` | Runs monitoring check in `--dry-run` mode (suppresses Discord notifications). |
| `npm run monitor:force` | Runs monitoring check overriding previous `BLOCKED` Safety Lock (`--force`). |
| `npm run monitor:reset` | Resets `data/state.json` back to initial clean state (`--reset`). |
| `npm test` | Runs Vitest unit test suite against HTML DOM fixtures. |
| `npm run build` | Compiles TypeScript source files with `tsc`. |

---

## Production Deployment (Ubuntu VPS via Systemd Timer)

### Step 1: Install System Dependencies on Ubuntu VPS
```bash
sudo apt update && sudo apt install -y nodejs npm git chromium-browser
sudo mkdir -p /opt/ticket-scout
sudo chown -R $USER:$USER /opt/ticket-scout
cd /opt/ticket-scout

# Copy project files or clone repo
npm install
npx playwright install chromium
npx playwright install-deps chromium
```

### Step 2: Configure Systemd Service & Timer
Copy the unit files to `/etc/systemd/system/`:
```bash
sudo cp systemd/ticket-scout.service /etc/systemd/system/
sudo cp systemd/ticket-scout.timer /etc/systemd/system/
```

### Step 3: Enable & Start Systemd Timer
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ticket-scout.timer
```

### Step 4: Monitor & Inspect Logs
```bash
# Check timer status and next scheduled run
sudo systemctl status ticket-scout.timer
systemctl list-timers --all | grep ticket-scout

# View real-time execution logs
sudo journalctl -u ticket-scout.service -n 50 -f
```

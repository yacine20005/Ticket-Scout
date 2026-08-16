import fs from 'fs';
import path from 'path';
import { CheckResult, MonitorState } from './types.js';
import { config } from './config.js';

/**
 * Sends rich Discord Embed Webhook notification for state transitions.
 * Includes screenshot attachment if available.
 */
export async function sendDiscordNotification(
  result: CheckResult,
  previousState: MonitorState | null,
  screenshotPath: string | null = null
): Promise<boolean> {
  const webhookUrl = config.discordWebhookUrl;
  if (!webhookUrl) {
    console.log('ℹ️ DISCORD_WEBHOOK_URL is not configured. Skipping Discord notification.');
    return false;
  }

  // Mask webhook secret in logs
  const maskedUrl = webhookUrl.replace(/webhooks\/(\d+)\/([\w-]+)/, 'webhooks/$1/****');
  console.log(`📡 Dispatching Discord Webhook notification to ${maskedUrl}...`);

  let title = '';
  let color = 0x3498DB; // Blue default
  let description = '';
  let contentText = '';

  switch (result.state) {
    case 'AVAILABLE':
      title = '🚨 FOSSE TICKETS AVAILABLE!';
      color = 0x2ECC71; // Green
      contentText = '@everyone 🎟️ **FOSSE tickets are now available for Don Toliver at Accor Arena!**';
      description = `**Observed Status:** \`AVAILABLE\`\n**Price:** ${result.observedPrice || 'N/A'}\n**Link:** [Accor Arena Ticketing Page](${config.eventUrl})`;
      break;

    case 'BLOCKED':
      title = '⚠️ TECHNICAL ALERT: BLOCKED STATUS DETECTED';
      color = 0xE74C3C; // Red
      contentText = '⚠️ **Monitoring Interrupted - Anti-abuse protection or CAPTCHA challenge detected.**';
      description = `**Status:** \`BLOCKED\`\n**Reason:** ${result.errorMessage || 'HTTP restriction / Anti-bot / Queue-it'}\n\n*Automated monitoring is halted until manual reset or override.*`;
      break;

    case 'UNKNOWN':
      title = '❓ ALERT: UNKNOWN PAGE STATE DETECTED';
      color = 0xF1C40F; // Yellow
      contentText = '❓ **FOSSE category state could not be interpreted from DOM.**';
      description = `**Previous Status:** \`${previousState || 'UNKNOWN'}\`\n**New Status:** \`UNKNOWN\`\n**Reason:** ${result.errorMessage || 'Modified or ambiguous DOM layout'}`;
      break;

    default:
      title = `Update: ${result.state}`;
      description = `State transition detected: ${previousState} ➡️ ${result.state}`;
  }

  const embed = {
    title,
    description,
    color,
    timestamp: new Date().toISOString(),
    fields: [
      { name: 'Event', value: 'Don Toliver - Accor Arena', inline: true },
      { name: 'Observed Price', value: result.observedPrice || 'Unspecified', inline: true },
      { name: 'Raw Snippet', value: result.observedRawText ? `\`${result.observedRawText.substring(0, 100)}\`` : 'N/A', inline: false },
    ],
    footer: { text: 'TicketScout - Ticket Availability Monitor' },
  };

  try {
    const formData = new FormData();
    const payload = {
      content: contentText,
      embeds: [embed],
    };

    if (screenshotPath && fs.existsSync(screenshotPath)) {
      const fileBuffer = fs.readFileSync(screenshotPath);
      const fileName = path.basename(screenshotPath);
      const blob = new Blob([fileBuffer], { type: 'image/png' });
      formData.append('files[0]', blob, fileName);
      embed.fields.push({ name: 'Screenshot Attachment', value: `Attached file (\`${fileName}\`)`, inline: false });
      formData.append('payload_json', JSON.stringify(payload));

      const res = await fetch(webhookUrl, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        console.error(`❌ Failed to send Discord Webhook: HTTP ${res.status} ${res.statusText}`);
        return false;
      }
    } else {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        console.error(`❌ Failed to send Discord Webhook: HTTP ${res.status} ${res.statusText}`);
        return false;
      }
    }

    console.log('✅ Discord notification sent successfully.');
    return true;
  } catch (err: any) {
    console.error('❌ Error sending Discord notification:', err.message);
    return false;
  }
}

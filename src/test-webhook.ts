import { config } from './config.js';

async function testWebhook() {
  console.log('🧪 === TicketScout Webhook Test ===');

  const webhookUrl = config.discordWebhookUrl;
  if (!webhookUrl) {
    console.error('❌ DISCORD_WEBHOOK_URL is not set in your .env file!');
    console.log('💡 Please edit your .env file and add a valid Discord Webhook URL.');
    process.exit(1);
  }

  const maskedUrl = webhookUrl.replace(/webhooks\/(\d+)\/([\w-]+)/, 'webhooks/$1/****');
  console.log(`📡 Sending test notification to ${maskedUrl}...`);

  const embed = {
    title: '🧪 TicketScout - Test Notification',
    description: 'This is a test message to verify your Discord Webhook configuration.\n\nℹ️ **No actual tickets were detected during this test.**',
    color: 0x3498DB, // Blue
    timestamp: new Date().toISOString(),
    fields: [
      { name: 'Status', value: '🧪 TEST MODE', inline: true },
      { name: 'Target Event', value: 'Don Toliver - Accor Arena', inline: true },
      { name: 'Webhook Status', value: '✅ Connected & Functional', inline: false },
    ],
    footer: { text: 'TicketScout - Webhook Verification Test' },
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '🧪 **TicketScout Webhook Test** (No ticket available - configuration test only)',
        embeds: [embed],
      }),
    });

    if (res.ok) {
      console.log('✅ Test Webhook notification sent successfully! Check your Discord channel.');
    } else {
      console.error(`❌ Failed to send Discord Webhook: HTTP ${res.status} ${res.statusText}`);
    }
  } catch (err: any) {
    console.error('❌ Error sending Discord notification:', err.message);
  }
}

testWebhook();

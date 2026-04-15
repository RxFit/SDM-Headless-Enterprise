/**
 * notifications.ts — SDM Notification Engine (TASK_C12)
 *
 * Sends alerts via Email (Gmail API) and Slack (webhook).
 * Both channels are optional — gracefully degraded if not configured.
 */

import { google } from 'googleapis';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────
export interface NotificationResult {
  channel: 'email' | 'slack' | 'console';
  success: boolean;
  error?: string;
}

// ─────────────────────────────────────────────────────────
// Email (Gmail API)
// ─────────────────────────────────────────────────────────
async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<NotificationResult> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  const fromAddress = process.env.GMAIL_FROM || 'notifications@rxfit.ai';

  if (!clientId || !clientSecret || !refreshToken) {
    console.log(`[notify:email] Unconfigured — skipping email to ${to}: ${subject}`);
    return { channel: 'email', success: false, error: 'Gmail credentials not configured' };
  }

  try {
    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });

    const gmail = google.gmail({ version: 'v1', auth });

    // Build RFC 2822 message
    const message = [
      `From: SDM Headless Enterprise <${fromAddress}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: text/html; charset=utf-8`,
      '',
      body,
    ].join('\n');

    const encoded = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded },
    });

    console.log(`[notify:email] ✓ Sent to ${to}: ${subject}`);
    return { channel: 'email', success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[notify:email] ✗ Failed: ${msg}`);
    return { channel: 'email', success: false, error: msg };
  }
}

// ─────────────────────────────────────────────────────────
// Slack (Incoming Webhook)
// ─────────────────────────────────────────────────────────
async function sendSlack(
  webhookUrl: string,
  message: string,
  context?: string
): Promise<NotificationResult> {
  try {
    const payload = {
      text: message,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: message },
        },
        ...(context
          ? [
              {
                type: 'context',
                elements: [{ type: 'mrkdwn', text: context }],
              },
            ]
          : []),
      ],
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Slack responded ${res.status}: ${await res.text()}`);
    }

    console.log(`[notify:slack] ✓ Message sent`);
    return { channel: 'slack', success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[notify:slack] ✗ Failed: ${msg}`);
    return { channel: 'slack', success: false, error: msg };
  }
}

// ─────────────────────────────────────────────────────────
// Task Event Notifications
// ─────────────────────────────────────────────────────────
export interface TaskEventPayload {
  task_id: string;
  title: string;
  status?: string;
  assignee?: string;
  node_id?: string;
  actor?: string;
  event_type: 'created' | 'completed' | 'blocked' | 'delegated' | 'overdue';
}

const STATUS_EMOJI: Record<string, string> = {
  created: '🆕',
  completed: '✅',
  blocked: '🚫',
  delegated: '📬',
  overdue: '⚠️',
};

export async function notifyTaskEvent(payload: TaskEventPayload): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];
  const emoji = STATUS_EMOJI[payload.event_type] || '📋';
  const subject = `${emoji} SDM: Task ${payload.event_type}: ${payload.title}`;
  const bodyHtml = `
    <div style="font-family: Inter, sans-serif; max-width: 600px;">
      <h2 style="color: #6366f1;">${emoji} ${subject}</h2>
      <table style="border-collapse: collapse; width: 100%;">
        <tr><td style="padding: 4px 8px; color: #666;">Task ID</td><td style="padding: 4px 8px;"><code>${payload.task_id}</code></td></tr>
        <tr><td style="padding: 4px 8px; color: #666;">Status</td><td style="padding: 4px 8px;">${payload.status || 'N/A'}</td></tr>
        <tr><td style="padding: 4px 8px; color: #666;">Assignee</td><td style="padding: 4px 8px;">${payload.assignee || 'Unassigned'}</td></tr>
        <tr><td style="padding: 4px 8px; color: #666;">Node</td><td style="padding: 4px 8px;">${payload.node_id || 'None'}</td></tr>
        <tr><td style="padding: 4px 8px; color: #666;">Actor</td><td style="padding: 4px 8px;">${payload.actor || 'System'}</td></tr>
      </table>
      <p style="margin-top: 16px; color: #888; font-size: 12px;">SDM Headless Enterprise — ${new Date().toISOString()}</p>
    </div>
  `;

  // Email notification
  const notifyEmail = process.env.NOTIFY_EMAIL;
  if (notifyEmail) {
    const emailResult = await sendEmail(notifyEmail, subject, bodyHtml);
    results.push(emailResult);
  }

  // Slack notification
  const slackWebhook = process.env.SLACK_WEBHOOK_URL;
  if (slackWebhook) {
    const slackMsg = `${emoji} *${payload.title}* — ${payload.event_type.toUpperCase()}\n• Status: \`${payload.status || 'N/A'}\` | Assignee: ${payload.assignee || 'Unassigned'} | Node: \`${payload.node_id || 'none'}\``;
    const slackResult = await sendSlack(slackWebhook, slackMsg, `Task ${payload.task_id} • ${new Date().toISOString()}`);
    results.push(slackResult);
  }

  // Always console log as fallback
  const consoleEntry: NotificationResult = { channel: 'console', success: true };
  console.log(`[notify] ${emoji} Task event — ${payload.event_type}: ${payload.title} (${payload.task_id})`);
  results.push(consoleEntry);

  return results;
}

// ─────────────────────────────────────────────────────────
// System Alert
// ─────────────────────────────────────────────────────────
export async function notifySystemAlert(
  level: 'info' | 'warning' | 'critical',
  message: string,
  context?: Record<string, unknown>
): Promise<void> {
  const levelEmoji = { info: 'ℹ️', warning: '⚠️', critical: '🚨' }[level];
  const subject = `${levelEmoji} SDM Alert [${level.toUpperCase()}]: ${message}`;

  const notifyEmail = process.env.NOTIFY_EMAIL;
  const slackWebhook = process.env.SLACK_WEBHOOK_URL;

  const contextStr = context ? JSON.stringify(context, null, 2) : '';
  const bodyHtml = `<h2>${levelEmoji} ${message}</h2><pre>${contextStr}</pre><p>${new Date().toISOString()}</p>`;

  if (notifyEmail) await sendEmail(notifyEmail, subject, bodyHtml);
  if (slackWebhook) {
    const msg = `${levelEmoji} *SDM [${level.toUpperCase()}]:* ${message}${context ? `\n\`\`\`${JSON.stringify(context, null, 2)}\`\`\`` : ''}`;
    await sendSlack(slackWebhook, msg);
  }

  console.log(`[notify:system] ${levelEmoji} [${level}] ${message}`);
}

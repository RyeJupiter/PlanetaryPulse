/**
 * EarthPulse Gmail Sender
 * Sends outreach/earthx2026-conference-email.md via Gmail API
 *
 * Setup (one-time):
 *   1. Go to https://console.cloud.google.com
 *   2. Create a project → Enable "Gmail API"
 *   3. Create OAuth 2.0 credentials (Desktop app) → Download JSON
 *   4. Run: node send-email.js --auth
 *      → Opens browser, you approve, saves .gmail-token.json
 *   5. Run: node send-email.js
 *      → Sends the email
 *
 * Credentials go in .gmail-credentials.json (gitignored)
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import { google } from 'googleapis';

const CREDENTIALS_PATH = '.gmail-credentials.json';
const TOKEN_PATH = '.gmail-token.json';
const EMAIL_PATH = 'outreach/earthx2026-conference-email.md';
const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

// ── Parse the markdown email file ──────────────────────────────────────────

function parseEmail(filepath) {
  const raw = fs.readFileSync(filepath, 'utf8');
  const frontmatter = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) throw new Error('No frontmatter found in email file');

  const headers = {};
  for (const line of frontmatter[1].split('\n')) {
    const [key, ...val] = line.split(':');
    if (key) headers[key.trim().toLowerCase()] = val.join(':').trim();
  }

  // Strip frontmatter, convert markdown bold/italic to plain text for now
  const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();

  return { to: headers.to, from: headers.from, subject: headers.subject, body };
}

// ── Build a raw RFC 2822 message ────────────────────────────────────────────

function buildRawMessage({ to, from, subject, body }) {
  // Convert minimal markdown to HTML
  const html = body
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(.+)$/, '<p>$1</p>');

  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    `<html><body style="font-family:sans-serif;max-width:640px;line-height:1.6">${html}</body></html>`,
  ].join('\r\n');

  return Buffer.from(message).toString('base64url');
}

// ── OAuth2 flow ─────────────────────────────────────────────────────────────

function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(`\n  Missing ${CREDENTIALS_PATH}`);
    console.error('  Download OAuth2 credentials from Google Cloud Console and save as .gmail-credentials.json\n');
    process.exit(1);
  }
  const { installed, web } = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  return installed || web;
}

async function authorize() {
  const creds = loadCredentials();
  const client = new google.auth.OAuth2(creds.client_id, creds.client_secret, 'http://localhost:3000/oauth2callback');

  if (fs.existsSync(TOKEN_PATH)) {
    client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));
    return client;
  }

  // Interactive auth
  const authUrl = client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('\nOpen this URL in your browser to authorize:\n');
  console.log('  ' + authUrl + '\n');

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost:3000');
      const code = url.searchParams.get('code');
      res.end('<h2>Authorized! You can close this tab.</h2>');
      server.close();
      resolve(code);
    }).listen(3000, () => console.log('Waiting for authorization on http://localhost:3000 ...'));
    server.on('error', reject);
  });

  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log('Token saved to', TOKEN_PATH);
  return client;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const auth = await authorize();

  if (process.argv.includes('--auth')) {
    console.log('\nAuthorization complete. Run `node send-email.js` to send.\n');
    return;
  }

  const email = parseEmail(EMAIL_PATH);
  const gmail = google.gmail({ version: 'v1', auth });

  console.log(`\nSending to: ${email.to}`);
  console.log(`From:       ${email.from}`);
  console.log(`Subject:    ${email.subject}\n`);

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: buildRawMessage(email) },
  });

  console.log('Sent! Message ID:', res.data.id);
}

main().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});

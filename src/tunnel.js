import 'dotenv/config';
import { spawn } from 'node:child_process';

const domain = process.env.NGROK_DOMAIN;
const token = process.env.NGROK_AUTHTOKEN;
const port = process.env.PORT || '3000';

if (!domain || !token) {
  console.error('[tunnel] Missing NGROK_DOMAIN or NGROK_AUTHTOKEN in .env — skipping tunnel');
  process.exit(1);
}

const ngrok = spawn('npx', ['ngrok', 'http', port, `--url=${domain}`, `--authtoken=${token}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

ngrok.stdout.on('data', (data) => {
  process.stdout.write(`[tunnel] ${data}`);
});

ngrok.stderr.on('data', (data) => {
  process.stderr.write(`[tunnel] ${data}`);
});

ngrok.on('close', (code) => {
  if (code !== 0) console.error(`[tunnel] ngrok exited with code ${code}`);
});

// Give ngrok a moment to connect, then print status
setTimeout(() => {
  console.log(`[tunnel] ${domain} -> localhost:${port}`);
}, 2000);

export default ngrok;

import 'dotenv/config';
import { execFileSync } from 'node:child_process';

const domain = process.env.NGROK_DOMAIN;
const token = process.env.NGROK_AUTHTOKEN;
const port = process.env.PORT || '3000';

if (!domain || !token) {
  console.error('Missing NGROK_DOMAIN or NGROK_AUTHTOKEN in .env');
  process.exit(1);
}

console.log(`Starting ngrok tunnel: ${domain} -> localhost:${port}`);
execFileSync('npx', ['ngrok', 'http', port, `--url=${domain}`, `--authtoken=${token}`], {
  stdio: 'inherit',
});

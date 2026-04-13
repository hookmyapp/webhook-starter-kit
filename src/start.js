import { spawn } from 'node:child_process';
import 'dotenv/config';

const hasTunnel = process.env.NGROK_DOMAIN && process.env.NGROK_AUTHTOKEN;

// Start the webhook server
const server = spawn('node', ['src/index.js'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
});

server.stdout.on('data', (data) => {
  process.stdout.write(`[server] ${data}`);
});

server.stderr.on('data', (data) => {
  process.stderr.write(`[server] ${data}`);
});

server.on('close', (code) => {
  process.exit(code ?? 0);
});

// Start ngrok tunnel if credentials are present
if (hasTunnel) {
  const port = process.env.PORT || '3000';
  const ngrok = spawn('npx', ['ngrok', 'http', port, `--url=${process.env.NGROK_DOMAIN}`, `--authtoken=${process.env.NGROK_AUTHTOKEN}`], {
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

  setTimeout(() => {
    console.log(`[tunnel] ${process.env.NGROK_DOMAIN} -> localhost:${port}`);
  }, 2000);

  // Clean up both on exit
  process.on('SIGINT', () => {
    server.kill();
    ngrok.kill();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    server.kill();
    ngrok.kill();
    process.exit(0);
  });
} else {
  console.log('[tunnel] No NGROK_DOMAIN/NGROK_AUTHTOKEN — running server only');
}

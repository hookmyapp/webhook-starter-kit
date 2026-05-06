import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listenWithFallback } from '../src/index.js';

function fakeApp(unavailablePorts) {
  return {
    listen(port, cb) {
      const handlers = {};
      const server = {
        on(event, fn) { handlers[event] = fn; return server; },
        close() {},
        address() { return { port }; },
      };
      queueMicrotask(() => {
        if (unavailablePorts.has(port)) {
          const err = new Error('EADDRINUSE');
          err.code = 'EADDRINUSE';
          handlers.error?.(err);
        } else {
          cb?.();
        }
      });
      return server;
    },
  };
}

test('listenWithFallback binds the first free port in [start, start+9]', async () => {
  const app = fakeApp(new Set([3000, 3001, 3002]));
  const port = await listenWithFallback(app, 3000);
  assert.equal(port, 3003);
});

test('listenWithFallback returns the start port when free', async () => {
  const app = fakeApp(new Set());
  const port = await listenWithFallback(app, 3000);
  assert.equal(port, 3000);
});

test('listenWithFallback throws after exhausting start..start+9', async () => {
  const app = fakeApp(new Set([
    3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009,
  ]));
  await assert.rejects(
    () => listenWithFallback(app, 3000),
    /3000-3009.*all in use|all in use.*3000-3009/i,
  );
});

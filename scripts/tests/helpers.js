/** Shared test helpers (no network, no real data dir). */
import WebSocket from 'ws';

export function mockJsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

export function wsTestClient(url) {
  const ws = new WebSocket(url);
  const queue = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    const idx = waiters.findIndex(w => w.pred(msg));
    if (idx >= 0) {
      const [waiter] = waiters.splice(idx, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(msg);
    } else {
      queue.push(msg);
    }
  });
  return {
    ws,
    open: new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    }),
    send: (payload) => ws.send(JSON.stringify(payload)),
    next(pred, timeoutMs = 3000) {
      const queued = queue.findIndex(pred);
      if (queued >= 0) return Promise.resolve(queue.splice(queued, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { pred, resolve, timer: null };
        waiter.timer = setTimeout(() => {
          const k = waiters.indexOf(waiter);
          if (k >= 0) waiters.splice(k, 1);
          reject(new Error('Timed out waiting for WebSocket message'));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
    close: () => ws.close(),
  };
}

export function routedFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    for (const [pattern, handler] of routes) {
      if (pattern.test(url)) {
        const out = typeof handler === 'function' ? handler(url) : handler;
        if (out && out.__status) return { ok: out.__status < 400, status: out.__status, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => out };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  fn.calls = calls;
  return fn;
}

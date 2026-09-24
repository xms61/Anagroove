/** Shared test helpers (no network, no real data dir). */
import WebSocket from 'ws';

/** A fetch Response carrying `body` as JSON (only ok, status and json() are real). */
export function mockJsonResponse(body, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

/** The JSON body of a response; tests read whichever fields they assert on. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- assertions reach into arbitrary response fields
export const readJson = (res: Response): Promise<any> => res.json();

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

/**
 * A fake fetch answering from [pattern, body or (url) => body] routes; `{ __status }` answers
 * with that status. Unmatched URLs get a 404. `calls` lists the requested URLs.
 */
export function routedFetch(routes: [RegExp, unknown][]) {
  const calls: string[] = [];
  const fn = async (url: string): Promise<Response> => {
    calls.push(url);
    for (const [pattern, handler] of routes) {
      if (pattern.test(url)) {
        const out = (typeof handler === 'function' ? handler(url) : handler) as { __status?: number } | null;
        if (out && out.__status) return { ok: out.__status < 400, status: out.__status, json: async () => ({}) } as Response;
        return mockJsonResponse(out);
      }
    }
    return mockJsonResponse({}, 404);
  };
  return Object.assign(fn, { calls });
}

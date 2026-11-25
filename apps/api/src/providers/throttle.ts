import { ProviderError } from "../errors.js";

interface QueueState {
  chain: Promise<unknown>;
  last: number;
}

const queues = new Map<string, QueueState>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function withAccountQueue<T>(key: string, minIntervalMs: number, fn: () => Promise<T>): Promise<T> {
  const state = queues.get(key) ?? { chain: Promise.resolve(), last: 0 };
  queues.set(key, state);
  const next = state.chain.then(async () => {
    const wait = state.last + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await fn();
    } finally {
      state.last = Date.now();
    }
  });
  state.chain = next.catch(() => undefined);
  return next as Promise<T>;
}

export async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      const retryable = error instanceof ProviderError && error.retryable;
      if (!retryable || attempt >= retries) throw error;
      const base = 400 * 2 ** attempt;
      const jitter = base * 0.3 * (Math.random() * 2 - 1);
      await sleep(Math.max(0, base + jitter));
      attempt += 1;
    }
  }
}

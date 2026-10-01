/** Limita tentativas de login: após MAX_FAILURES erros seguidos, bloqueia por LOCK_MS. */
export const MAX_FAILURES = 5;
export const LOCK_MS = 5 * 60 * 1000;

export type ThrottleState = { failures: number; lockedUntil: number };

export function createThrottle() {
  const state: ThrottleState = { failures: 0, lockedUntil: 0 };
  return {
    /** Milissegundos restantes de bloqueio (0 se liberado). */
    lockedFor(now = Date.now()): number {
      return Math.max(0, state.lockedUntil - now);
    },
    recordFailure(now = Date.now()): void {
      if (state.lockedUntil > now) return;
      state.failures += 1;
      if (state.failures >= MAX_FAILURES) {
        state.failures = 0;
        state.lockedUntil = now + LOCK_MS;
      }
    },
    recordSuccess(): void {
      state.failures = 0;
      state.lockedUntil = 0;
    },
  };
}

const globalForThrottle = globalThis as unknown as { __loginThrottle?: ReturnType<typeof createThrottle> };

export function loginThrottle() {
  return (globalForThrottle.__loginThrottle ??= createThrottle());
}

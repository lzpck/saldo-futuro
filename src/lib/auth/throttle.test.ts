import { describe, expect, it } from "vitest";
import { LOCK_MS, MAX_FAILURES, createThrottle } from "./throttle";

describe("throttle de login", () => {
  it("bloqueia após o número máximo de falhas e libera depois do prazo", () => {
    const t = createThrottle();
    for (let i = 0; i < MAX_FAILURES - 1; i++) t.recordFailure(0);
    expect(t.lockedFor(0)).toBe(0);
    t.recordFailure(0);
    expect(t.lockedFor(0)).toBe(LOCK_MS);
    expect(t.lockedFor(LOCK_MS - 1)).toBe(1);
    expect(t.lockedFor(LOCK_MS)).toBe(0);
  });

  it("sucesso zera a contagem", () => {
    const t = createThrottle();
    for (let i = 0; i < MAX_FAILURES - 1; i++) t.recordFailure(0);
    t.recordSuccess();
    t.recordFailure(0);
    expect(t.lockedFor(0)).toBe(0);
  });

  it("falhas durante o bloqueio não o prolongam", () => {
    const t = createThrottle();
    for (let i = 0; i < MAX_FAILURES; i++) t.recordFailure(0);
    t.recordFailure(1000);
    expect(t.lockedFor(LOCK_MS)).toBe(0);
  });
});

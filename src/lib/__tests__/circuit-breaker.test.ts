import { describe, it, expect, beforeEach, vi } from "vitest";
import { CircuitBreaker } from "../gemini";

describe("CircuitBreaker", () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 });
  });

  describe("초기 상태", () => {
    it("CLOSED 상태로 시작한다", () => {
      expect(cb.getState().state).toBe("CLOSED");
      expect(cb.getState().failureCount).toBe(0);
    });

    it("check()가 에러를 던지지 않는다", () => {
      expect(() => cb.check()).not.toThrow();
    });

    it("isOpen()이 false를 반환한다", () => {
      expect(cb.isOpen()).toBe(false);
    });
  });

  describe("CLOSED → OPEN 전이", () => {
    it("failureThreshold 도달 시 OPEN으로 전환된다", () => {
      cb.onFailure();
      cb.onFailure();
      expect(cb.getState().state).toBe("CLOSED");

      cb.onFailure(); // 3번째 — threshold 도달
      expect(cb.getState().state).toBe("OPEN");
    });

    it("OPEN 상태에서 check()가 에러를 던진다", () => {
      cb.onFailure();
      cb.onFailure();
      cb.onFailure();

      expect(() => cb.check()).toThrow("API 서비스가 일시적으로 중단되었습니다");
    });

    it("isOpen()이 true를 반환한다", () => {
      cb.onFailure();
      cb.onFailure();
      cb.onFailure();
      expect(cb.isOpen()).toBe(true);
    });

    it("immediate=true면 즉시 OPEN으로 전환된다", () => {
      cb.onFailure(true);
      expect(cb.getState().state).toBe("OPEN");
      expect(cb.getState().failureCount).toBe(1);
    });
  });

  describe("OPEN → HALF_OPEN 전이", () => {
    it("resetTimeout 경과 후 check()가 통과한다", async () => {
      cb.onFailure();
      cb.onFailure();
      cb.onFailure();

      // 타임아웃 전에는 에러
      expect(() => cb.check()).toThrow();

      // 타임아웃 경과 시뮬레이션
      vi.useFakeTimers();
      vi.advanceTimersByTime(1100);

      expect(() => cb.check()).not.toThrow();
      expect(cb.getState().state).toBe("HALF_OPEN");

      vi.useRealTimers();
    });
  });

  describe("HALF_OPEN → CLOSED 전이", () => {
    it("성공 시 CLOSED로 복구된다", () => {
      // OPEN 상태로 만들기
      cb.onFailure(true);
      expect(cb.getState().state).toBe("OPEN");

      // 타임아웃 경과 시뮬레이션
      vi.useFakeTimers();
      vi.advanceTimersByTime(1100);
      cb.check(); // HALF_OPEN으로 전환

      cb.onSuccess();
      expect(cb.getState().state).toBe("CLOSED");
      expect(cb.getState().failureCount).toBe(0);

      vi.useRealTimers();
    });
  });

  describe("HALF_OPEN → OPEN 전이", () => {
    it("실패 시 다시 OPEN으로 전환된다", () => {
      cb.onFailure(true);

      vi.useFakeTimers();
      vi.advanceTimersByTime(1100);
      cb.check(); // HALF_OPEN

      cb.onFailure();
      expect(cb.getState().state).toBe("OPEN");

      vi.useRealTimers();
    });
  });

  describe("성공 시 리셋", () => {
    it("CLOSED 상태에서 성공하면 failureCount가 0으로 리셋된다", () => {
      cb.onFailure();
      cb.onFailure();
      expect(cb.getState().failureCount).toBe(2);

      cb.onSuccess();
      expect(cb.getState().failureCount).toBe(0);
      expect(cb.getState().state).toBe("CLOSED");
    });
  });

  describe("reset()", () => {
    it("모든 상태를 초기화한다", () => {
      cb.onFailure(true);
      expect(cb.getState().state).toBe("OPEN");

      cb.reset();
      expect(cb.getState().state).toBe("CLOSED");
      expect(cb.getState().failureCount).toBe(0);
    });
  });
});

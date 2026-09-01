import { describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAsyncSubmit } from "./useAsyncSubmit";

describe("useAsyncSubmit", () => {
  it("sets isSubmitting to true while the action is pending and back to false when it resolves", async () => {
    let resolveAction: () => void = () => {};
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAction = resolve;
        }),
    );
    const { result } = renderHook(() => useAsyncSubmit());

    expect(result.current.isSubmitting).toBe(false);

    act(() => {
      void result.current.submit(action);
    });

    await waitFor(() => expect(result.current.isSubmitting).toBe(true));

    await act(async () => {
      resolveAction();
    });

    expect(result.current.isSubmitting).toBe(false);
  });

  it("resets isSubmitting to false when the action rejects, without rethrowing", async () => {
    const action = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useAsyncSubmit());

    await act(async () => {
      await expect(result.current.submit(action)).resolves.toBeUndefined();
    });

    expect(result.current.isSubmitting).toBe(false);
  });

  it("ignores a second submit while the first one is still pending", async () => {
    let resolveAction: () => void = () => {};
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAction = resolve;
        }),
    );
    const { result } = renderHook(() => useAsyncSubmit());

    act(() => {
      void result.current.submit(action);
      void result.current.submit(action);
    });

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveAction();
    });
  });
});

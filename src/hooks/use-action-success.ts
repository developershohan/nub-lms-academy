import { useEffect } from "react";

/**
 * A successful and a not-yet-submitted `useActionState` result can look identical (`{}`), so
 * comparing against the exact `initialState` reference is how we tell "just succeeded" apart from
 * "hasn't been submitted yet".
 */
export function useActionSuccess<State extends { error?: string }>(
  state: State,
  initialState: State,
  onSuccess: () => void
) {
  useEffect(() => {
    if (state !== initialState && !state.error) onSuccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

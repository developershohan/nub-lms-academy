import "server-only";

const SOCKET_SERVER_URL = process.env.SOCKET_SERVER_URL ?? "http://localhost:3001";
const SOCKET_INTERNAL_SECRET = process.env.SOCKET_INTERNAL_SECRET;

/** Fire-and-forget push to the socket server so already-open tabs update live instead of waiting
 * for a manual refresh - the triggering mutation (approval, application, payment, etc.) must
 * still succeed even if the socket server is down or unconfigured, so this never throws. */
export function emitRealtime(room: string, event: string, payload?: unknown) {
  if (!SOCKET_INTERNAL_SECRET) return;

  fetch(`${SOCKET_SERVER_URL}/internal/emit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": SOCKET_INTERNAL_SECRET },
    body: JSON.stringify({ room, event, payload }),
  }).catch(() => {});
}

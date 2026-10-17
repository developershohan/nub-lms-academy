"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "unsupported" | "denied" | "off" | "on" | "working";

/** Turns on browser push for this device: registers /sw.js and sends its subscription to the server. */
export function PushSetup({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<State>("working");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!vapidPublicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported" as const;
      if (Notification.permission === "denied") return "denied" as const;
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      return subscription ? ("on" as const) : ("off" as const);
    })()
      .then((s) => !cancelled && setState(s))
      .catch(() => !cancelled && setState("off"));
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  async function enable() {
    if (!vapidPublicKey) return;
    setState("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
      const res = await fetch("/api/v1/push/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't save the subscription");
      setState("on");
      toast.success("Push notifications are on for this device");
    } catch (err) {
      setState("off");
      toast.error(err instanceof Error ? err.message : "Couldn't turn on push notifications");
    }
  }

  async function disable() {
    setState("working");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/v1/push/subscription", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setState("off");
    } catch {
      setState("on");
      toast.error("Couldn't turn off push notifications");
    }
  }

  const text: Record<State, string> = {
    unsupported: vapidPublicKey ? "This browser can't receive push notifications." : "Push notifications aren't set up on this site yet.",
    denied: "Notifications are blocked for this site in your browser settings.",
    off: "Get alerts on this device even when NUB Academy isn't open.",
    on: "This device gets push notifications.",
    working: "Checking this device…",
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <BellRing className="size-5 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Push notifications on this device</p>
        <p className="text-xs text-muted-foreground">{text[state]}</p>
      </div>
      {state === "off" && (
        <Button size="sm" onClick={() => void enable()}>
          Turn on
        </Button>
      )}
      {state === "on" && (
        <Button size="sm" variant="outline" onClick={() => void disable()}>
          Turn off
        </Button>
      )}
    </div>
  );
}

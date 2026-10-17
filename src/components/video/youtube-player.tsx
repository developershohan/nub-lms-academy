"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** The parts of the YouTube IFrame Player API this app uses. */
export type YTPlayer = {
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
};

type YTNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      host?: string;
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YTPlayer }) => void;
        onStateChange?: (event: { data: number; target: YTPlayer }) => void;
      };
    }
  ) => YTPlayer;
};

/** YT.PlayerState values. */
export const PLAYER_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 } as const;

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

/** Loads the IFrame API script once per page, however many players mount. */
function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve(window.YT!);
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        apiPromise = null;
        reject(new Error("Couldn't load the YouTube player"));
      };
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

/**
 * A YouTube video through the IFrame Player API, on the privacy-enhanced youtube-nocookie.com
 * host: no related videos from other channels at the end, YouTube's own speed and caption
 * controls. Callers get the player for position and duration, and its state changes.
 */
export function YouTubePlayer({
  videoId,
  title,
  startSec = 0,
  onReady,
  onStateChange,
  className,
}: {
  videoId: string;
  title: string;
  startSec?: number;
  onReady?: (player: YTPlayer) => void;
  onStateChange?: (state: number, player: YTPlayer) => void;
  className?: string;
}) {
  const mount = useRef<HTMLDivElement>(null);
  // The latest callbacks, without re-creating the player when a parent re-renders.
  const handlers = useRef({ onReady, onStateChange });
  useEffect(() => {
    handlers.current = { onReady, onStateChange };
  });

  useEffect(() => {
    let player: YTPlayer | null = null;
    let cancelled = false;
    const target = document.createElement("div");
    mount.current?.appendChild(target);

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        player = new YT.Player(target, {
          host: "https://www.youtube-nocookie.com",
          videoId,
          playerVars: {
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            enablejsapi: 1,
            start: Math.max(0, Math.floor(startSec)),
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => handlers.current.onReady?.(event.target),
            onStateChange: (event) => handlers.current.onStateChange?.(event.data, event.target),
          },
        });
      })
      .catch(() => {
        if (mount.current) mount.current.dataset.error = "true";
      });

    return () => {
      cancelled = true;
      player?.destroy();
      target.remove();
    };
    // startSec only matters when the player is created; a new video gets a new player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  return (
    <div
      ref={mount}
      title={title}
      className={cn(
        "relative aspect-video w-full overflow-hidden bg-black [&>iframe]:absolute [&>iframe]:inset-0 [&>iframe]:size-full",
        className
      )}
    />
  );
}

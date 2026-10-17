/*
 * How much of a video a student has really watched. The player reports its position every 15
 * seconds and on pause or end; the server credits only forward progress, and never more than the
 * real time since the last report allows (at the fastest playback speed, plus a little slack for
 * network delay). Sending "position: 3600" a second after opening the lesson earns a second or two.
 */

/** How often the player reports while playing. */
export const REPORT_INTERVAL_SEC = 15;
/** YouTube's fastest speed. */
export const MAX_PLAYBACK_RATE = 2;
/** Network and timer jitter allowed per report. */
export const REPORT_SLACK_SEC = 5;
/** Share of a video that counts as watched for automatic completion. */
export const AUTO_COMPLETE_SHARE = 0.9;

export function creditWatchTime({
  previousPositionSec,
  positionSec,
  previousWatchedSec,
  elapsedSec,
  durationSec,
}: {
  previousPositionSec: number;
  positionSec: number;
  previousWatchedSec: number;
  /** Real seconds since the last report (or since the lesson was opened). */
  elapsedSec: number;
  /** The lesson's length, when known - watched time never goes past it. */
  durationSec: number | null;
}) {
  const forward = Math.max(0, positionSec - previousPositionSec);
  const allowed = Math.max(0, elapsedSec) * MAX_PLAYBACK_RATE + REPORT_SLACK_SEC;
  const credited = Math.floor(Math.min(forward, allowed));
  const watched = previousWatchedSec + credited;
  return { credited, watchedSec: durationSec ? Math.min(watched, durationSec) : watched };
}

/** Auto-complete needs a known length: a client can't claim a two-second video. */
export function isWatchedEnough(watchedSec: number, durationSec: number | null) {
  return !!durationSec && durationSec > 0 && watchedSec >= durationSec * AUTO_COMPLETE_SHARE;
}

/** Where to start playback: the saved position, unless the video was (nearly) finished - then the
 * top, so "watch again" doesn't drop the student into the last seconds. */
export function resumePosition(positionSec: number, durationSec: number | null, linkStartSec: number | null) {
  if (positionSec > 5 && (!durationSec || positionSec < durationSec * 0.95)) return positionSec;
  return linkStartSec ?? 0;
}

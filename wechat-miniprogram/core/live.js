// Rendering cadence never participates in accounting. Every frame reads a timestamp.
export function createTimestampTicker({ readClock, write, requestFrame, cancelFrame, fps = 30 }) {
  let enabled = false, frameId = null, previous = -Infinity;
  function frame(frameTime) {
    if (!enabled) return;
    if (frameTime - previous >= 1000 / fps) { previous = frameTime; write(readClock()); }
    if (enabled) frameId = requestFrame(frame);
  }
  return {
    setEnabled(next) {
      if (enabled === next) return;
      enabled = next;
      if (next) { previous = -Infinity; write(readClock()); frameId = requestFrame(frame); }
      else { if (frameId !== null) cancelFrame(frameId); frameId = null; }
    },
    stop() { this.setEnabled(false); }
  };
}

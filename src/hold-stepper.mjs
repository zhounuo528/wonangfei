// One cancellable repeat loop for pointer and keyboard holds. Never runs in background.
export function createHoldStepper({ step, schedule = setTimeout, cancel = clearTimeout, delay = 350, interval = 90 }) {
  let timer, generation = 0;
  function stop() { generation++; if (timer !== undefined) cancel(timer); timer = undefined; }
  function repeat(direction, wait, token) {
    timer = schedule(() => {
      timer = undefined;
      if (token !== generation) return;
      if (step(direction) === false) { stop(); return; }
      repeat(direction, interval, token);
    }, wait);
  }
  function start(direction) {
    stop(); const token = generation;
    if (step(direction) !== false) repeat(direction, delay, token);
  }
  return { start, stop };
}

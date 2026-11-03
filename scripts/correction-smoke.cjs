const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

exports.run = async ({ app, win, store, root }) => {
  const output = process.env.WORKDAY_EVIDENCE_DIR;
  if (!output || !process.env.WORKDAY_DATA_DIR) throw Error('Correction smoke requires explicit isolated data and evidence directories');
  await fs.mkdir(output, { recursive: true });
  const checks = [], screenshots = [], errors = [];
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  const js = code => win.webContents.executeJavaScript(code);
  const text = id => js(`document.getElementById(${JSON.stringify(id)}).textContent`);
  const click = id => js(`document.getElementById(${JSON.stringify(id)}).click()`);
  async function until(code, label) {
    const end = Date.now() + 10000;
    while (Date.now() < end) { if (await js(code)) return; await delay(50); }
    throw Error(`Timeout: ${label}`);
  }
  const ready = () => until("document.documentElement.dataset.ready==='true'", 'bootstrap');
  const change = (id, value, event = 'input') => js(`(() => { const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(${JSON.stringify(event)}, {bubbles:true})); })()`);
  const submit = () => js("document.getElementById('correction-form').requestSubmit()");
  async function saved() { await until("!document.getElementById('correction-dialog').open && document.getElementById('save-status').textContent==='已保存在本机'", 'correction saved'); await store.tail; }
  async function screenshot(name) {
    await js("document.getElementById('toast').hidden=true"); await delay(100);
    await fs.writeFile(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG()); screenshots.push(name + '.png');
  }
  async function load(fixture) {
    await store.save(fixture);
    await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.reload(); }); await ready();
  }
  const { emptyState, at, startWork, stopWork, clockOut, addBreak, dayStats, monthlyReport, saveMonthlyReview } = await import(pathToFileURL(path.join(root, 'src/model.mjs')).href);
  const key = '2026-11-03';
  function fixture(time = '11:00', date = key) {
    const s = emptyState(new Date(at(date, '08:00'))); s.onboarded = true;
    s.settings.salary = 17600; s.settings.payDays = 22;
    // A future wall anchor intentionally freezes this fictional clock for exact assertions.
    s.demo = { time: at(date, time), wall: Date.now() + 3600000 }; return s;
  }
  async function report(status, error) {
    await fs.writeFile(path.join(output, 'correction-results.json'), JSON.stringify({ status, error, checks, screenshots, consoleErrors: errors, platform: process.platform, arch: process.arch, macOS: process.getSystemVersion(), electron: process.versions.electron, appPath: app.getAppPath(), data: 'isolated fictional fixtures only; source development run, no new installer' }, null, 2));
  }
  try {
    await ready();
    let s = fixture(); startWork(s, at(key, '10:30')); addBreak(s, { date:key, minutes:20, name:'喝点水' }, at(key, '11:00'));
    await load(s);
    assert.match(await text('recorded-start'), /今日上班 10:30/); assert.equal(await text('countdown'), '07:00:00');
    await screenshot('01-late-clock-in'); await click('correct-start');
    assert.equal(await js("document.getElementById('correction-dialog').open"), true);
    assert.equal(await js("document.getElementById('correction-time').value"), '09:00');
    assert.equal(await text('correction-before-earned'), '¥50.00'); assert.equal(await text('correction-after-earned'), '¥200.00');
    assert.equal(await text('correction-before-worked'), '00:30:00'); assert.equal(await text('correction-after-worked'), '02:00:00');
    await screenshot('02-correction-preview'); await submit(); await saved();
    let stored = (await store.load()).state;
    assert.equal(stored.days[key].sessions[0].start, at(key, '09:00')); assert.equal(stored.days[key].sessions.length, 1);
    assert.equal(stored.days[key].breaks.length, 1); assert.equal(stored.days[key].startCorrections[0].from, at(key, '10:30'));
    assert.match(await text('recorded-start'), /09:00/); assert.equal(await text('countdown'), '07:00:00');
    assert.equal(await text('hero-amount'), '200.00'); await screenshot('03-corrected-dashboard');
    checks.push('actual click opens suggested scheduled start; preview and persisted result are exact; countdown unchanged; fish and one session preserved');

    await click('correct-start'); await change('correction-time', '10:50');
    assert.match(await text('correction-error'), /少于已记.*摸鱼/); assert.equal(await js("document.getElementById('correction-save').disabled"), true);
    await screenshot('04-fish-capacity-validation'); await change('correction-time', '11:01');
    assert.match(await text('correction-error'), /晚于现在/); await click('correction-cancel');
    assert.equal((await store.load()).state.days[key].startCorrections.length, 1);
    checks.push('shorter-than-fish and future entries blocked; cancel leaves original persisted record intact');

    await click('correct-start'); await change('correction-time', '09:15');
    const originalSave = store.save;
    try {
      store.save = async () => { throw Error('DIAGNOSTIC_WRITE_REJECTED'); };
      await submit(); await until("document.getElementById('correction-error').textContent.includes('DIAGNOSTIC_WRITE_REJECTED')", 'save rejection visible');
      assert.equal(await js("document.getElementById('correction-dialog').open"), true);
      assert.match(await text('recorded-start'), /09:00/); assert.equal((await store.load()).state.days[key].sessions[0].start, at(key, '09:00'));
    } finally { store.save = originalSave; }
    await submit(); await saved();
    assert.equal((await store.load()).state.days[key].sessions[0].start, at(key, '09:15'));
    await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.reload(); }); await ready();
    assert.match(await text('recorded-start'), /09:15/); assert.equal((await store.load()).state.days[key].startCorrections.length, 2);
    checks.push('simulated disk rejection keeps modal, old UI and disk state; successful retry and reload retain both original timestamps');

    s = fixture('20:00'); startWork(s, at(key, '10:00')); stopWork(s, at(key, '11:00')); startWork(s, at(key, '14:00')); clockOut(s, at(key, '18:00'));
    saveMonthlyReview(s, monthlyReport(s, '2026-11', at(key, '19:00')), true); await load(s);
    await click('open-calendar'); await js("document.querySelector('[data-calendar-date=\"2026-11-03\"]').click()"); await click('calendar-correct-start');
    await change('correction-session', '1', 'change'); await change('correction-time', '13:00'); await submit(); await saved();
    stored = (await store.load()).state;
    assert.equal(stored.days[key].sessions[0].start, at(key, '10:00')); assert.equal(stored.days[key].sessions[1].start, at(key, '13:00'));
    assert.equal(stored.days[key].summary.earned, 600); assert.equal(stored.days[key].summary.clockOutAt, at(key, '18:00')); assert.equal(stored.days[key].summary.status, 'ontime');
    assert.equal(stored.monthlyReviews.snapshots['2026-11'].earned, 600); assert.equal(stored.monthlyReviews.snapshots['2026-11'].asOf, at(key, '19:00'));
    assert.equal(stored.monthlyReviews.shown['2026-11'], at(key, '19:00'));
    assert.equal(await text('calendar-detail-earned'), '¥600.00'); assert.match(await text('calendar-detail-snapshot'), /修正后重算/); await screenshot('05-corrected-calendar');
    await js("document.querySelector('[data-close=calendar-detail-dialog]').click();document.querySelector('[data-close=calendar-dialog]').click()");
    await click('show-summary'); assert.equal(await text('summary-earned'), '¥600.00'); assert.match(await text('summary-note'), /修正.*重算/); await screenshot('06-corrected-summary');
    await js("document.querySelector('[data-close=summary-dialog]').click()"); await click('open-calendar'); await click('calendar-report');
    assert.equal(await text('report-earned'), '¥600.00'); assert.match(await text('report-ontime'), /1 天/); await screenshot('07-corrected-monthly-report');
    checks.push('selected resumed segment corrected through calendar; details, summary and saved report restated once with cutoff/delivered flags and clock-out preserved');

    s = fixture(); startWork(s, at(key, '10:30')); s.display = 'hidden'; await load(s); await click('correct-start');
    for (const id of ['correction-before-earned', 'correction-after-earned', 'correction-delta']) assert.ok(!/¥|￥|50\.00|200\.00/.test(await text(id)));
    await screenshot('08-private-correction'); checks.push('privacy mode conceals both preview amounts and monetary delta');

    s = fixture('10:00', '2026-10-30'); startWork(s, at('2026-10-30', '10:00')); s.demo.time = at('2026-11-01', '01:00'); await load(s);
    assert.match(await text('recorded-start'), /10\/30 上班/); await click('correct-start'); assert.match(await text('correction-date'), /2026-10-30/);
    await screenshot('09-overnight-correction'); await submit(); await saved(); stored = (await store.load()).state;
    assert.equal(stored.days['2026-10-30'].sessions[0].start, at('2026-10-30', '09:00')); assert.deepEqual(Object.keys(stored.days), ['2026-10-30']);
    assert.equal(dayStats(stored, '2026-10-30', at('2026-11-01', '01:00')).earned, 800);
    checks.push('overnight entry identifies original date; correction keeps capped wages in original month without creating a new-day record');

    s = fixture(); startWork(s, at(key, '10:30')); await load(s); win.setSize(760, 650); await delay(200); await js('window.scrollTo(0,0)');
    const layout = await js("(() => { const card=document.querySelector('.shift-card').getBoundingClientRect(),row=document.querySelector('.recorded-start-row').getBoundingClientRect(),button=document.getElementById('correct-start').getBoundingClientRect();return { card:{x:card.x,right:card.right,bottom:card.bottom},row:{x:row.x,right:row.right,bottom:row.bottom},button:{x:button.x,right:button.right,bottom:button.bottom},viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth }; })()");
    assert.ok(layout.row.x >= layout.card.x && layout.row.right <= layout.card.right && layout.row.bottom <= layout.card.bottom);
    assert.ok(layout.button.right <= layout.card.right); assert.equal(layout.overflow, false); await screenshot('10-compact-correction-entry');
    await click('correct-start'); await screenshot('11-compact-correction-dialog');
    checks.push('760×650 source window: entry stays within countdown card without horizontal overflow; correction dialog scrolls within window');
    assert.deepEqual(errors, []); await report('passed');
  } catch (error) { await report('failed', error.stack); throw error; }
};

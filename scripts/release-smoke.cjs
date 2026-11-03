const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

exports.run = async context => {
  const { app, win, store } = context;
  const output = process.env.WORKDAY_EVIDENCE_DIR;
  assert.ok(output && process.env.WORKDAY_DATA_DIR, 'Explicit isolated paths are required');
  await fs.mkdir(output, { recursive: true });
  const phases = [];
  try {
    assert.equal(app.isPackaged, true);
    assert.equal(app.getVersion(), '0.3.0');
    assert.ok(app.getAppPath().endsWith('app.asar'));
    assert.equal((await store.load()).state, null, 'A fresh test profile must be empty');
    app.focus({ steal: true }); win.show(); win.focus();
    const requested = process.env.WORKDAY_RELEASE_PHASES?.split(',');
    for (const [name, script, count] of [['full', './smoke.cjs', 32], ['attendance', './attendance-smoke.cjs', 6], ['correction', './correction-smoke.cjs', 7], ['iteration', './iteration-smoke.cjs', 8]]) {
      if (requested && !requested.includes(name)) continue;
      process.env.WORKDAY_EVIDENCE_DIR = path.join(output, name);
      await fs.mkdir(process.env.WORKDAY_EVIDENCE_DIR, { recursive: true });
      app.focus({ steal: true }); win.show(); win.focus();
      await require(script).run(context);
      phases.push({ name, expectedGroups: count, status: 'passed' });
    }
    const result = { status: 'passed', version: app.getVersion(), packaged: app.isPackaged, arch: process.arch, translated: app.runningUnderARM64Translation, macOS: process.getSystemVersion(), electron: process.versions.electron, launch: process.env.WORKDAY_LAUNCH_ROUTE, phases, data: 'fresh temporary profile; fictional data only', physicalFinderDoubleClick: 'not-run', physicalStatusBarClick: 'not-run', timestamp: new Date().toISOString() };
    await fs.writeFile(path.join(output, 'release-results.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
  } catch (error) {
    await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ status: 'failed', error: error.stack, phases }, null, 2) + '\n');
    throw error;
  } finally { process.env.WORKDAY_EVIDENCE_DIR = output; }
};

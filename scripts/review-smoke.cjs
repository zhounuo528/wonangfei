const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

exports.run = async ({ app, win, store, root }) => {
  const evidence = process.env.WORKDAY_EVIDENCE_DIR;
  await fs.mkdir(evidence, { recursive: true });
  const checks = [], errors = [];
  const js = code => win.webContents.executeJavaScript(code);
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  async function until(code, label) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) { if (await js(code)) return; await delay(80); }
    throw Error(`超时：${label}`);
  }
  const click = id => js(`document.getElementById(${JSON.stringify(id)}).click()`);
  const value = (id, value) => js(`(() => { const el = document.getElementById(${JSON.stringify(id)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  async function saved() { await until("document.getElementById('save-status').textContent === '已保存在本机'", '保存'); await store.tail; }
  async function capture(name) {
    await js("document.getElementById('toast').hidden = true; window.scrollTo(0,0)");
    await until("[...document.querySelectorAll('.state-mascot')].every(i=>i.complete && i.naturalWidth>0)", '角色素材加载');
    await delay(120);
    await fs.writeFile(path.join(evidence, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  }
  const { demoState, at, getDay } = await import(pathToFileURL(path.join(root, 'src/model.mjs')).href);
  const key = '2026-11-03';
  async function reset(fixture) {
    await store.save(fixture);
    await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.reload(); });
    await until("document.documentElement.dataset.ready === 'true'", '场景就绪');
  }
  await until("document.documentElement.dataset.ready === 'true'", '首次就绪');
  win.setSize(1220, 930);
  await reset(demoState());
  assert.equal(await js("document.querySelector('.hero-art').dataset.mood"), 'happy');
  await capture('25-cat-happy-desktop');
  const layout = await js(`(() => {
    const r=s=>document.querySelector(s).getBoundingClientRect();
    const fixed=r('.fixed-overview-card'), goal=r('.goal-card'), fish=r('.fish-card'), quick=r('.quick-card'), purchase=r('.purchase-card'), hero=r('.hero'), amount=r('.hero-value strong'), cat=r('.hero-art');
    return { fixedBottom:fixed.bottom, goalTop:goal.top, goalBottom:goal.bottom, fishBottom:fish.bottom, quickBottom:quick.bottom, purchaseHeight:purchase.height, bottom:purchase.bottom, viewport:innerHeight, overflow:document.documentElement.scrollWidth>innerWidth, catAmountOverlap:!(cat.left>=amount.right||cat.right<=amount.left||cat.top>=amount.bottom||cat.bottom<=amount.top), heroHeight:hero.height };
  })()`);
  assert.ok(layout.goalTop >= layout.fixedBottom && layout.goalTop - layout.fixedBottom < 16);
  assert.ok(Math.abs(layout.goalBottom-layout.fishBottom)<2 && Math.abs(layout.quickBottom-layout.fishBottom)<2);
  assert.ok(layout.purchaseHeight < 100 && !layout.overflow);
  assert.equal(layout.catAmountOverlap,false,'角色不遮挡主金额');
  checks.push({ name:'1220px 布局：固定负担下接目标，花销和摸鱼同高，底部换算横条小于100px，无横向溢出', layout });
  let fixture = demoState(); fixture.demo = { time: at(key, '09:00'), wall: Date.now() }; fixture.days[key].breaks = [];
  await reset(fixture);
  assert.equal(await js("document.querySelector('.hero-art').dataset.mood"), 'anxious');
  await capture('26-cat-anxious-desktop');
  await click('mini'); await until("document.body.classList.contains('mini-mode')", '迷你');
  const miniLayout = await js("(() => {const a=document.getElementById('mini-amount').getBoundingClientRect(),c=document.getElementById('mini-countdown').getBoundingClientRect(); return { amountRight:a.right,countdownLeft:c.left,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,cat:document.querySelector('.mini-mascot').dataset.mood};})()");
  assert.ok(miniLayout.amountRight <= miniLayout.countdownLeft && !miniLayout.overflow); assert.equal(miniLayout.cat, 'anxious');
  await capture('27-cat-anxious-mini');
  await click('mini-fish');
  assert.ok(await js("document.getElementById('break-dialog').getBoundingClientRect().height<=innerHeight-10"));
  await js("document.querySelector('[data-close=break-dialog]').click()");
  await value('mini-display', 'hidden'); await saved();
  assert.equal(await js("document.querySelector('.mini-mascot').dataset.mood"), 'private');
  assert.ok(!(await js('document.body.classList.contains("net-uncovered")')));
  await capture('28-cat-private-mini');
  const hiddenNegative = await js("document.querySelector('.mini-mascot').getAttribute('src')");
  await click('expand'); await until("!document.body.classList.contains('mini-mode')", '展开');
  fixture = demoState(); fixture.display = 'hidden'; await reset(fixture);
  assert.equal(await js("document.querySelector('.hero-art').getAttribute('src')"), hiddenNegative);
  checks.push({ name:'同一猫咪在负数/正数呈焦虑/开心；迷你可见且金额与倒计时横排；隐藏金额固定表情、清除负数氛围', miniLayout });
  fixture = demoState(); fixture.demo = { time: at(key, '09:00'), wall: Date.now() }; fixture.days[key].breaks = []; fixture.expenses = []; fixture.fixed = [{...fixture.fixed[0], amount:0.9}];
  await reset(fixture); assert.equal(await js("document.querySelector('.hero-art').dataset.mood"), 'anxious');
  await until("document.querySelector('.hero-art').dataset.mood === 'happy'", '跨零开心');
  assert.equal(await js("document.querySelector('#display-mode option:checked').textContent"), '今日已赚');
  checks.push({ name:'实际时间戳跨零时金额标题、红色状态和猫咪表情同步切换' });
  fixture = demoState(); fixture.settings.salary = 120000; fixture.days[key].settings.salary = 120000; await reset(fixture);
  const frames = await js(`new Promise(resolve=>{let count=0,mismatch=0;const stop=performance.now()+800;function step(){const a=document.getElementById('hero-amount').textContent.replaceAll(',',''),b=document.getElementById('sum-net').textContent.replace(/[^0-9.-]/g,'');if(Number(a)!==Number(b))mismatch++;count++;if(performance.now()<stop)requestAnimationFrame(step);else resolve({count,mismatch});}requestAnimationFrame(step);})`);
  assert.ok(frames.count>5); assert.equal(frames.mismatch, 0);
  checks.push({ name:'高薪虚拟数据逐帧检查，主金额与下方净赚在分钱边界一致', frames });
  // A reminder save can complete after the user hides the window. It must queue for return.
  fixture = demoState(); fixture.reminder = {enabled:true,enabledAt:at(key,'09:00'),delivered:{}}; fixture.demo={time:at(key,'18:00'),wall:Date.now()};
  const originalSave = store.save.bind(store); let release, entered = false;
  const gate = new Promise(resolve => { release=resolve; });
  store.save = async state => { if (state.reminder?.delivered[key] && !entered) { entered=true; await gate; } return originalSave(state); };
  try {
    await reset(fixture);
    const deadline=Date.now()+10000; while (!entered && Date.now()<deadline) await delay(50); assert.ok(entered,'提醒进入保存');
    win.hide(); await until("document.documentElement.dataset.liveMode==='paused'",'隐藏暂停'); release(); await store.tail; await delay(250);
    assert.equal(await js("document.getElementById('reminder-dialog').open"),false);
    win.show(); await until("document.getElementById('reminder-dialog').open",'恢复显示待送提醒');
    await js("document.querySelector('[data-close=reminder-dialog]').click()");
    await delay(1100); assert.equal(await js("document.getElementById('reminder-dialog').open"),false);
  } finally { release(); store.save = originalSave; win.show(); }
  checks.push({ name:'下班提醒写盘期间隐藏窗口，恢复后实际弹出一次，不丢失、不重复' });
  fixture=demoState(); getDay(fixture,'2026-11-30',true).sessions.push({start:at('2026-11-30','09:00'),end:null}); fixture.demo={time:at('2026-11-30','18:05'),wall:Date.now()};
  let reportEntered=false, reportRelease; const reportGate=new Promise(resolve=>{reportRelease=resolve;});
  store.save=async state=>{if(state.monthlyReviews?.shown?.['2026-11']&&!reportEntered){reportEntered=true;await reportGate;}return originalSave(state);};
  try {
    await reset(fixture); const deadline=Date.now()+10000; while(!reportEntered&&Date.now()<deadline)await delay(50); assert.ok(reportEntered,'月报进入保存');
    win.hide(); await until("document.documentElement.dataset.liveMode==='paused'",'月报隐藏'); reportRelease(); await store.tail; await delay(250);
    assert.equal(await js("document.getElementById('monthly-dialog').open"),false);
    win.show(); await until("document.getElementById('monthly-dialog').open",'恢复待送月报');
    await js("document.querySelector('[data-close=monthly-dialog]').click()"); await delay(1100);
    assert.equal(await js("document.getElementById('monthly-dialog').open"),false);
  } finally {reportRelease();store.save=originalSave;win.show();}
  checks.push({name:'月报写盘期间隐藏窗口，恢复后实际显示一次，进行中口径保留'});
  fixture = demoState(); fixture.settings.weekdays=[]; fixture.days[key].settings.weekdays=[]; await reset(fixture);
  await js("document.querySelector('nav [data-view=expenses]').click()"); await click('add-fixed');
  await js("(()=>{const f=document.getElementById('fixed-form');f.elements.name.value='零工作日';f.elements.amount.value='100.00';f.requestSubmit();})()");
  const error=await js("document.getElementById('fixed-error').textContent"); assert.match(error,/工作日为 0/); assert.ok(!error.includes('自然日'));
  checks.push({ name:'零工作日固定费用表单明确拒绝，不再建议已取消的自然日分摊' });
  await js("document.querySelector('[data-close=fixed-dialog]').click()");
  fixture=demoState();fixture.settings.salary=17400;fixture.days[key].settings.salary=17400;await reset(fixture);
  const price = async input => js(`(()=>{const e=document.getElementById('purchase-amount');e.value=${JSON.stringify(input)};e.dispatchEvent(new Event('input'));return document.getElementById('purchase-time').textContent;})()`);
  assert.equal(await price('800.00'),'1 天'); assert.equal(await price('799.99'),'7 小时 59 分钟');
  assert.equal(await price('2000.00'),'约 2.5 天'); await capture('31-purchase-workdays');
  assert.equal(await price('1000000000.00'),'1,250,000 天');
  assert.ok(!await js('document.documentElement.scrollWidth>innerWidth'));
  checks.push({name:'消费换算器实际输入：一天临界值、大额、2.5个工作日；一天按排班扣午休的8小时计算'});
  // Narrow real window keeps the same readable type scale; lower content may scroll vertically.
  win.setSize(760,680); await reset(demoState()); await capture('29-cat-compact-760');
  assert.equal(await js('document.documentElement.scrollWidth>innerWidth'),false);
  const visibleControls = await js("['work-toggle','fish-toggle','display-mode'].every(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.width>25;})"); assert.ok(visibleControls);
  checks.push({ name:'760px 实际窗口无横向溢出，金额切换/上下班/摸鱼按钮保持可用，纵向允许滚动' });
  win.setSize(1220,930); await reset(demoState()); await click('mini'); await until("document.body.classList.contains('mini-mode')",'开心迷你'); await capture('30-cat-happy-mini');
  await click('expand'); await reset(demoState());
  assert.deepEqual(errors,[]);
  const result={timestamp:new Date().toISOString(),platform:process.platform,arch:process.arch,checks,unexpectedConsoleErrors:errors,data:'fictional-only',packaging:app.isPackaged?'packaged-asar':'source-run'};
  await fs.writeFile(path.join(evidence,'review-results.json'),JSON.stringify(result,null,2)); console.log(JSON.stringify(result,null,2));
};

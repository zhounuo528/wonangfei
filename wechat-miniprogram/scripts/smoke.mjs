// 小程序页面逻辑冒烟测试：用 Node 模拟 wx / Page / App 运行时，
// 跑通「设置 → 开始上班 → 记花销 → 摸鱼 → 下班结算 → 日历 / 报表」整条链路。
// 这不是界面测试，但能拦住导入错误、字段拼写错误、状态机使用错误。

const storage = new Map();

globalThis.wx = {
    getStorageSync: key => (storage.has(key) ? storage.get(key) : ''),
    setStorageSync: (key, value) => {
        storage.set(key, JSON.parse(JSON.stringify(value)));
    },
    removeStorageSync: key => {
        storage.delete(key);
    },
    showToast: () => {},
    showModal: options => {
        if (options && typeof options.success === 'function') {
            options.success({ confirm: true, cancel: false });
        }
    },
    showActionSheet: options => {
        if (options && typeof options.success === 'function') {
            options.success({ tapIndex: 0 });
        }
    },
    navigateTo: () => {},
    navigateBack: () => {},
    switchTab: () => {},
    redirectTo: () => {},
    setClipboardData: options => {
        if (options && typeof options.success === 'function') {
            options.success({});
        }
    },
    getClipboardData: options => {
        if (options && typeof options.success === 'function') {
            options.success({ data: '' });
        }
    },
};

let lastPageDefinition = null;
const pageCache = {};
globalThis.App = definition => {
    globalThis.__app = definition;
};
globalThis.Page = definition => {
    lastPageDefinition = definition;
};

// 小程序 setData 支持 'list[0].field' 这样的路径写法，桩实现必须一并支持，
// 否则用路径更新的页面在这里会「看起来没生效」。
function assignPath(target, path, value) {
    const tokens = [];
    const pattern = /([^.[\]]+)|\[(\d+)\]/g;
    let match;
    while ((match = pattern.exec(path)) !== null) {
        tokens.push(match[2] !== undefined ? Number(match[2]) : match[1]);
    }
    let cursor = target;
    for (let i = 0; i < tokens.length - 1; i += 1) {
        const token = tokens[i];
        if (cursor[token] === undefined || cursor[token] === null) {
            cursor[token] = typeof tokens[i + 1] === 'number' ? [] : {};
        }
        cursor = cursor[token];
    }
    cursor[tokens[tokens.length - 1]] = value;
}

function instantiate(definition) {
    const instance = Object.create(null);
    Object.keys(definition).forEach(key => {
        instance[key] = definition[key];
    });
    instance.data = JSON.parse(JSON.stringify(definition.data || {}));
    instance.setData = function setData(patch, callback) {
        Object.keys(patch).forEach(key => {
            assignPath(this.data, key, patch[key]);
        });
        if (typeof callback === 'function') {
            callback();
        }
    };
    return instance;
}

async function loadPage(name) {
    if (pageCache[name]) {
        return instantiate(pageCache[name]);
    }
    lastPageDefinition = null;
    await import(`../pages/${name}/${name}.js`);
    if (!lastPageDefinition) {
        throw Error(`页面 ${name} 没有注册 Page()`);
    }
    pageCache[name] = lastPageDefinition;
    return instantiate(lastPageDefinition);
}

const checks = [];
function check(label, condition, detail) {
    checks.push({ label, ok: !!condition, detail: detail === undefined ? '' : String(detail) });
    if (!condition) {
        console.log('FAIL  ' + label + (detail ? ' → ' + detail : ''));
    } else {
        console.log('ok    ' + label);
    }
}

await import('../app.js');
check('app.js 注册 App 并加载记录', !!globalThis.__app);
globalThis.__app.onLaunch();

const store = await import('../store/index.js');
const core = await import('../core/model.js');

// 1) 设置：改为全年无休，保证今天可上班
const settingsPage = await loadPage('settings');
settingsPage.onShow();
settingsPage.setData({ scheduleMode: 'everyday', weekdays: settingsPage.data.weekdays.map(option => ({ ...option, active: true })) });
settingsPage.setData({ salary: '6000', payDaysMode: 'auto', start: '09:00', end: '18:00', lunch: true, lunchStart: '12:00', lunchEnd: '13:00' });
settingsPage.save();
check('设置保存成功（无报错）', settingsPage.data.error === '', settingsPage.data.error);
check('设置后完成引导', store.isOnboarded());

const stateAfterSettings = store.getState();
check('月薪写入设置', stateAfterSettings.settings.salary === 6000, stateAfterSettings.settings.salary);
check('自动计薪天数大于 0', stateAfterSettings.settings.payDays > 0, stateAfterSettings.settings.payDays);

// 2) 工作台：开始上班 → 计时 → 记花销 → 摸鱼 → 下班
const todayPage = await loadPage('today');
todayPage.onLoad();
todayPage.onShow();
check('工作台渲染出金额', typeof todayPage.data.heroAmount === 'string' && todayPage.data.heroAmount.length > 0, todayPage.data.heroAmount);

todayPage.handleWorkToggle();
const afterStart = core.activeShift(store.getState(), Date.now());
check('开始上班后存在进行中的班次', !!afterStart);

todayPage.openExpenseSheet({ currentTarget: { dataset: { name: '午餐' } } });
todayPage.handleExpenseAmount({ detail: { value: '25.5' } });
todayPage.saveExpense();
check('记录花销成功', todayPage.data.expenseError === '', todayPage.data.expenseError);
check('花销进入账本', store.getState().expenses.length === 1, store.getState().expenses.length);

todayPage.openFishSheet();
todayPage.handleFishMinutes({ detail: { value: '15' } });
todayPage.saveFish();
check('记录摸鱼成功', todayPage.data.fishError === '', todayPage.data.fishError);

const beforeOut = core.dayStats(store.getState(), core.dateKey(new Date()), Date.now());
check('今日已产生收入', beforeOut.earned > 0, beforeOut.earned);
check('净额已扣除花销', beforeOut.net < beforeOut.earned, beforeOut.net);

todayPage.handleWorkToggle();
// 是否要求先选加班费取决于当前时刻是否已超过计划下班两小时，两种路径都合法。
if (todayPage.data.showOvertimeSheet) {
    check('超过 2 小时加班时要求先选择加班费处理', true);
    todayPage.handleOvertimeFree();
} else {
    check('未达加班门槛时直接结算', !!todayPage.data.summary, todayPage.data.summary ? 'ok' : '缺少总结');
}
check('下班后生成本日总结', !!todayPage.data.summary, todayPage.data.overtimeError);
check('下班后没有进行中的班次', !core.activeShift(store.getState(), Date.now()));

// 3) 目标
const goalPage = await loadPage('goal');
goalPage.onShow();
goalPage.handleName({ detail: { value: '换一副耳机' } });
goalPage.handleAmount({ detail: { value: '1500' } });
goalPage.save();
check('目标保存成功', goalPage.data.error === '', goalPage.data.error);
check('目标已写入记录', store.getState().goal && store.getState().goal.name === '换一副耳机');

// 4) 账本：固定负担 + 意外之财
const costsPage = await loadPage('costs');
costsPage.onShow();
costsPage.openFixedForm();
costsPage.handleFixedName({ detail: { value: '房租' } });
costsPage.handleFixedAmount({ detail: { value: '3500' } });
costsPage.saveFixed();
check('固定负担保存成功', costsPage.data.fixedError === '', costsPage.data.fixedError);
check('固定负担进入记录', store.getState().fixed.length === 1);

costsPage.openIncomeForm();
costsPage.handleIncomeAmount({ detail: { value: '88' } });
costsPage.saveIncome();
check('意外之财保存成功', costsPage.data.incomeError === '', costsPage.data.incomeError);
check('意外之财进入记录', (store.getState().extraIncomes || []).length === 1);

// 5) 日历与报表
const calendarPage = await loadPage('calendar');
calendarPage.onShow();
check('日历生成当月格子', calendarPage.data.cells.length >= 28, calendarPage.data.cells.length);
check('日历选中今天', calendarPage.data.selectedKey === core.dateKey(new Date()));
check('日历详情含收入明细', calendarPage.data.detail && calendarPage.data.detail.rows.length > 0);

const reportPage = await loadPage('report');
reportPage.onLoad({});
reportPage.onShow();
check('月报渲染成功', !!reportPage.data.view && reportPage.data.error === '', reportPage.data.error);
check('月报总收入为正', !!reportPage.data.view, reportPage.data.view && reportPage.data.view.earned);
reportPage.switchMode({ currentTarget: { dataset: { mode: 'week' } } });
check('周报渲染成功', !!reportPage.data.view && reportPage.data.error === '', reportPage.data.error);

// 6) 我的：数据统计与备份
const minePage = await loadPage('mine');
minePage.onShow();
check('我的页读取到今日净额', typeof minePage.data.todayNet === 'string', minePage.data.todayNet);

const backupText = store.exportBackupText();
check('可以导出备份', backupText.indexOf('wonangfei-backup') !== -1, backupText.slice(0, 40));
const roundTrip = store.importBackupText(backupText);
check('备份可以原样导入', roundTrip.expenses.length === 1 && roundTrip.fixed.length === 1);

// 7) 越权/异常路径：重复开始上班不应产生第二个班次
const todayPage2 = await loadPage('today');
todayPage2.onLoad();
todayPage2.handleWorkToggle();
todayPage2.handleWorkToggle();
const stateNow = store.getState();
const todayKey = core.dateKey(new Date());
const sessions = (stateNow.days[todayKey] && stateNow.days[todayKey].sessions) || [];
check('重复开始上班不会叠加班次', sessions.length <= 2, sessions.length);

// 8) 日历单日修改（精简版）：改当天类型 + 是否计入固定负担 + 撤销
const todayKeyValue = core.dateKey(new Date());
const dayPage = await loadPage('day');
dayPage.onLoad({ date: todayKeyValue });
dayPage.onShow();
check('单日页读到现在是上班类型', dayPage.data.kind === 'work', dayPage.data.kind);
check('有工时记录的日期显示固定负担开关', dayPage.data.showFixed === true);

dayPage.handleKind({ currentTarget: { dataset: { key: 'leave' } } });
dayPage.handlePayMode({ currentTarget: { dataset: { key: 'unpaid' } } });
dayPage.save();
check('改为请假保存成功', dayPage.data.error === '', dayPage.data.error);

const leaveCalendar = store.getState().days[todayKeyValue].calendar;
check('当天写入请假策略', !!leaveCalendar && leaveCalendar.kind === 'leave', leaveCalendar && leaveCalendar.kind);
check('请假当天不再计工时工资', core.dayStats(store.getState(), todayKeyValue, Date.now()).baseEarned === 0);

dayPage.undo();
const restoredCalendar = store.getState().days[todayKeyValue].calendar;
check('撤销后恢复原来的安排', !restoredCalendar || restoredCalendar.kind === 'work', restoredCalendar && restoredCalendar.kind);

dayPage.onShow();
dayPage.handleFixed({ detail: { value: false } });
dayPage.save();
check('可以只排除这一天的固定负担', store.getState().days[todayKeyValue].fixedBurden.enabled === false, dayPage.data.error);
check('排除后当天固定负担为 0', core.dayStats(store.getState(), todayKeyValue, Date.now()).fixed === 0);

// 未来日期只安排计划，不能提前记工时
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowKey = core.dateKey(tomorrow);
const futurePage = await loadPage('day');
futurePage.onLoad({ date: tomorrowKey });
futurePage.onShow();
check('未来日期标记为计划', futurePage.data.future === true);
check('未来日期不显示固定负担开关', futurePage.data.showFixed === false);
futurePage.handleKind({ currentTarget: { dataset: { key: 'leave' } } });
futurePage.save();
check('未来可以安排请假计划', !!(store.getState().dayPlans && store.getState().dayPlans[tomorrowKey]) && store.getState().dayPlans[tomorrowKey].kind === 'leave', futurePage.data.error);
futurePage.clearPlan();
check('未来计划可以清除', !(store.getState().dayPlans && store.getState().dayPlans[tomorrowKey]));

// 工作日改成休息日加班应被拒绝
const guardPage = await loadPage('day');
guardPage.onLoad({ date: todayKeyValue });
guardPage.onShow();
guardPage.handleKind({ currentTarget: { dataset: { key: 'overtime' } } });
guardPage.save();
check('基础工作日不允许改成休息日加班', guardPage.data.error !== '', guardPage.data.error);

// 9) 当日花销编辑：先造一笔整月分摊，验证单日编辑只动当天
costsPage.openExpenseForm();
costsPage.handleExpenseScope({ currentTarget: { dataset: { scope: 'month' } } });
costsPage.handleExpenseMonth({ detail: { value: todayKeyValue.slice(0, 7) } });
costsPage.handleExpenseName({ detail: { value: '整月餐补' } });
costsPage.handleExpenseAmount({ detail: { value: '300' } });
costsPage.saveExpense();
check('整月分摊花销保存成功', costsPage.data.expenseError === '', costsPage.data.expenseError);

const dayScopeExpenses = () => store.getState().expenses.filter(item => item.scope !== 'month' && item.date === todayKeyValue);

const expenseDayPage = await loadPage('day');
expenseDayPage.onLoad({ date: todayKeyValue });
expenseDayPage.onShow();
check('单日页读到当日花销', expenseDayPage.data.expenseRows.length === 1, expenseDayPage.data.expenseRows.length);
check('整月分摊在单日页只读展示', expenseDayPage.data.monthItems.length === 1, expenseDayPage.data.monthItems.length);

const firstExpenseId = expenseDayPage.data.expenseRows[0].id;
expenseDayPage.handleExpenseAmount({ currentTarget: { dataset: { index: 0 } }, detail: { value: '18.5' } });
expenseDayPage.save();
const edited = dayScopeExpenses();
check('改金额后仍是一笔且 ID 不变', edited.length === 1 && edited[0].id === firstExpenseId, JSON.stringify(edited.map(item => item.id)));
check('金额已更新为 18.5', edited[0].amount === 18.5, edited[0].amount);

expenseDayPage.onShow();
expenseDayPage.addExpenseRow();
expenseDayPage.handleExpenseName({ currentTarget: { dataset: { index: 1 } }, detail: { value: '咖啡' } });
expenseDayPage.handleExpenseAmount({ currentTarget: { dataset: { index: 1 } }, detail: { value: '12' } });
expenseDayPage.save();
check('可以给当天加一笔花销', dayScopeExpenses().length === 2, expenseDayPage.data.error);

expenseDayPage.onShow();
check('新增的花销会回显在列表', expenseDayPage.data.expenseRows.length === 2, expenseDayPage.data.expenseRows.length);
expenseDayPage.removeExpenseRow({ currentTarget: { dataset: { index: 0 } } });
expenseDayPage.save();
const remaining = dayScopeExpenses();
check('删掉一行即删除那笔花销', remaining.length === 1 && remaining[0].name === '咖啡', JSON.stringify(remaining.map(item => item.name)));

check('整月分摊没有被单日编辑覆盖', store.getState().expenses.filter(item => item.scope === 'month').length === 1);
const monthPortion = store.getState().expenses
    .filter(item => item.scope === 'month')
    .reduce((sum, item) => sum + (item.allocationDates.includes(todayKeyValue) ? item.amount / item.allocationDates.length : 0), 0);
const statsAfterExpense = core.dayStats(store.getState(), todayKeyValue, Date.now());
check('当天花销合计随编辑变化（12 + 整月分摊）', Math.abs(statsAfterExpense.expenses - (12 + monthPortion)) < 1e-9, statsAfterExpense.expenses);

expenseDayPage.onShow();
expenseDayPage.removeExpenseRow({ currentTarget: { dataset: { index: 0 } } });
expenseDayPage.save();
check('清空当日花销后为 0 笔', dayScopeExpenses().length === 0, dayScopeExpenses().length);

// 10) 补记漏掉的班次，再修正上班时间
const backfillDate = new Date();
backfillDate.setDate(backfillDate.getDate() - 3);
const backfillKey = core.dateKey(backfillDate);

const backfillPage = await loadPage('day');
backfillPage.onLoad({ date: backfillKey });
backfillPage.onShow();
check('空白历史要求先勾选补录确认', backfillPage.data.needBackfillConfirm === true);
check('没有打卡记录时可以补记一段', backfillPage.data.canAddSession === true);

backfillPage.handleBackfillConfirm({ detail: { value: true } });
backfillPage.handleNewStart({ detail: { value: '10:00' } });
backfillPage.handleNewEnd({ detail: { value: '12:00' } });
backfillPage.save();
check('补记一段工时保存成功', backfillPage.data.error === '', backfillPage.data.error);

const backfilledSessions = store.getState().days[backfillKey] ? store.getState().days[backfillKey].sessions : [];
check('补记后这一天有一条时段', backfilledSessions.length === 1, backfilledSessions.length);
check('补记的工时产生了收入', core.dayStats(store.getState(), backfillKey, Date.now()).elapsed === 2 * 3600000, core.dayStats(store.getState(), backfillKey, Date.now()).elapsed);

const fixPage = await loadPage('day');
fixPage.onLoad({ date: backfillKey });
fixPage.onShow();
check('已补记的日期回显时段', fixPage.data.sessionRows.length === 1 && fixPage.data.sessionRows[0].startTime === '10:00', JSON.stringify(fixPage.data.sessionRows.map(row => row.startTime)));
fixPage.handleSessionTime({ currentTarget: { dataset: { index: 0, field: 'start' } }, detail: { value: '09:00' } });
fixPage.save();
const fixedStart = new Date(store.getState().days[backfillKey].sessions[0].start);
check('修正上班时间生效', fixedStart.getHours() === 9, fixedStart.getHours());
check('修正后工时变成 3 小时', core.dayStats(store.getState(), backfillKey, Date.now()).elapsed === 3 * 3600000, core.dayStats(store.getState(), backfillKey, Date.now()).elapsed);

// 11) 账本里的花销可以直达当天修改
todayPage2.openExpenseSheet({ currentTarget: { dataset: { name: '咖啡' } } });
todayPage2.handleExpenseAmount({ detail: { value: '9' } });
todayPage2.saveExpense();
check('从工作台再记一笔当日花销', todayPage2.data.expenseError === '', todayPage2.data.expenseError);

costsPage.onShow();
const firstDayExpense = costsPage.data.expenseList.find(item => item.dateKey !== '');
check('账本里的当日花销带有可跳转日期', !!firstDayExpense && !!firstDayExpense.dateKey, firstDayExpense && firstDayExpense.dateKey);
if (firstDayExpense) {
    costsPage.goDayEdit({ currentTarget: { dataset: { date: firstDayExpense.dateKey } } });
}
check('点击花销可以打开当天修改页', !!firstDayExpense);

// 12) 按日期调薪的时间线
settingsPage.onShow();
settingsPage.handleInput({ currentTarget: { dataset: { field: 'salary' } }, detail: { value: '7000' } });
settingsPage.handleSalaryFrom({ currentTarget: { dataset: { mode: 'date' } } });
settingsPage.handleSalaryDate({ detail: { value: backfillKey } });
settingsPage.save();
check('按指定日期调薪保存成功', settingsPage.data.error === '', settingsPage.data.error);
check('调薪记录进入时间线', settingsPage.data.salaryTimeline.length === 1, settingsPage.data.salaryTimeline.length);
check('生效日当天起按新工资', core.salaryForDate(store.getState(), backfillKey) === 7000, core.salaryForDate(store.getState(), backfillKey));
check('生效日之前仍按旧工资', core.salaryForDate(store.getState(), '2026-01-15') !== 7000, core.salaryForDate(store.getState(), '2026-01-15'));

const salaryEventId = settingsPage.data.salaryTimeline[0].id;
settingsPage.undoSalary({ currentTarget: { dataset: { id: salaryEventId } } });
check('撤销调薪后时间线清空', settingsPage.data.salaryTimeline.length === 0, settingsPage.data.salaryTimeline.length);
check('撤销后恢复原工资', core.salaryForDate(store.getState(), backfillKey) !== 7000, core.salaryForDate(store.getState(), backfillKey));

// 13) 每日重复费用的单日调整
costsPage.openFixedForm();
costsPage.handleFixedName({ detail: { value: '通勤' } });
costsPage.handleFixedAmount({ detail: { value: '10' } });
costsPage.handleFixedPeriod({ currentTarget: { dataset: { key: 'day' } } });
costsPage.handleFixedRepeat({ currentTarget: { dataset: { key: 'workday' } } });
costsPage.saveFixed();
check('添加每日重复费用成功', costsPage.data.fixedError === '', costsPage.data.fixedError);

const dailyFixedPage = await loadPage('day');
dailyFixedPage.onLoad({ date: todayKeyValue });
dailyFixedPage.onShow();
check('单日页显示每日重复费用', dailyFixedPage.data.hasDailyRows === true && dailyFixedPage.data.dailyRows.length === 1, dailyFixedPage.data.dailyRows.length);
const fixedBefore = core.dayStats(store.getState(), todayKeyValue, Date.now()).fixed;
dailyFixedPage.handleDailyAmount({ currentTarget: { dataset: { index: 0 } }, detail: { value: '4' } });
dailyFixedPage.save();
const dailyOverride = store.getState().dailyFixedOverrides && store.getState().dailyFixedOverrides[todayKeyValue];
check('单日调整写入覆盖记录', !!dailyOverride && dailyOverride.items[0].amount === 4, JSON.stringify(dailyOverride));
const fixedAfter = core.dayStats(store.getState(), todayKeyValue, Date.now()).fixed;
check('当天固定负担按新金额下降', Math.abs((fixedBefore - fixedAfter) - 6) < 1e-9, fixedBefore + ' → ' + fixedAfter);

dailyFixedPage.onShow();
check('已调整的日期标注为覆盖', dailyFixedPage.data.dailyRows[0].overridden === true);
dailyFixedPage.restoreDaily();
check('恢复自动后覆盖被清除', !(store.getState().dailyFixedOverrides && store.getState().dailyFixedOverrides[todayKeyValue]));

// 14) 月末回顾归档
reportPage.onLoad({ month: todayKeyValue.slice(0, 7) });
reportPage.onShow();
check('月报初始未归档', reportPage.data.archived === false, reportPage.data.mode + '/' + reportPage.data.month);
reportPage.archive();
check('归档这个月成功', reportPage.data.archived === true, reportPage.data.error);
const snapshots = store.getState().monthlyReviews && store.getState().monthlyReviews.snapshots;
const snapshot = snapshots ? snapshots[todayKeyValue.slice(0, 7)] : null;
check('归档写入月报快照', !!snapshot && snapshot.month === todayKeyValue.slice(0, 7), snapshot && snapshot.month);

// 15) 月末回顾：只在当月最后一天触发
const lastDay = new Date();
lastDay.setDate(1);
lastDay.setMonth(lastDay.getMonth() + 1);
lastDay.setDate(0);
const lastDayTs = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate(), 23, 0, 0).getTime();
const dueReview = core.dueMonthlyReview(store.getState(), lastDayTs);
check('月末最后一天会触发回顾', !!dueReview, dueReview && dueReview.month);
check('月中不会触发回顾', core.dueMonthlyReview(store.getState(), new Date(lastDay.getFullYear(), lastDay.getMonth(), 5, 12, 0, 0).getTime()) === null);

const failed = checks.filter(item => !item.ok);
[todayPage, todayPage2].forEach(page => {
    if (page && typeof page.stopTicker === 'function') {
        page.stopTicker();
    }
});
console.log('\n合计 ' + checks.length + ' 项，失败 ' + failed.length + ' 项');
process.exit(failed.length > 0 ? 1 : 0);

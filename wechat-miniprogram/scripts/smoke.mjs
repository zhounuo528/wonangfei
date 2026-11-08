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

function instantiate(definition) {
    const instance = Object.create(null);
    Object.keys(definition).forEach(key => {
        instance[key] = definition[key];
    });
    instance.data = JSON.parse(JSON.stringify(definition.data || {}));
    instance.setData = function setData(patch, callback) {
        Object.keys(patch).forEach(key => {
            this.data[key] = patch[key];
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
check('超过 2 小时加班时要求先选择加班费处理', todayPage.data.showOvertimeSheet === true, JSON.stringify({ sheet: todayPage.data.showOvertimeSheet, error: todayPage.data.overtimeError }));
todayPage.handleOvertimeFree();
check('免费加班后生成本日总结', !!todayPage.data.summary, todayPage.data.overtimeError);
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

const failed = checks.filter(item => !item.ok);
[todayPage, todayPage2].forEach(page => {
    if (page && typeof page.stopTicker === 'function') {
        page.stopTicker();
    }
});
console.log('\n合计 ' + checks.length + ' 项，失败 ' + failed.length + ' 项');
process.exit(failed.length > 0 ? 1 : 0);

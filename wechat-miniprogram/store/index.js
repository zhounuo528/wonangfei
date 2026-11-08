// 小程序端的记录仓库：替换网页版的 IndexedDB。
// 语义保持：加载后按固定顺序迁移、校验、原子保存；任何写失败都回滚到上一个快照。
import {
    emptyState,
    validateState,
    migratePayDays,
    migrateGoal,
    migrateOvertimeExclusions,
    settle,
    settleGoal,
    clockNow,
    automaticAttendanceDue,
    reconcileAutomaticAttendance,
} from '../core/model.js';
import { serializeBackup, parseBackup } from '../core/backup.js';

const STORAGE_KEY = 'wonangfei-wechat-v1';

let current = null;
let lastSavedAt = 0;
let lastError = '';
let loadReport = null;

function readStorage() {
    try {
        return wx.getStorageSync(STORAGE_KEY) || null;
    } catch (error) {
        lastError = '读取本地记录失败：' + error.message;
        return null;
    }
}

function writeStorage(state) {
    try {
        wx.setStorageSync(STORAGE_KEY, state);
        lastSavedAt = Date.now();
        return true;
    } catch (error) {
        lastError = '保存失败：' + error.message + '（可能是存储空间不足）';
        return false;
    }
}

export function bootstrap() {
    if (current && loadReport) {
        return loadReport;
    }

    const stored = readStorage();
    const hasStored = stored !== null && typeof stored === 'object';
    let state = hasStored ? stored : emptyState();
    const report = {
        fresh: !hasStored,
        upgradedPayDays: false,
        upgradedGoal: false,
        error: '',
        preserved: false,
    };

    try {
        if (state.onboarded === undefined || state.onboarded === null) {
            state.onboarded = Object.keys(state.days || {}).length > 0;
        }
        if (!state.reminder) {
            state.reminder = { enabled: false, enabledAt: null, delivered: {} };
        }

        const initial = JSON.stringify(state);
        const stamp = clockNow(state).getTime();
        report.upgradedPayDays = migratePayDays(state, stamp);
        migrateOvertimeExclusions(state, stamp);
        settle(state, stamp);
        report.upgradedGoal = migrateGoal(state, stamp);
        settleGoal(state, stamp);
        validateState(state);

        if (JSON.stringify(state) !== initial) {
            writeStorage(state);
        }
        current = state;
    } catch (error) {
        // 读取失败时不覆盖原记录：保留原始存储，本次用空档案运行。
        report.error = '本地记录无法读取：' + error.message;
        report.preserved = hasStored;
        current = emptyState();
    }

    loadReport = report;
    return report;
}

export function getState() {
    if (!current) {
        bootstrap();
    }
    return current;
}

export function isOnboarded() {
    return !!getState().onboarded;
}

export function persist() {
    if (!current) {
        return false;
    }
    return writeStorage(current);
}

// 所有业务写入都走这里：成功才落盘，失败回滚内存状态。
export function apply(mutator) {
    if (!current) {
        bootstrap();
    }
    const snapshot = JSON.parse(JSON.stringify(current));
    try {
        const result = mutator(current);
        validateState(current);
        if (!writeStorage(current)) {
            throw Error(lastError || '本地保存失败，请检查存储空间');
        }
        return { ok: true, result };
    } catch (error) {
        current = snapshot;
        return { ok: false, error: error.message || '操作失败' };
    }
}

export function replaceState(nextState) {
    const migrated = nextState;
    migrated.onboarded = migrated.onboarded === true || Object.keys(migrated.days || {}).length > 0;
    if (!migrated.reminder) {
        migrated.reminder = { enabled: false, enabledAt: null, delivered: {} };
    }
    const stamp = clockNow(migrated).getTime();
    migratePayDays(migrated, stamp);
    migrateOvertimeExclusions(migrated, stamp);
    migrateGoal(migrated, stamp);
    settle(migrated, stamp);
    settleGoal(migrated, stamp);
    validateState(migrated);
    if (!writeStorage(migrated)) {
        throw Error(lastError || '保存失败');
    }
    current = migrated;
    loadReport = { fresh: false, upgradedPayDays: false, upgradedGoal: false, error: '', preserved: false };
    return current;
}

export function exportBackupText() {
    return serializeBackup(getState(), Date.now());
}

export function importBackupText(text) {
    const parsed = parseBackup(text);
    return replaceState(parsed);
}

export function clearAll() {
    try {
        wx.removeStorageSync(STORAGE_KEY);
    } catch (error) {
        throw Error('清空失败：' + error.message);
    }
    current = emptyState();
    writeStorage(current);
    loadReport = { fresh: true, upgradedPayDays: false, upgradedGoal: false, error: '', preserved: false };
    return current;
}

export function storageStatus() {
    return {
        savedAt: lastSavedAt,
        error: lastError,
    };
}

// 小程序没有后台常驻进程：每次进入前台时按时间戳补记自动考勤，
// 语义与网页版「重新打开后补记开启期间漏记的普通工作日」一致。
export function reconcileAttendance() {
    const state = getState();
    if (!state.automaticAttendance || state.automaticAttendance.enabled !== true) {
        return { skipped: true, created: [], closed: [], released: [] };
    }
    if (!automaticAttendanceDue(state, Date.now())) {
        return { skipped: true, created: [], closed: [], released: [] };
    }
    const result = apply(current => reconcileAutomaticAttendance(current, Date.now()));
    if (!result.ok) {
        return { skipped: false, created: [], closed: [], released: [], error: result.error };
    }
    return result.result;
}

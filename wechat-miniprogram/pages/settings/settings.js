import { getState, apply } from '../../store/index.js';
import {
    plannedPayDays,
    saveSettings,
    configureAutomaticAttendance,
    configureClockInReminder,
    salaryEvents,
    salaryForDate,
    undoSalaryChange,
    initialSalaryReference,
} from '../../core/model.js';
import { formatAmount } from '../../core/money.js';
import { todayKey, dateText } from '../../utils/format.js';

const SCHEDULE_MODES = [
    { key: 'double', label: '双休', hint: '默认周一至周五' },
    { key: 'single', label: '单休', hint: '默认周一至周六' },
    { key: 'alternating', label: '大小周', hint: '按基准周交替' },
    { key: '996', label: '996', hint: '默认周一至周六 09:00–21:00' },
    { key: 'everyday', label: '全年无休', hint: '每天都是工作日' },
];

const WEEKDAY_OPTIONS = [
    { value: 1, label: '一' },
    { value: 2, label: '二' },
    { value: 3, label: '三' },
    { value: 4, label: '四' },
    { value: 5, label: '五' },
    { value: 6, label: '六' },
    { value: 0, label: '日' },
];

function flagsOf(values) {
    const set = {};
    (values || []).forEach(value => { set[value] = true; });
    return WEEKDAY_OPTIONS.map(option => ({
        value: option.value,
        label: option.label,
        active: !!set[option.value],
    }));
}

Page({
    data: {
        scheduleModes: SCHEDULE_MODES,
        scheduleIndex: 0,
        scheduleMode: 'double',
        weekdays: flagsOf([1, 2, 3, 4, 5]),
        alternateWeekdays: flagsOf([1, 2, 3, 4, 5, 6]),
        anchorWeek: '',
        anchorKind: 'double',
        salary: '',
        payDays: '',
        payDaysMode: 'auto',
        start: '09:00',
        end: '18:00',
        lunch: true,
        lunchStart: '12:00',
        lunchEnd: '13:00',
        autoAttendance: false,
        clockInReminder: false,
        endReminder: false,
        onboarded: false,
        salaryFromMode: 'today',
        salaryFromDate: '',
        currentSalaryText: '—',
        salaryTimeline: [],
        error: '',
        message: '',
    },

    onShow() {
        this.load();
    },

    load() {
        const state = getState();
        const settings = state.settings;
        const today = todayKey();
        const index = SCHEDULE_MODES.findIndex(mode => mode.key === settings.scheduleMode);
        this.setData({
            scheduleIndex: index < 0 ? 0 : index,
            scheduleMode: settings.scheduleMode || 'double',
            weekdays: flagsOf(settings.weekdays),
            alternateWeekdays: flagsOf(settings.alternateWeekdays),
            anchorWeek: settings.anchorWeek || todayKey(),
            anchorKind: settings.anchorKind || 'double',
            salary: settings.salary ? String(settings.salary) : '',
            payDays: settings.payDays ? String(settings.payDays) : '',
            payDaysMode: settings.payDaysMode || 'auto',
            start: settings.start,
            end: settings.end,
            lunch: settings.lunch !== false,
            lunchStart: settings.lunchStart,
            lunchEnd: settings.lunchEnd,
            autoAttendance: !!(state.automaticAttendance && state.automaticAttendance.enabled),
            clockInReminder: !!(state.clockInReminder && state.clockInReminder.enabled),
            endReminder: !!(state.reminder && state.reminder.enabled),
            currentSalaryText: formatAmount(salaryForDate(state, today)) + ' / 月',
            salaryFromDate: this.data.salaryFromDate || today,
            salaryTimeline: salaryEvents(state).reverse().map(entry => ({
                id: entry.id,
                effectiveLabel: dateText(entry.effectiveDate),
                changeText: formatAmount(entry.fromSalary) + ' → ' + formatAmount(entry.salary),
                changedLabel: '改于 ' + dateText(new Date(entry.changedAt).toISOString().slice(0, 10)),
                canUndo: entry.source === 'dated-adjustment',
            })),
            onboarded: !!state.onboarded,
        });
    },

    handleScheduleMode(event) {
        const index = Number(event.detail.value);
        const mode = SCHEDULE_MODES[index];
        if (!mode) {
            return;
        }
        const patch = { scheduleIndex: index, scheduleMode: mode.key, error: '', message: '' };
        if (mode.key === 'double') {
            patch.weekdays = flagsOf([1, 2, 3, 4, 5]);
        } else if (mode.key === 'single') {
            patch.weekdays = flagsOf([1, 2, 3, 4, 5, 6]);
        } else if (mode.key === '996') {
            patch.weekdays = flagsOf([1, 2, 3, 4, 5, 6]);
            patch.start = '09:00';
            patch.end = '21:00';
        } else if (mode.key === 'everyday') {
            patch.weekdays = flagsOf([0, 1, 2, 3, 4, 5, 6]);
        }
        this.setData(patch);
    },

    toggleWeekday(event) {
        const value = Number(event.currentTarget.dataset.value);
        const next = this.data.weekdays.map(option => (
            option.value === value ? { ...option, active: !option.active } : option
        ));
        this.setData({ weekdays: next, error: '' });
    },

    toggleAlternateWeekday(event) {
        const value = Number(event.currentTarget.dataset.value);
        const next = this.data.alternateWeekdays.map(option => (
            option.value === value ? { ...option, active: !option.active } : option
        ));
        this.setData({ alternateWeekdays: next, error: '' });
    },

    handleAnchorWeek(event) {
        this.setData({ anchorWeek: event.detail.value, error: '' });
    },

    handleAnchorKind(event) {
        this.setData({ anchorKind: event.currentTarget.dataset.kind, error: '' });
    },

    handleInput(event) {
        const field = event.currentTarget.dataset.field;
        if (!field) {
            return;
        }
        const patch = { error: '', message: '' };
        patch[field] = event.detail.value;
        this.setData(patch);
    },

    handlePayDaysMode(event) {
        this.setData({ payDaysMode: event.currentTarget.dataset.mode, error: '' });
    },

    handleLunch(event) {
        this.setData({ lunch: event.detail.value, error: '' });
    },

    activeValues(flags) {
        return flags.filter(option => option.active).map(option => option.value);
    },

    buildInput() {
        const state = getState();
        const input = Object.assign({}, state.settings);
        delete input.calendarDate;
        delete input.calendarIsWorkday;

        input.salary = Number(this.data.salary);
        input.payDays = Number(this.data.payDays);
        input.payDaysMode = this.data.payDaysMode;
        input.scheduleMode = this.data.scheduleMode;
        input.weekdays = this.activeValues(this.data.weekdays);
        input.alternateWeekdays = this.activeValues(this.data.alternateWeekdays);
        input.anchorWeek = this.data.anchorWeek;
        input.anchorKind = this.data.anchorKind;
        input.start = this.data.start;
        input.end = this.data.end;
        input.lunch = this.data.lunch;
        input.lunchStart = this.data.lunchStart;
        input.lunchEnd = this.data.lunchEnd;

        if (input.payDaysMode === 'auto') {
            input.payDays = plannedPayDays(todayKey(), input);
        }
        return input;
    },

    handleSalaryFrom(event) {
        this.setData({ salaryFromMode: event.currentTarget.dataset.mode, error: '', message: '' });
    },

    handleSalaryDate(event) {
        this.setData({ salaryFromDate: event.detail.value, error: '' });
    },

    undoSalary(event) {
        const id = event.currentTarget.dataset.id;
        wx.showModal({
            title: '撤销这次调薪',
            content: '会按原来的工资重新计算生效日之后的日期，手动定价的日子保留。',
            confirmText: '撤销',
            confirmColor: '#d4380d',
            success: modal => {
                if (!modal.confirm) {
                    return;
                }
                const result = apply(state => undoSalaryChange(state, id, Date.now()));
                if (!result.ok) {
                    this.setData({ error: result.error, message: '' });
                    return;
                }
                this.setData({
                    error: '',
                    message: '已撤销这次调薪，重算 ' + result.result.affectedDates.length + ' 天。',
                });
                this.load();
            },
        });
    },

    save() {
        const input = this.buildInput();
        if (!Number.isFinite(input.salary) || input.salary < 0) {
            this.setData({ error: '月薪请填 0 到 10 亿之间的数字' });
            return;
        }
        if (this.data.salaryFromMode === 'date' && !this.data.salaryFromDate) {
            this.setData({ error: '请选择这次调薪的生效日期' });
            return;
        }

        const salaryFrom = this.data.salaryFromMode === 'tomorrow'
            ? 'tomorrow'
            : this.data.salaryFromMode === 'date'
                ? this.data.salaryFromDate
                : 'today';

        const state = getState();
        const legacy = initialSalaryReference(state);
        const willChange = Number(this.data.salary) !== salaryForDate(state, todayKey());
        if (legacy && legacy.source === 'legacy-reference' && willChange) {
            wx.showActionSheet({
                itemList: ['这是首次填写工资', '这是真的从零调薪'],
                success: res => {
                    this.doSave(input, salaryFrom, res.tapIndex === 0 ? 'initial' : 'actual-change');
                },
            });
            return;
        }

        this.doSave(input, salaryFrom, undefined);
    },

    doSave(input, salaryFrom, legacyChoice) {
        const result = apply(state => {
            const info = saveSettings(state, input, salaryFrom, Date.now(), legacyChoice ? { legacyChoice } : {});
            state.onboarded = true;
            return info;
        });

        if (!result.ok) {
            this.setData({ error: result.error, message: '' });
            return;
        }

        const info = result.result;
        const parts = [];
        if (info.initialized) {
            parts.push('工资已设置，从本月 1 日生效');
        } else if (info.changed) {
            parts.push('调薪已保存，' + dateText(info.effectiveDate) + '起生效');
            if (info.affectedDates && info.affectedDates.length > 0) {
                parts.push('重算 ' + info.affectedDates.length + ' 天');
            }
        } else {
            parts.push('已保存，工资没有变化');
        }
        if (info.protectedDates && info.protectedDates.length > 0) {
            parts.push(info.protectedDates.length + ' 天为手动定价，已保留');
        }

        this.setData({
            error: '',
            message: parts.join('；') + '。',
            payDays: String(input.payDays || this.data.payDays),
        });
        this.load();
        wx.showToast({ title: '设置已保存', icon: 'none' });
    },

    toggleAutoAttendance(event) {
        const enabled = event.detail.value;
        const result = apply(state => configureAutomaticAttendance(state, enabled, Date.now()));
        if (!result.ok) {
            this.setData({ autoAttendance: !enabled, error: result.error });
            wx.showToast({ title: result.error, icon: 'none' });
            return;
        }
        this.setData({ autoAttendance: enabled, error: '', message: enabled ? '自动上下班已开启，按排班补记普通工作日。' : '自动上下班已关闭。' });
    },

    toggleClockIn(event) {
        const enabled = event.detail.value;
        const result = apply(state => {
            configureClockInReminder(state, enabled, Date.now());
            return true;
        });
        if (!result.ok) {
            this.setData({ clockInReminder: !enabled, error: result.error });
            return;
        }
        this.setData({ clockInReminder: enabled });
    },

    toggleEndReminder(event) {
        const enabled = event.detail.value;
        const result = apply(state => {
            const now = Date.now();
            if (!state.reminder) {
                state.reminder = { enabled: false, enabledAt: null, delivered: {} };
            }
            if (enabled && !state.reminder.enabled) {
                state.reminder.enabledAt = now;
            }
            state.reminder.enabled = enabled;
            return true;
        });
        if (!result.ok) {
            this.setData({ endReminder: !enabled, error: result.error });
            return;
        }
        this.setData({ endReminder: enabled });
    },
});

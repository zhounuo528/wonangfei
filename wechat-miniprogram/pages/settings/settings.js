import { getState, apply } from '../../store/index.js';
import {
    plannedPayDays,
    saveSettings,
    configureAutomaticAttendance,
    configureClockInReminder,
    dateKey,
} from '../../core/model.js';
import { todayKey } from '../../utils/format.js';

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
        error: '',
        message: '',
    },

    onShow() {
        this.load();
    },

    load() {
        const state = getState();
        const settings = state.settings;
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

    save() {
        const today = todayKey();
        const input = this.buildInput();
        if (!Number.isFinite(input.salary) || input.salary < 0) {
            this.setData({ error: '月薪请填 0 到 10 亿之间的数字' });
            return;
        }

        const result = apply(state => {
            const info = saveSettings(state, input, 'today', Date.now());
            state.onboarded = true;
            return info;
        });

        if (!result.ok) {
            this.setData({ error: result.error, message: '' });
            return;
        }

        this.setData({
            error: '',
            message: '已保存，从今天起生效。已记录日期的工时和花销保持原样。',
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

import { getState } from '../../store/index.js';
import {
    dateKey,
    monthKey,
    dayStats,
    monthStats,
    calendarPolicy,
    isWorkday,
    isAbsent,
    attendanceStatus,
    activeSession,
} from '../../core/model.js';
import { formatCurrency } from '../../core/money.js';
import { duration, timeText, monthText, weekdayLabel, todayKey, shiftMonth, dateText } from '../../utils/format.js';

const KIND_TEXT = {
    work: '上班',
    overtime: '休息日加班',
    leave: '请假',
    swap: '调休',
    rest: '休息',
};

Page({
    data: {
        month: '',
        monthLabel: '',
        weekdayLabels: ['一', '二', '三', '四', '五', '六', '日'],
        cells: [],
        selectedKey: '',
        detail: null,
        monthSummary: null,
        legend: [
            { key: 'work', text: '计划上班', tone: 'tone-work' },
            { key: 'rest', text: '休息', tone: 'tone-rest' },
            { key: 'leave', text: '请假', tone: 'tone-leave' },
            { key: 'swap', text: '调休', tone: 'tone-swap' },
            { key: 'overtime', text: '休息日加班', tone: 'tone-overtime' },
        ],
    },

    onShow() {
        const state = getState();
        const month = this.data.month || monthKey(todayKey());
        const selected = this.data.selectedKey || todayKey();
        this.render(month, selected);
    },

    render(month, selectedKey) {
        const state = getState();
        const now = Date.now();
        const today = dateKey(new Date(now));
        const first = new Date(month + '-01T00:00:00');
        const leading = (first.getDay() + 6) % 7;
        const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();

        const cells = [];
        for (let i = 0; i < leading; i += 1) {
            cells.push({ id: 'blank-' + i, blank: true });
        }

        for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
            const key = month + '-' + (dayNumber < 10 ? '0' + dayNumber : String(dayNumber));
            const day = state.days[key];
            const policy = calendarPolicy(state, key);
            const settings = day && day.settings ? day.settings : (state.dayPlans && state.dayPlans[key] ? state.dayPlans[key].settings : state.settings);

            let planKind = policy && policy.kind ? policy.kind : (isWorkday(key, settings) ? 'work' : 'rest');
            if (isAbsent(policy)) {
                planKind = policy.kind;
            }

            const hasRecord = !!(day && day.sessions && day.sessions.length);
            const isFuture = key > today;
            let netText = '';
            let netNegative = false;

            if (hasRecord && !isFuture) {
                const stats = dayStats(state, key, now);
                const value = Math.round(stats.net);
                netText = String(value);
                netNegative = value < 0;
            }

            cells.push({
                id: key,
                blank: false,
                key,
                label: String(dayNumber),
                day: dayNumber,
                tone: 'tone-' + planKind,
                isToday: key === today,
                isSelected: key === selectedKey,
                isFuture,
                hasRecord,
                netText,
                netNegative,
            });
        }

        const detail = this.buildDetail(selectedKey, now, today);
        const monthStat = monthStats(state, month + '-01', now);

        this.setData({
            month,
            monthLabel: monthText(month),
            cells,
            selectedKey,
            detail,
            monthSummary: {
                net: formatCurrency(monthStat.net),
                earned: formatCurrency(monthStat.earned),
                costs: formatCurrency(monthStat.expenses + monthStat.fixed),
                workedDays: monthStat.workedDays,
                negative: monthStat.net < 0,
            },
        });
    },

    buildDetail(key, now, today) {
        const state = getState();
        const day = state.days[key];
        const policy = calendarPolicy(state, key);
        const settings = day && day.settings ? day.settings : (state.dayPlans && state.dayPlans[key] ? state.dayPlans[key].settings : state.settings);
        const status = attendanceStatus(state, key, now);
        const isFuture = key > today;

        const base = {
            key,
            dateLabel: dateText(key) + ' · ' + weekdayLabel(key),
            isToday: key === today,
            isFuture,
            planText: (KIND_TEXT[policy && policy.kind ? policy.kind : (isWorkday(key, settings) ? 'work' : 'rest')] || '休息'),
            planTime: settings.start + '–' + settings.end + (settings.lunch ? '（午休 ' + settings.lunchStart + '–' + settings.lunchEnd + '）' : ''),
            statusLabel: status ? status.label : '未记录',
            statusTone: !status ? '' : (status.status === 'working' ? 'pill-working' : (status.status === 'late' ? 'pill-late' : (isAbsent(policy) ? 'pill-absent' : ''))),
            startText: day && day.sessions.length ? timeText(day.sessions[0].start) : '—',
            endText: day && day.sessions.length ? timeText(Math.max.apply(null, day.sessions.map(session => session.end || session.start))) : '—',
            openSession: !!(day && activeSession(state, key, now)),
            note: '',
        };

        if (!day || !day.sessions || !day.sessions.length) {
            base.note = isFuture ? '未来的日子只管计划，不提前记工时。' : '这一天还没有上班记录，空白的不会补造。';
            base.rows = [];
            return base;
        }

        const stats = dayStats(state, key, now);
        base.rows = [
            { label: '总收入', value: formatCurrency(stats.earned) },
            { label: '工资与加班费', value: formatCurrency(stats.wageEarned) },
            { label: '意外之财', value: formatCurrency(stats.extraIncome) },
            { label: '临时花销', value: formatCurrency(stats.expenses) },
            { label: '固定负担', value: formatCurrency(stats.fixed) },
            { label: '当前净额', value: formatCurrency(stats.net), negative: stats.net < 0 },
            { label: '摸鱼总时长', value: duration(stats.fish) },
            { label: '累计加班', value: duration(stats.overtime) },
            { label: '有效工时', value: duration(stats.actual) },
            { label: '平均有效时薪', value: stats.hourly ? formatCurrency(stats.hourly) : '不可计算' },
        ];

        if (policy && policy.kind && policy.kind !== 'work') {
            base.note = '这一天被标记为「' + KIND_TEXT[policy.kind] + '」，工资按当日规则计算。';
        }
        return base;
    },

    handlePrevMonth() {
        const month = shiftMonth(this.data.month, -1);
        this.render(month, this.data.selectedKey);
    },

    handleNextMonth() {
        const month = shiftMonth(this.data.month, 1);
        this.render(month, this.data.selectedKey);
    },

    handleSelectDay(event) {
        const key = event.currentTarget.dataset.key;
        if (!key) {
            return;
        }
        this.render(this.data.month, key);
    },

    handleToday() {
        const today = todayKey();
        this.render(monthKey(today), today);
    },

    goDayEdit(event) {
        const key = event.currentTarget.dataset.key || this.data.selectedKey;
        if (!key) {
            return;
        }
        wx.navigateTo({
            url: '/pages/day/day?date=' + key,
            fail: () => {
                wx.showToast({ title: '修改页暂未开放', icon: 'none' });
            },
        });
    },

    goReport() {
        wx.navigateTo({ url: '/pages/report/report?month=' + this.data.month });
    },
});

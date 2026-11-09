import { getState, apply } from '../../store/index.js';
import { monthlyReport, weeklyReport, saveMonthlyReview, dateKey } from '../../core/model.js';
import { formatCurrency } from '../../core/money.js';
import { duration, monthText, dateText, shiftMonth, todayKey } from '../../utils/format.js';

function rateText(value) {
    return Number.isFinite(value) ? formatCurrency(value) : '不可计算';
}

Page({
    data: {
        mode: 'month',
        month: '',
        weekDate: '',
        view: null,
        empty: false,
        error: '',
        archived: false,
        archivedText: '',
    },

    onLoad(options) {
        const month = options && options.month ? options.month : todayKey().slice(0, 7);
        // 从月历带月份进来时，默认就落在月报上。
        this.setData({ month, weekDate: todayKey(), mode: 'month' });
    },

    onShow() {
        this.render();
    },

    render() {
        const state = getState();
        const now = Date.now();
        const today = dateKey(new Date(now));

        try {
            if (this.data.mode === 'month') {
                const report = monthlyReport(state, this.data.month, now);
                this.currentReport = report;
                const snapshot = state.monthlyReviews && state.monthlyReviews.snapshots
                    ? state.monthlyReviews.snapshots[this.data.month]
                    : null;
                this.setData({
                    view: this.buildView(report, 'month'),
                    empty: !(report.recorded || report.costs),
                    archived: !!snapshot,
                    archivedText: snapshot
                        ? '已归档 · ' + dateText(new Date(snapshot.asOf).toISOString().slice(0, 10))
                        : '',
                    error: '',
                });
                return;
            }
            const weekKey = this.data.weekDate > today ? today : this.data.weekDate;
            const report = weeklyReport(state, weekKey, now);
            this.currentReport = null;
            this.setData({
                weekDate: weekKey,
                view: this.buildView(report, 'week'),
                empty: !(report.recorded || report.costs),
                archived: false,
                archivedText: '',
                error: '',
            });
        } catch (error) {
            this.setData({ error: error.message, view: null });
        }
    },

    buildView(report, mode) {
        const comparison = report.comparison || null;
        return {
            title: mode === 'month' ? monthText(report.month) + ' 月报' : dateText(report.from) + ' – ' + dateText(report.through) + ' 周报',
            provisional: !!report.provisional,
            earned: formatCurrency(report.earned),
            wage: formatCurrency(report.wageEarned),
            extra: formatCurrency(report.extraIncome),
            overtimePay: formatCurrency(report.overtimePay),
            costs: formatCurrency(report.costs),
            net: formatCurrency(report.net),
            netNegative: report.net < 0,
            worked: duration(report.worked),
            actual: duration(report.actual),
            fish: duration(report.fish),
            fishEarned: report.fishEarned === null || report.fishEarned === undefined ? '不可计算' : formatCurrency(report.fishEarned),
            overtime: duration(report.overtime),
            daily: rateText(report.averageDaily),
            hourly: rateText(report.hourly),
            secondly: rateText(report.secondly),
            workedDays: report.workedDays || 0,
            ontimeDays: report.ontimeDays || 0,
            lateDays: report.lateDays || 0,
            earlyDays: report.earlyDays || 0,
            leaveDays: report.leaveDays || 0,
            swapDays: report.swapDays || 0,
            compareBaseline: comparison ? rateText(comparison.baseline.hourly) : '—',
            compareActual: comparison ? rateText(comparison.actual.hourly) : '—',
            compareRange: comparison
                ? '无加班时 ' + rateText(comparison.baseline.hourly) + ' · 实际 ' + rateText(comparison.actual.hourly)
                : '',
        };
    },

    switchMode(event) {
        this.setData({ mode: event.currentTarget.dataset.mode }, () => this.render());
    },

    archive() {
        const report = this.currentReport;
        if (!report) {
            return;
        }
        const result = apply(state => {
            saveMonthlyReview(state, report, false);
            return true;
        });
        if (!result.ok) {
            wx.showToast({ title: result.error, icon: 'none' });
            return;
        }
        wx.showToast({ title: '已归档这个月的回顾', icon: 'none' });
        this.render();
    },

    prevPeriod() {
        if (this.data.mode === 'month') {
            this.setData({ month: shiftMonth(this.data.month, -1) }, () => this.render());
            return;
        }
        const date = new Date(this.data.weekDate + 'T00:00:00');
        date.setDate(date.getDate() - 7);
        this.setData({ weekDate: dateKey(date) }, () => this.render());
    },

    nextPeriod() {
        const today = todayKey();
        if (this.data.mode === 'month') {
            const next = shiftMonth(this.data.month, 1);
            if (next > today.slice(0, 7)) {
                wx.showToast({ title: '还没到那个月', icon: 'none' });
                return;
            }
            this.setData({ month: next }, () => this.render());
            return;
        }
        const date = new Date(this.data.weekDate + 'T00:00:00');
        date.setDate(date.getDate() + 7);
        const key = dateKey(date);
        if (key > today) {
            wx.showToast({ title: '还没到那一周', icon: 'none' });
            return;
        }
        this.setData({ weekDate: key }, () => this.render());
    },

    handleWeekDate(event) {
        this.setData({ weekDate: event.detail.value }, () => this.render());
    },

    handleMonth(event) {
        this.setData({ month: event.detail.value }, () => this.render());
    },
});

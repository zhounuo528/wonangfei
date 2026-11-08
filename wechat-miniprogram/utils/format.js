// 视图格式化。所有展示用的时间、百分比、日期计算集中在这里，WXML 只做渲染。

export function duration(ms) {
    const seconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    const rest = seconds % 60;
    return [hours, minutes, rest].map(value => String(value).padStart(2, '0')).join(':');
}

export function shortDuration(ms) {
    const seconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    if (hours > 0) {
        return hours + ' 小时 ' + minutes + ' 分';
    }
    return minutes + ' 分';
}

export function timeText(stamp) {
    if (!Number.isFinite(stamp)) {
        return '—';
    }
    const date = new Date(stamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return hours + ':' + minutes;
}

export function dateText(key) {
    if (typeof key !== 'string' || key.length < 10) {
        return '—';
    }
    return key.slice(5).replace('-', ' 月 ') + ' 日';
}

export function monthText(month) {
    if (typeof month !== 'string' || month.length < 7) {
        return '—';
    }
    return Number(month.slice(0, 4)) + ' 年 ' + Number(month.slice(5, 7)) + ' 月';
}

export const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

export function weekdayLabel(key) {
    const date = new Date(key + 'T00:00:00');
    return Number.isNaN(date.getTime()) ? '' : '周' + WEEKDAY_LABELS[date.getDay()];
}

export function percentText(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return '—';
    }
    return Math.round(number * 100) + '%';
}

export function pad2(value) {
    return value < 10 ? '0' + String(value) : String(value);
}

export function hoursText(ms) {
    const hours = (Number(ms) || 0) / 3600000;
    return hours.toFixed(1) + ' 小时';
}

export function shiftMonth(month, delta) {
    const year = Number(month.slice(0, 4));
    const index = Number(month.slice(5, 7)) - 1 + delta;
    const date = new Date(year, index, 1);
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1);
}

export function todayKey() {
    const date = new Date();
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

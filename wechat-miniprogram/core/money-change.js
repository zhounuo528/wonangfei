// 金额变化的业务语义（纯计算，无 DOM）。
// 网页版同一文件还包含 DOM 上色方法；小程序由 WXML + WXSS 表达，故只保留语义判断。
import { roundedMoney } from './money.js';

// Presentation only: callers provide the business direction, never infer it
// from a positive amount (expenses are usually positive too).
export function changeMeaning(before, after, { polarity = 'higher', hidden = false } = {}) {
    if (hidden) {
        return { tone: 'hidden', direction: 'hidden', delta: null, loss: false };
    }
    if (!Number.isFinite(before) || !Number.isFinite(after)) {
        return { tone: 'unknown', direction: 'unknown', delta: null, loss: Number.isFinite(after) && roundedMoney(after) < 0 };
    }
    const delta = roundedMoney(roundedMoney(after) - roundedMoney(before));
    const direction = delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'same';
    const tone = delta === 0 ? 'same' : polarity === 'neutral' ? 'neutral' : (polarity === 'lower' ? delta < 0 : delta > 0) ? 'improved' : 'worsened';
    return { tone, direction, delta, loss: roundedMoney(after) < 0 };
}

export function changeText(meaning, moneyText, polarity = 'higher') {
    if (meaning.tone === 'hidden') {
        return '变化已隐藏';
    }
    if (meaning.tone === 'unknown') {
        return '暂无可比数据';
    }
    if (meaning.direction === 'same') {
        return '持平';
    }
    const up = meaning.direction === 'increase';
    const word = polarity === 'lower' ? (up ? '多花' : '少花') : (up ? '增加' : '减少');
    return (up ? '↑ ' : '↓ ') + word + ' ' + moneyText(Math.abs(meaning.delta));
}

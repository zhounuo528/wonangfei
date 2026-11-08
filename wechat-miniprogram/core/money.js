// 金额显示：两位小数、四舍五入（half-expand），不产生负零。
// 优先使用 Intl（与网页版完全一致）；缺少 Intl 的机型走等价的纯 JS 实现。

const hasIntl = (() => {
    try {
        return typeof Intl === 'object' && typeof Intl.NumberFormat === 'function';
    } catch (error) {
        return false;
    }
})();

let amountFormatter = null;
let currencyFormatter = null;
let decimalFormatter = null;

if (hasIntl) {
    try {
        decimalFormatter = new Intl.NumberFormat('en-US', {
            useGrouping: false,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        amountFormatter = new Intl.NumberFormat('zh-CN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        currencyFormatter = new Intl.NumberFormat('zh-CN', {
            style: 'currency',
            currency: 'CNY',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    } catch (error) {
        amountFormatter = null;
        currencyFormatter = null;
        decimalFormatter = null;
    }
}

function expandExponential(text) {
    const lower = String(text).toLowerCase();
    if (lower.indexOf('e') === -1) {
        return lower;
    }
    const parts = lower.split('e');
    const exponent = Number(parts[1]) || 0;
    const mantissa = parts[0];
    const negative = mantissa.charAt(0) === '-';
    const unsigned = negative ? mantissa.slice(1) : mantissa;
    const dot = unsigned.indexOf('.');
    const integerPart = dot === -1 ? unsigned : unsigned.slice(0, dot);
    const fractionPart = dot === -1 ? '' : unsigned.slice(dot + 1);
    const digits = integerPart + fractionPart;
    const pointIndex = integerPart.length + exponent;
    let plain;
    if (pointIndex <= 0) {
        plain = '0.' + '0'.repeat(-pointIndex) + digits;
    } else if (pointIndex >= digits.length) {
        plain = digits + '0'.repeat(pointIndex - digits.length);
    } else {
        plain = digits.slice(0, pointIndex) + '.' + digits.slice(pointIndex);
    }
    return negative ? '-' + plain : plain;
}

function roundHalfExpand(value) {
    const negative = value < 0;
    const plain = expandExponential(Math.abs(value));
    const parts = plain.split('.');
    const integerPart = parts[0] || '0';
    const fractionPart = parts[1] || '';
    const padded = (fractionPart + '000').slice(0, 3);
    const digits = integerPart.replace(/^0+(?=\d)/, '');
    let cents = Number(digits) * 100 + Number(padded.slice(0, 2));
    if (Number(padded.charAt(2)) >= 5) {
        cents += 1;
    }
    const result = cents / 100;
    if (result === 0) {
        return 0;
    }
    return negative ? -result : result;
}

function groupThousands(fixed) {
    const parts = fixed.split('.');
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.length > 1 ? integerPart + '.' + parts[1] : integerPart;
}

function fallbackAmount(value) {
    const rounded = roundHalfExpand(value);
    const negative = rounded < 0;
    const fixed = Math.abs(rounded).toFixed(2);
    return (negative ? '-' : '') + groupThousands(fixed);
}

export function roundedMoney(value) {
    if (!Number.isFinite(value)) {
        throw Error('无效金额');
    }
    const rounded = decimalFormatter
        ? Number(decimalFormatter.format(value))
        : roundHalfExpand(value);
    return rounded === 0 ? 0 : rounded;
}

export const formatAmount = value => (amountFormatter ? amountFormatter.format(roundedMoney(value)) : fallbackAmount(roundedMoney(value)));

export const formatCurrency = value => (currencyFormatter ? currencyFormatter.format(roundedMoney(value)) : '¥' + fallbackAmount(roundedMoney(value)));

export const belowCentPerSecond = value => value > 0 && value < 0.01;

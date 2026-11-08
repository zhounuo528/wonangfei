// 平台兼容层。
// 小程序的 JS 运行时并不保证提供 structuredClone、crypto.randomUUID，
// 部分机型也缺少 Array.prototype.at。核心计算模块（core/）按网页版原样复用，
// 由本文件在模块加载时补齐这些能力。

function installArrayAt() {
    if (typeof Array.prototype.at === 'function') {
        return;
    }
    Object.defineProperty(Array.prototype, 'at', {
        value: function at(index) {
            const length = this.length >>> 0;
            let pointer = Math.trunc(Number(index)) || 0;
            if (pointer < 0) {
                pointer += length;
            }
            if (pointer < 0 || pointer >= length) {
                return undefined;
            }
            return this[pointer];
        },
        writable: true,
        configurable: true,
    });
}

installArrayAt();

export function structuredClone(value) {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        const list = new Array(value.length);
        for (let i = 0; i < value.length; i += 1) {
            list[i] = structuredClone(value[i]);
        }
        return list;
    }
    if (value instanceof Date) {
        return new Date(value.getTime());
    }
    const copy = {};
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i += 1) {
        copy[keys[i]] = structuredClone(value[keys[i]]);
    }
    return copy;
}

let idCounter = 0;

export function createId() {
    const scope = typeof globalThis === 'undefined' ? null : globalThis;
    const crypto = scope && scope.crypto;
    if (crypto && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    idCounter = (idCounter + 1) % 1000000;
    const segment = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
    return 'id-' + Date.now().toString(36) + '-' + idCounter.toString(36) + '-' + segment() + segment();
}

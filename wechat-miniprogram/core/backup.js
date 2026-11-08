// 备份序列化与解析。
// 网页版用 TextEncoder + IndexedDB；小程序没有这两个能力，
// 因此这里保留相同的校验语义（16 MB 上限、格式兼容、旧摸鱼计时收尾），只替换底层实现。
import { validateState, clockNow } from './model.js';

export const BACKUP_FORMAT = 'wonangfei-backup';
export const MAX_BACKUP_BYTES = 16 * 1024 * 1024;

export function utf8ByteLength(text) {
    const value = String(text);
    let bytes = 0;
    for (let i = 0; i < value.length; i += 1) {
        const code = value.charCodeAt(i);
        if (code < 0x80) {
            bytes += 1;
        } else if (code < 0x800) {
            bytes += 2;
        } else if (code >= 0xd800 && code <= 0xdbff) {
            bytes += 4;
            i += 1;
        } else {
            bytes += 3;
        }
    }
    return bytes;
}

export function serializeBackup(state, exportedAt = Date.now()) {
    return JSON.stringify({
        format: BACKUP_FORMAT,
        exportedAt,
        source: 'wechat-miniprogram',
        state,
    });
}

export function parseBackup(json) {
    if (typeof json !== 'string' || json.trim() === '') {
        throw Error('备份内容为空');
    }
    if (utf8ByteLength(json) > MAX_BACKUP_BYTES) {
        throw Error('备份超过 16 MB');
    }
    const parsed = JSON.parse(json);
    const state = parsed && parsed.format === BACKUP_FORMAT ? parsed.state : parsed;
    validateState(state);
    const stamp = clockNow(state).getTime();
    for (const day of Object.values(state.days)) {
        for (const interval of day.fish) {
            if (interval.end === null) {
                interval.end = Math.max(interval.start, stamp);
            }
        }
    }
    return state;
}

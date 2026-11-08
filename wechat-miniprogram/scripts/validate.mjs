// 静态校验：小程序工程结构、JSON 合法性、WXML 结构与表达式、事件绑定是否落地。
import { readFileSync, existsSync, statSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const problems = [];
const warnings = [];

function read(relative) {
    return readFileSync(path.join(root, relative), 'utf8');
}

function fail(message) {
    problems.push(message);
}

function warn(message) {
    warnings.push(message);
}

// 1) JSON 合法性
const jsonFiles = ['app.json', 'project.config.json', 'sitemap.json'];
for (const dir of readdirSync(path.join(root, 'pages'))) {
    jsonFiles.push(`pages/${dir}/${dir}.json`);
}

const appConfig = JSON.parse(read('app.json'));
for (const file of jsonFiles) {
    try {
        JSON.parse(read(file));
    } catch (error) {
        fail(`${file} 不是严格 JSON：${error.message}`);
    }
}

// 2) 页面四件套与 tabBar
for (const page of appConfig.pages) {
    for (const extension of ['js', 'wxml', 'json']) {
        const file = `${page}.${extension}`;
        if (!existsSync(path.join(root, file))) {
            fail(`app.json 声明的页面缺少文件：${file}`);
        }
    }
}

for (const item of (appConfig.tabBar && appConfig.tabBar.list) || []) {
    if (!appConfig.pages.includes(item.pagePath)) {
        fail(`tabBar 页面未在 pages 中声明：${item.pagePath}`);
    }
    if (item.iconPath && !existsSync(path.join(root, item.iconPath))) {
        fail(`tabBar 图标不存在：${item.iconPath}`);
    }
}

if (!appConfig.lazyCodeLoading) {
    fail('app.json 缺少 lazyCodeLoading');
}

// 3) WXML：标签闭合 + 表达式合法性 + 事件绑定
const VOID_TAGS = new Set(['input', 'image', 'import', 'include', 'wxs']);

function checkWxml(page) {
    const file = `${page}.wxml`;
    const source = read(file);
    const stack = [];
    const tagPattern = /<\/?([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
    let match;
    while ((match = tagPattern.exec(source)) !== null) {
        const [raw, tag, , selfClose] = match;
        if (raw.startsWith('</')) {
            const open = stack.pop();
            if (open !== tag) {
                fail(`${file} 标签不匹配：期望 </${open}>，实际 </${tag}>`);
                return;
            }
        } else if (!selfClose && !VOID_TAGS.has(tag)) {
            stack.push(tag);
        }
    }
    if (stack.length > 0) {
        fail(`${file} 存在未闭合标签：${stack.join(' > ')}`);
    }

    const expressions = source.match(/\{\{[^}]*\}\}/g) || [];
    for (const expression of expressions) {
        if (expression.includes('?.')) {
            fail(`${file} 表达式不支持可选链：${expression}`);
        }
        if (expression.includes('??')) {
            fail(`${file} 表达式不支持空值合并：${expression}`);
        }
        if (expression.includes('=>')) {
            fail(`${file} 表达式不支持箭头函数：${expression}`);
        }
        if (/\bnew\s+[A-Z]/.test(expression)) {
            fail(`${file} 表达式不支持 new：${expression}`);
        }
    }

    const js = read(`${page}.js`);
    const handlers = new Set();
    const handlerPattern = /\b(?:bind|catch)(?::)?[a-zA-Z]+="([A-Za-z_$][\w$]*)"/g;
    let handlerMatch;
    while ((handlerMatch = handlerPattern.exec(source)) !== null) {
        handlers.add(handlerMatch[1]);
    }
    for (const handler of handlers) {
        const defined = new RegExp(`\\b${handler}\\s*\\(`).test(js) || new RegExp(`\\b${handler}\\s*:`).test(js);
        if (!defined) {
            fail(`${file} 绑定了不存在的方法：${handler}`);
        }
    }

    const loops = (source.match(/wx:for=/g) || []).length;
    const keys = (source.match(/wx:key=/g) || []).length;
    if (loops > keys) {
        warn(`${file} 有 ${loops - keys} 个 wx:for 缺少 wx:key`);
    }
}

for (const page of appConfig.pages) {
    checkWxml(page);
}

// 4) 平台能力越界检查
function walk(directory) {
    const entries = readdirSync(path.join(root, directory), { withFileTypes: true });
    for (const entry of entries) {
        const relative = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            walk(relative);
        } else if (entry.name.endsWith('.js')) {
            const source = read(relative);
            const forbidden = ['document.', 'window.', 'localStorage', 'indexedDB', 'requestAnimationFrame(', 'fetch('];
            for (const token of forbidden) {
                if (source.includes(token) && !relative.includes('tests')) {
                    fail(`${relative} 使用了小程序不支持的浏览器能力：${token}`);
                }
            }
        }
    }
}

walk('pages');
walk('utils');
walk('store');

// 5) 核心逻辑与网页版保持同源（仅允许兼容层替换）
const pairs = [
    ['model.js', 'model.mjs'],
    ['calendar.js', 'calendar.mjs'],
    ['extra-income.js', 'extra-income.mjs'],
    ['break-earnings.js', 'break-earnings.mjs'],
    ['work-equivalent.js', 'work-equivalent.mjs'],
    ['shift-clock.js', 'shift-clock.mjs'],
];

for (const [wechatFile, webFile] of pairs) {
    const wechatSource = read(`core/${wechatFile}`);
    const webPath = path.join(root, '..', 'web', 'src', webFile);
    if (!existsSync(webPath)) {
        warn(`找不到网页版源文件：web/src/${webFile}`);
        continue;
    }
    const webSource = readFileSync(webPath, 'utf8');
    const normalized = wechatSource
        .replace(/^\/\/ 与 web\/src\/model\.mjs 同源.*\n/m, '')
        .replace(/^import \{ structuredClone, createId \} from '\.\/compat\.js';\n/m, '')
        .replace(/^import \{ structuredClone \} from '\.\/compat\.js';\n/m, '')
        .replace(/export const uid = \(\) => createId\(\);/, 'export const uid = () => globalThis.crypto.randomUUID();')
        .replace(/\.js'/g, ".mjs'");
    if (normalized !== webSource) {
        const diffLines = countDiff(normalized, webSource);
        fail(`core/${wechatFile} 与 web/src/${webFile} 出现非兼容性差异（约 ${diffLines} 行）`);
    }
}

function countDiff(left, right) {
    const a = left.split('\n');
    const b = right.split('\n');
    let count = 0;
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i += 1) {
        if (a[i] !== b[i]) {
            count += 1;
        }
    }
    return count;
}

for (const warning of warnings) {
    console.log('WARN  ' + warning);
}
for (const problem of problems) {
    console.log('FAIL  ' + problem);
}
console.log(`\n静态校验：${problems.length} 个问题，${warnings.length} 个提示`);
process.exit(problems.length > 0 ? 1 : 0);

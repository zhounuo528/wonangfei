import { getState, exportBackupText, importBackupText, clearAll, storageStatus } from '../../store/index.js';
import { dateKey, dayStats, monthStats, goalStats } from '../../core/model.js';
import { formatCurrency } from '../../core/money.js';
import { monthText, pad2 } from '../../utils/format.js';

// 剪贴板属于微信隐私接口：未在后台「用户隐私保护指引」声明，或用户拒绝授权时，
// 真机上会直接失败（api scope is not declared / privacy），需要给出可执行的指引。
function isPrivacyBlocked(error) {
    const message = (error && (error.errMsg || error.message)) || '';
    return message.indexOf('privacy') !== -1 || message.indexOf('scope') !== -1 || message.indexOf('auth') !== -1;
}

function showPrivacyGuide(action) {
    wx.showModal({
        title: '需要剪贴板权限',
        content: action + '需要使用剪贴板。请点右上角「···」→「设置」，允许使用剪贴板后重试。',
        showCancel: false,
    });
}

Page({
    data: {
        todayNet: '0.00',
        todayNetNegative: false,
        monthNet: '0.00',
        monthLabel: '',
        goalName: '还没有目标',
        goalPercentText: '0%',
        recordedDays: 0,
        savedAtText: '尚未保存',
    },

    onShow() {
        this.refresh();
    },

    refresh() {
        const state = getState();
        const now = Date.now();
        const today = dateKey(new Date(now));
        const stats = dayStats(state, today, now);
        const month = monthStats(state, today, now);
        const goal = goalStats(state, now);

        this.setData({
            todayNet: formatCurrency(stats.net),
            todayNetNegative: stats.net < 0,
            monthNet: formatCurrency(month.net),
            monthLabel: monthText(today.slice(0, 7)),
            goalName: state.goal ? state.goal.name : '还没有目标',
            goalPercentText: state.goal ? Math.round(goal.progress * 100) + '%' : '未设置',
            recordedDays: Object.keys(state.days).filter(key => state.days[key].sessions && state.days[key].sessions.length > 0).length,
            savedAtText: this.savedText(),
        });
    },

    savedText() {
        const status = storageStatus();
        if (!status.savedAt) {
            return '记录保存在本机，不上传';
        }
        const date = new Date(status.savedAt);
        return '上次保存 ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes());
    },

    goGoal() {
        wx.navigateTo({ url: '/pages/goal/goal' });
    },

    goReport() {
        wx.navigateTo({ url: '/pages/report/report' });
    },

    goSettings() {
        wx.navigateTo({ url: '/pages/settings/settings' });
    },

    goCosts() {
        wx.switchTab({ url: '/pages/costs/costs' });
    },

    exportBackup() {
        try {
            const text = exportBackupText();
            wx.setClipboardData({
                data: text,
                success: () => {
                    wx.showModal({
                        title: '备份已复制',
                        content: '完整记录（明文 JSON）已复制到剪贴板，请粘贴到备忘录或发给自己保存。',
                        showCancel: false,
                    });
                },
                fail: error => {
                    if (isPrivacyBlocked(error)) {
                        showPrivacyGuide('导出备份');
                        return;
                    }
                    wx.showToast({ title: '复制失败，请重试', icon: 'none' });
                },
            });
        } catch (error) {
            wx.showToast({ title: '导出失败：' + error.message, icon: 'none' });
        }
    },

    importBackup() {
        wx.getClipboardData({
            success: res => {
                const text = res.data || '';
                if (text.trim() === '') {
                    wx.showToast({ title: '剪贴板为空', icon: 'none' });
                    return;
                }
                wx.showModal({
                    title: '导入备份',
                    content: '导入会替换本机现有记录，建议先导出一份当前备份。是否继续？',
                    confirmText: '导入',
                    confirmColor: '#d4380d',
                    success: modal => {
                        if (!modal.confirm) {
                            return;
                        }
                        try {
                            importBackupText(text);
                            wx.showToast({ title: '备份已导入', icon: 'none' });
                            this.refresh();
                        } catch (error) {
                            wx.showModal({
                                title: '导入失败',
                                content: error.message,
                                showCancel: false,
                            });
                        }
                    },
                });
            },
            fail: error => {
                if (isPrivacyBlocked(error)) {
                    showPrivacyGuide('导入备份');
                    return;
                }
                wx.showToast({ title: '读取剪贴板失败', icon: 'none' });
            },
        });
    },

    clearData() {
        wx.showModal({
            title: '清空本机记录',
            content: '会删除这台设备上的全部记录，且不可恢复。建议先导出备份。',
            confirmText: '清空',
            confirmColor: '#d4380d',
            success: modal => {
                if (!modal.confirm) {
                    return;
                }
                try {
                    clearAll();
                    wx.showToast({ title: '已清空', icon: 'none' });
                    this.refresh();
                } catch (error) {
                    wx.showToast({ title: error.message, icon: 'none' });
                }
            },
        });
    },

    showAbout() {
        wx.showModal({
            title: '关于窝囊费',
            content: '本地计薪、成本与摸鱼记录的小程序版。计算逻辑与网页版、桌面版同源，记录只保存在这台设备上。\n\n与网页版一样：关闭小程序后计时停止，重新打开按时间戳补记；未点「开始上班」的日期不会补造工资。',
            showCancel: false,
        });
    },
});

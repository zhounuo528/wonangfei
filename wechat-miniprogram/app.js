import { bootstrap } from './store/index.js';

App({
    globalData: {
        ready: false,
        loadError: '',
        upgradeNotice: '',
    },

    onLaunch() {
        const report = bootstrap();
        this.globalData.ready = !report.error;
        this.globalData.loadError = report.error;
        if (report.upgradedGoal) {
            this.globalData.upgradeNotice = '目标已升级：保留名称和金额，从今天开始积累。';
        } else if (report.upgradedPayDays) {
            this.globalData.upgradeNotice = '计薪天数已按当月考勤计算，已记录日期保持原口径。';
        }
        if (report.error) {
            wx.showModal({
                title: '本地记录读取失败',
                content: report.preserved
                    ? report.error + '\n\n原记录仍保留在本地，未做任何覆盖。'
                    : report.error,
                showCancel: false,
            });
        }
    },
});

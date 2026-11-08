import { getState, apply } from '../../store/index.js';
import { goalStats, saveGoal, settleGoal } from '../../core/model.js';
import { formatCurrency } from '../../core/money.js';

const STATUS_TEXT = {
    none: '还没有目标',
    legacy: '旧版目标，请重新设置',
    saving: '正在攒',
    ready: '可以结算了',
    done: '已完成',
};

Page({
    data: {
        hasGoal: false,
        name: '',
        amountText: '—',
        poolText: '0.00',
        remainingText: '—',
        percent: 0,
        statusText: '还没有目标',
        statusTone: '',
        settlements: [],
        formName: '',
        formAmount: '',
        error: '',
    },

    onShow() {
        this.refresh();
    },

    refresh() {
        const state = getState();
        const now = Date.now();
        const stats = goalStats(state, now);
        const goal = state.goal;

        const settlements = ((state.goalPool && state.goalPool.settlements) || [])
            .slice()
            .sort((left, right) => right.settledAt - left.settledAt)
            .slice(0, 5)
            .map(entry => ({
                id: entry.id,
                name: entry.name,
                amountText: formatCurrency(entry.amount),
                dateText: new Date(entry.settledAt).toISOString().slice(0, 10),
            }));

        this.setData({
            hasGoal: !!goal,
            name: goal ? goal.name : '还没有目标',
            amountText: goal ? formatCurrency(goal.amount) : '—',
            poolText: formatCurrency(stats.pool || 0),
            remainingText: goal ? formatCurrency(stats.remaining || 0) : '—',
            percent: goal ? Math.min(100, Math.round((stats.progress || 0) * 100)) : 0,
            statusText: STATUS_TEXT[stats.status] || '未设置',
            statusTone: stats.status === 'ready' ? 'pill-working' : (stats.status === 'done' ? 'pill-absent' : ''),
            settlements,
            formName: goal ? goal.name : this.data.formName,
            formAmount: goal ? String(goal.amount) : this.data.formAmount,
        });
    },

    handleName(event) {
        this.setData({ formName: event.detail.value, error: '' });
    },

    handleAmount(event) {
        this.setData({ formAmount: event.detail.value, error: '' });
    },

    save() {
        const name = String(this.data.formName || '').trim();
        const amount = Number(this.data.formAmount);
        if (name === '') {
            this.setData({ error: '给目标起个名字，例如「换一副耳机」' });
            return;
        }
        if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) {
            this.setData({ error: '目标金额需大于 0、至多 10 亿' });
            return;
        }

        const result = apply(state => {
            const goal = saveGoal(state, { name, amount: Math.round(amount * 100) / 100 }, Date.now());
            settleGoal(state, Date.now());
            return goal;
        });

        if (!result.ok) {
            this.setData({ error: result.error });
            return;
        }
        wx.showToast({ title: '目标已保存', icon: 'none' });
        this.refresh();
    },

    settle() {
        const result = apply(state => settleGoal(state, Date.now()));
        if (!result.ok) {
            wx.showToast({ title: result.error, icon: 'none' });
            return;
        }
        if (!result.result) {
            wx.showToast({ title: '还没攒够，继续加油', icon: 'none' });
            return;
        }
        wx.showModal({
            title: '目标拿下了！',
            content: '本次完成 ' + formatCurrency(result.result.amount) + '，剩余净赚会留给下一个目标。',
            showCancel: false,
        });
        this.refresh();
    },
});

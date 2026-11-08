export const EXTRA_INCOME_CATEGORIES = Object.freeze(['红包', '补贴', '奖金', '其他']);
export function extraIncomeForDate(state, key, now = Date.now()) {
  const today = new Date(now), through = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  if (key > through) return 0;
  return (state.extraIncomes ?? []).filter(entry => entry.date === key && entry.voidedAt === null).reduce((total, entry) => total + entry.amount, 0);
}
export function validateExtraIncomeLedger(state, isDateKey) {
  if (state.extraIncomes === undefined && state.extraIncomeAudit === undefined) return;
  if (state.version < 6) throw Error('意外之财需要新版记录格式，请使用新版应用');
  const finite = Number.isFinite;
  const valid = entry => !!entry && typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 100 && entry.source === 'manual-extra' && Number.isInteger(entry.revision) && entry.revision > 0
    && EXTRA_INCOME_CATEGORIES.includes(entry.category) && isDateKey(entry.date) && finite(entry.amount) && entry.amount > 0 && entry.amount <= 1e9
    && Math.abs(entry.amount - Math.round(entry.amount * 100) / 100) < 1e-8
    && typeof entry.note === 'string' && entry.note.length <= 120 && finite(entry.createdAt) && finite(entry.updatedAt) && (entry.voidedAt === null || finite(entry.voidedAt));
  if (!Array.isArray(state.extraIncomes) || state.extraIncomes.length > 10000 || state.extraIncomes.some(entry => !valid(entry)) || new Set(state.extraIncomes.map(entry => entry.id)).size !== state.extraIncomes.length) throw Error('意外之财记录无效');
  const ids = new Set(state.extraIncomes.map(entry => entry.id));
  if (Object.values(state.days ?? {}).some(day => (day.overtimeDecisions ?? []).some(fee => ids.has(fee.id)))) throw Error('意外之财与加班费来源重复');
  const audit = state.extraIncomeAudit;
  if (audit !== undefined && (!Array.isArray(audit) || audit.length > 50000 || new Set(audit.map(entry => entry?.id)).size !== audit.length || audit.some(entry => !entry || typeof entry.id !== 'string' || !ids.has(entry.incomeId) || !finite(entry.changedAt)
    || !['add','edit','void','restore','undo'].includes(entry.action)
    || entry.before !== null && (!valid(entry.before) || entry.before.id !== entry.incomeId)
    || !valid(entry.after) || entry.after.id !== entry.incomeId
    || entry.action === 'add' && entry.before !== null || entry.action !== 'add' && entry.before === null
    || entry.action === 'undo' && !audit.some(original => original.id === entry.undoOf && original.incomeId === entry.incomeId && original.action === 'edit')))) throw Error('意外之财修改历史无效');
}

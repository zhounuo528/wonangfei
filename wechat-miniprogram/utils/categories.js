// 花销分类只维护一份，工作台快捷记账与账本页共用，避免两处各写一套。
export const EXPENSE_QUICK = ['早餐', '午餐', '晚餐', '通勤', '咖啡'];
export const EXPENSE_CATEGORIES = EXPENSE_QUICK.concat(['自定义']);

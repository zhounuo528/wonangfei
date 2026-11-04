import { renderTimeRows, readTimeRows, appendTimeRow, feeDecision, initFeeControls } from './time-rows.mjs';
import { at, dateKey, monthKey, effectivePayDays, validateState, settleGoal } from './model.mjs';
import { KIND_LABELS, calendarInfo, editCalendarDay, undoCalendarChange, undoableCalendarChange, calendarImpact } from './calendar.mjs';
const $ = id => document.getElementById(id);
const dt = stamp => { const d=new Date(stamp); return `${dateKey(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
export function createCalendarEditor(ctx) {
  let key, info, candidate, baseline, saving=false;
  const form=$('calendar-edit-form');
  const invalidate=()=>{ candidate=null; $('calendar-edit-save').disabled=true; $('calendar-impact').hidden=true; };
  function controls(kindChanged=false) {
    const kind=$('calendar-day-kind').value, absence=['leave','swap'].includes(kind), base=kind==='base', pay=$('calendar-day-pay');
    if(kindChanged) { pay.replaceChildren(); for(const [value,label]of (kind==='overtime'?[['unpaid','基础工资不增长 · 下班时另记加班费']]:[['','请选择薪资处理'],['unpaid',absence?'不计当日基础工资':'不计基础工资'],['standard',absence?'保留标准日薪 · 当天排班结束后计入':'标准日薪 · 按实际记录工时折算'],['custom',absence?'自定当日补薪 · 排班结束后一次计入':'自定补薪 · 有实际工时后一次计入']]))pay.add(new Option(label,value)); }
    const standard=[...pay.options].find(o=>o.value==='standard'); if(standard)standard.disabled=absence&&!info.baseWorkday;
    $('calendar-pay-fields').hidden=base; pay.required=!base;
    $('calendar-custom-amount-label').hidden=pay.value!=='custom';$('calendar-custom-amount').required=!base&&pay.value==='custom';
    $('calendar-record-fields').hidden=info.future||absence||base;
    $('calendar-actual-fields').hidden=!$('calendar-edit-times').checked||absence||info.future;
    $('calendar-past-confirm-label').hidden=info.future||!!ctx.state().days[key];$('calendar-past-confirm').required=!info.future&&!ctx.state().days[key];
    $('calendar-schedule-fields').hidden=(!info.future&&!!ctx.state().days[key])||base||absence;
    const known = info.future || !!ctx.state().days[key]; $('calendar-wage-inputs').hidden=known; $('calendar-salary-summary').hidden=!known;
    $('calendar-salary').readOnly=info.future||!!ctx.state().days[key];$('calendar-paydays').readOnly=info.future||!!ctx.state().days[key];
    $('calendar-paydays').min=pay.value==='standard'?'0.01':'0';
    $('calendar-pay-note').textContent=base?'恢复基础周期排班，未来不预记收入或工时。':kind==='overtime'?'加班基础工资为零；工时仍增加、计入本月实际工作日。加班费走下班另记流程，不套倍率。':absence?'原有时段和摸鱼将归档保留，不计实际工时；所选补薪于当天排班结束后计入。固定负担和计薪天数保持原规则。':pay.value==='custom'?'这笔是单日定额补薪，有实际工时后只记一次；原有另记加班费另行显示。':'单日上班不改变基础月计薪天数；未来计划不提前计时或计薪。';
  }
  function open(date, editTimes=false) {
    key=date;info=calendarInfo(ctx.state(),key,ctx.now());if(!info.editable){ctx.toast(`记录从 ${ctx.state().trackingStart} 开始，之前日期不自动补造`);return;}
    form.reset();$('calendar-schedule-fields').open=false;invalidate();$('calendar-edit-error').textContent='';$('calendar-edit-title').textContent=info.future?'安排这一天':'修正这一天';$('calendar-edit-date').textContent=`${key} · 基础排班：${info.baseWorkday?'上班':'休息'}`;
    $('calendar-editor-context').textContent=info.future?'这是单日计划，实际收入和工时等到当天记录。':info.recorded?'原始时段、加班费和修改记录都会保留；先看影响，再保存。':'这天没有实际记录。补录前请核对工资和时段，不自动补满勤。';
    const kind=$('calendar-day-kind');kind.replaceChildren();
    if(info.future)kind.add(new Option(`按基础排班 · ${info.baseWorkday?'上班':'休息'}`,'base'));
    for(const value of info.baseWorkday?['work','leave','swap']:info.future?['work','overtime']:['work','overtime','leave','swap'])kind.add(new Option(value==='work'&&!info.baseWorkday?'上班 / 补班':KIND_LABELS[value],value));
    kind.value=info.policy?.kind??(info.future?'base':'work');controls(true);$('calendar-day-pay').value=info.policy?.payMode??(info.future?'':'standard');
    $('calendar-custom-amount').value=info.policy?.amount?Number(info.policy.amount).toFixed(2):'';
    $('calendar-keep-fee').checked=info.policy?.includeOvertimePay!==false;
    const settings=info.settings,day=ctx.state().days[key];$('calendar-salary-summary').textContent=`当日工资参考 ${ctx.money(settings.salary)} / 月 · 基础计薪 ${effectivePayDays(key,settings)} 天；不会用单日请假或加班重分日薪。`;$('calendar-salary').value=Number(settings.salary).toFixed(2);$('calendar-paydays').value=effectivePayDays(key,settings);
    for(const name of ['start','end','lunchStart','lunchEnd'])form.elements[name].value=settings[name];form.elements.lunch.checked=settings.lunch;
    $('calendar-edit-times').checked=editTimes||!day?.sessions.length;renderTimeRows($('calendar-time-rows'),{day,key,settings,now:ctx.now(),prefix:'calendar-actual'});
    $('calendar-fee-fields').hidden=true;$('calendar-fee-fields').disabled=true;$('calendar-fee-amount-label').hidden=true;
    const undo=undoableCalendarChange(ctx.state(),key);$('calendar-undo').hidden=!undo;$('calendar-undo').disabled=!!undo&&!undo.safe;
    $('calendar-audit-note').textContent=undo?`${(ctx.state().calendarAudit??[]).filter(e=>e.date===key).length} 次日历修改已留档。${undo.safe?'可预览撤销上次修改。':'此后已有其他改动，不能整笔覆盖撤销。'}`:ctx.state().version === 1 ? '本次会升级日历记录格式并保留修改前快照；旧版需使用升级前导出的备份。' : '本次将保留修改前后的快照。';
    controls();$('calendar-edit-dialog').showModal();kind.focus();
  }
  function draft() {
    const kind=$('calendar-day-kind').value;if(kind==='base')return{date:key,reset:true};
    const fields=new FormData(form),payMode=$('calendar-day-pay').value;
    const schedule={start:fields.get('start'),end:fields.get('end'),lunch:fields.get('lunch')==='on',lunchStart:fields.get('lunchStart'),lunchEnd:fields.get('lunchEnd')};
    const settings={...info.settings,...(!info.future&&!ctx.state().days[key]?schedule:{}),salary:Number($('calendar-salary').value),payDays:Number($('calendar-paydays').value),payDaysMode:Number($('calendar-paydays').value)>0?'manual':'auto',payDaysMonth:monthKey(key)};
    const input={date:key,kind,payMode,amount:Number($('calendar-custom-amount').value),settings,includeOvertimePay:$('calendar-keep-fee').checked,confirmedBackfill:$('calendar-past-confirm').checked};
    if(info.future)input.schedule={start:fields.get('start'),end:fields.get('end'),lunch:fields.get('lunch')==='on',lunchStart:fields.get('lunchStart'),lunchEnd:fields.get('lunchEnd')};
    if(!info.future&&!['leave','swap'].includes(kind)&&$('calendar-edit-times').checked)input.records=readTimeRows($('calendar-time-rows'));
    input.closeDecision=feeDecision('calendar');
    return input;
  }
  $('calendar-preview').addEventListener('click',()=>{
    invalidate();$('calendar-edit-error').textContent='';
    try{
      const state=ctx.state(),stamp=ctx.now(),next=structuredClone(state);const result=editCalendarDay(next,draft(),stamp);$('calendar-fee-fields').hidden=!result.needsFeeDecision;$('calendar-fee-fields').disabled=!result.needsFeeDecision;settleGoal(next,stamp);validateState(next);
      const impact=calendarImpact(state,next,key,stamp);for(const [id,value]of Object.entries({'before-income':ctx.money(impact.before.earned),'after-income':ctx.money(impact.after.earned),'before-net':ctx.money(impact.before.net),'after-net':ctx.money(impact.after.net),'before-hours':ctx.duration(impact.before.actual),'after-hours':ctx.duration(impact.after.actual),'before-goal':ctx.money(impact.goalBefore),'after-goal':ctx.money(impact.goalAfter)}))$(`calendar-impact-${id}`).textContent=value;
      $('calendar-impact-scope').textContent=info.future?'未来计划：当前收入、工时和目标池保持不变。':`${key} · 预览截至 ${dt(stamp).replace('T',' ')}；已完成目标的结算保留。`;
      baseline=JSON.stringify(state);candidate=next;$('calendar-impact').hidden=false;$('calendar-edit-save').disabled=false;
    }catch(e){$('calendar-edit-error').textContent=e.message;if(e.calendarFeeRequired){$('calendar-fee-fields').hidden=false;$('calendar-fee-fields').disabled=false;}}
  });
  form.addEventListener('submit',async event=>{event.preventDefault();if(!candidate||saving)return;saving=true;$('calendar-edit-save').disabled=true;
    try{await ctx.commit(candidate,baseline);$('calendar-edit-dialog').close();ctx.toast('这一天已更新，记录与统计重新算好了');}catch(e){$('calendar-edit-error').textContent=e.message;}finally{saving=false;$('calendar-edit-save').disabled=!candidate;}
  });
  $('calendar-undo').addEventListener('click',()=>{try{const state=ctx.state(),next=structuredClone(state),stamp=ctx.now(),base=JSON.stringify(state);undoCalendarChange(next,key,stamp);settleGoal(next,stamp);const i=calendarImpact(state,next,key,stamp);ctx.ask('撤销上次日历修改？',`净额 ${ctx.money(i.before.net)} → ${ctx.money(i.after.net)}；有效工时 ${ctx.duration(i.before.actual)} → ${ctx.duration(i.after.actual)}；目标池 ${ctx.money(i.goalBefore)} → ${ctx.money(i.goalAfter)}。已完成目标结算保留。`,async()=>{try{await ctx.commit(next,base);$('calendar-edit-dialog').close();ctx.toast('上次日历修改已撤销，撤销记录已保留');}catch(e){$('calendar-edit-error').textContent=e.message;}});}catch(e){$('calendar-edit-error').textContent=e.message;}});
  form.addEventListener('input',invalidate);form.addEventListener('change',invalidate);
  $('calendar-day-kind').addEventListener('change',()=>controls(true));$('calendar-day-pay').addEventListener('change',()=>controls());$('calendar-edit-times').addEventListener('change',()=>controls());$('calendar-add-time').addEventListener('click',()=>{appendTimeRow($('calendar-time-rows'),{key,settings:info.settings,now:ctx.now(),prefix:'calendar-actual'});invalidate();});
  initFeeControls('calendar',invalidate);
  return {open};
}

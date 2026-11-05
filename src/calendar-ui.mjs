import {paintChange,changeLine,styleChangeValue,styleAmount} from './money-change.mjs';
import { renderTimeRows, readTimeRows, appendTimeRow, feeDecision, initFeeControls } from './time-rows.mjs';
import { at, dateKey, monthKey, effectivePayDays, initialSalaryReference, salaryKnownForDate, payrollDaysForMonth, salaryIsManual, validateState, settleGoal } from './model.mjs';
import { KIND_LABELS, calendarInfo, editCalendarDay, undoCalendarChange, undoableCalendarChange, calendarImpact, SCHEDULE_FIELDS } from './calendar.mjs';
const $ = id => document.getElementById(id);
const dt = stamp => { const d=new Date(stamp); return `${dateKey(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
export function createCalendarEditor(ctx) {
  let key, info, candidate, baseline, saving=false, manualReference=false;
  const form=$('calendar-edit-form');
  $('calendar-plan-daily-fixed').addEventListener('click',()=>{if(saving||candidate){ctx.toast('请先保存或取消当天安排的修改');return;}$('calendar-edit-dialog').close();ctx.editDailyCosts(key);});
  const invalidate=()=>{ candidate=null; $('calendar-edit-save').disabled=true; $('calendar-impact').hidden=true; };
  function controls(kindChanged=false) {
    const kind=$('calendar-day-kind').value,absence=['leave','swap','rest'].includes(kind),base=kind==='base',pay=$('calendar-day-pay'),recorded=!!ctx.state().days[key];
    if(kindChanged){
      const previous=info.policy?.kind===kind?info.policy?.payMode:null;
      const opts=['overtime','rest'].includes(kind)?[['unpaid',kind==='overtime'?'无工资':'休息 · 不计基础工资']]:['leave','swap'].includes(kind)?[['','请选择当天工资处理'],['unpaid','不计当日工资'],['standard','保留标准日工资'],['custom','手动记录工资']]:[['standard','标准日工资'],['custom','手动记录工资'],...(previous==='unpaid'?[['unpaid','保留旧记录 · 不计工资']]:[])];
      pay.replaceChildren();for(const [value,label]of opts)pay.add(new Option(label,value));if(previous)pay.value=previous;
      if(['leave','swap'].includes(kind))$('calendar-special-fields').open=true;
    }
    const standard=[...pay.options].find(o=>o.value==='standard');if(standard)standard.disabled=['leave','swap'].includes(kind)&&!info.baseWorkday;
    $('calendar-pay-fields').hidden=base;pay.required=!base;
    $('calendar-custom-amount-label').hidden=pay.value!=='custom';$('calendar-custom-amount').required=!base&&pay.value==='custom';
    $('calendar-record-fields').hidden=info.future||absence||(recorded&&!$('calendar-edit-times').checked);
    $('calendar-actual-fields').hidden=!$('calendar-edit-times').checked||absence||info.future;
    $('calendar-edit-times').closest('label').hidden=!recorded;
    $('calendar-past-confirm-label').hidden=info.future||recorded;$('calendar-past-confirm').required=!info.future&&!recorded;
    $('calendar-schedule-fields').hidden=base||absence;
    const repairing=recorded&&!info.future&&$('calendar-wage-repair').checked,known=info.future||recorded;
    $('calendar-wage-inputs').hidden=known&&!repairing;$('calendar-salary-summary').hidden=!known;
    $('calendar-wage-repair-label').hidden=!recorded||info.future;$('calendar-wage-repair').disabled=!recorded||info.future;
    $('calendar-salary').readOnly=known&&!repairing;$('calendar-paydays').readOnly=known;
    $('calendar-salary').required=!base&&pay.value==='standard'&&!info.future&&(!recorded||repairing);
    $('calendar-use-initial').hidden=info.future||!initialSalaryReference(ctx.state())||key.slice(0,7)<ctx.state().trackingStart.slice(0,7);
    $('calendar-paydays').min=pay.value==='standard'?'0.01':'0';
    $('calendar-keep-fee-label').hidden=info.future||!ctx.state().days[key]?.overtimeDecisions?.some(f=>f.kind==='paid');
    $('calendar-kind-field').hidden=!info.future&&!recorded&&!$('calendar-special-fields').open;
    $('calendar-pay-note').textContent=base?'沿用基础周期排班。':kind==='overtime'?'基础收入不增长，实际工时和工作日仍计入均薪；下班可另记加班费。':kind==='rest'?'休息这天不计工资和工时；原有记录留档。':['leave','swap'].includes(kind)?'请确认当天是否保留工资；原有时段和摸鱼留档，不计实际工时。':'标准日工资按已记工时折算；手动记录工资是当日基础工资，加班费另记。新增普通补班会重分本月自动工资。';
  }
  function open(date, editTimes=false) {
    key=date;info=calendarInfo(ctx.state(),key,ctx.now());if(!info.editable){ctx.toast(`记录从 ${ctx.state().trackingStart} 开始，之前日期不自动补造`);return;}
    form.reset();manualReference=false;$('calendar-special-fields').open=false;$('calendar-schedule-fields').open=false;invalidate();$('calendar-edit-error').textContent='';$('calendar-edit-title').textContent=info.future?'这天怎么安排？':info.recorded?'修改当天安排':'补记这一天';$('calendar-edit-date').textContent=`${key} · 基础排班：${info.baseWorkday?'上班':'休息'}`;
    $('calendar-editor-context').textContent=info.future?'这是单日计划，实际收入和工时等到当天记录。':info.recorded?'先看变动，再保存。原时段和修改记录都会留档。':'填上下班，工资按当日规则计算。特殊情况在下方调整。';
    const kind=$('calendar-day-kind');kind.replaceChildren();
    if(info.future)kind.add(new Option(`按基础排班 · ${info.baseWorkday?'上班':'休息'}`,'base'));
    for(const value of ['work','rest','leave','swap',...(!info.baseWorkday?['overtime']:[])])kind.add(new Option(value==='work'&&!info.baseWorkday?'上班 / 补班':KIND_LABELS[value],value));
    kind.value=info.policy?.kind??(info.future?'base':info.baseWorkday?'work':'overtime');controls(true);
    $('calendar-custom-amount').value=info.policy?.amount?Number(info.policy.amount).toFixed(2):'';
    $('calendar-keep-fee').checked=info.policy?.includeOvertimePay!==false;
    const settings=info.settings,day=ctx.state().days[key];$('calendar-salary-summary').textContent=`当日工资参考 ${ctx.money(settings.salary)} / 月 · 计薪 ${effectivePayDays(key,settings)} 天。手动例外保留；自动工资随普通补班重分。`;$('calendar-salary').value=!salaryKnownForDate(ctx.state(),key)&&!day?'':Number(settings.salary).toFixed(2);$('calendar-paydays').value=effectivePayDays(key,settings);
    const reference=initialSalaryReference(ctx.state());$('calendar-wage-origin').textContent=reference?`${reference.source==='initial-setup'?'首次工资':'旧档案首笔工资参考'} ${ctx.money(reference.salary)} / 月。${!salaryKnownForDate(ctx.state(),key)?'此日早于已知工资，请填写此日工资参考。':'可按日独立核对。'}`:'';
    for(const name of ['start','end','lunchStart','lunchEnd'])form.elements[name].value=settings[name];form.elements.lunch.checked=settings.lunch;
    $('calendar-edit-times').checked=editTimes||!day?.sessions.length;renderTimeRows($('calendar-time-rows'),{day,key,settings,now:ctx.now(),prefix:'calendar-actual'});
    $('calendar-fee-fields').hidden=true;$('calendar-fee-fields').disabled=true;$('calendar-fee-amount-label').hidden=true;
    const undo=undoableCalendarChange(ctx.state(),key);$('calendar-undo').hidden=!undo;$('calendar-undo').disabled=!!undo&&!undo.safe;
    $('calendar-audit-note').textContent=undo?`${(ctx.state().calendarAudit??[]).filter(e=>e.date===key).length} 次日历修改已留档。${undo.safe?'可预览撤销上次修改。':'此后已有其他改动，不能整笔覆盖撤销。'}`:ctx.state().version === 1 ? '本次会升级日历记录格式并保留修改前快照；旧版需使用升级前导出的备份。' : '本次将保留修改前后的快照。';
    controls();$('calendar-edit-dialog').showModal();(info.future||info.recorded?kind:$('calendar-time-rows').querySelector('input')).focus();
  }
  function draft() {
    const kind=$('calendar-day-kind').value;if(kind==='base')return{date:key,reset:true};
    const fields=new FormData(form),payMode=$('calendar-day-pay').value;
    const schedule={start:fields.get('start'),end:fields.get('end'),lunch:fields.get('lunch')==='on',lunchStart:fields.get('lunchStart'),lunchEnd:fields.get('lunchEnd')};
    const salaryText=$('calendar-salary').value;if(payMode==='standard'&&!info.future&&!ctx.state().days[key]&&salaryText==='')throw Error('此日早于已知工资，请填写当日采用的到手月薪');
    const settings={...info.settings,...(!info.future&&!ctx.state().days[key]?schedule:{}),salary:Number(salaryText),...(manualReference?{payDays:Number($('calendar-paydays').value),payDaysMode:'manual',payDaysMonth:monthKey(key)}:{})};
    const input={date:key,kind,payMode,amount:Number($('calendar-custom-amount').value),settings,includeOvertimePay:info.future?true:$('calendar-keep-fee').checked,confirmedBackfill:$('calendar-past-confirm').checked,salaryMode:manualReference?'manual':'schedule'};
    if(!ctx.state().days[key]&&initialSalaryReference(ctx.state())?.source==='legacy-reference'&&key<ctx.state().trackingStart)input.salaryMode='manual';
    if(!info.future&&ctx.state().days[key]?.calendar?.includeOvertimePay===false&&$('calendar-keep-fee').checked===false)input.refreshExcludedFees=false;
    if(ctx.state().days[key]&&!info.future&&$('calendar-wage-repair').checked)input.salaryCorrection={salary:Number($('calendar-salary').value),confirmed:true};
    if(info.future||SCHEDULE_FIELDS.some(field=>schedule[field]!==info.settings[field]))input.schedule=schedule;
    if(!info.future&&!['leave','swap','rest'].includes(kind)&&$('calendar-edit-times').checked)input.records=readTimeRows($('calendar-time-rows'));
    input.closeDecision=feeDecision('calendar');
    return input;
  }
  $('calendar-preview').addEventListener('click',()=>{
    invalidate();$('calendar-edit-error').textContent='';
    try{
      const state=ctx.state(),stamp=ctx.now(),next=structuredClone(state);const result=editCalendarDay(next,draft(),stamp);$('calendar-fee-fields').hidden=!result.needsFeeDecision;$('calendar-fee-fields').disabled=!result.needsFeeDecision;settleGoal(next,stamp);validateState(next);
      const impact=calendarImpact(state,next,key,stamp);for(const [id,value]of Object.entries({'before-income':ctx.money(impact.before.earned),'after-income':ctx.money(impact.after.earned),'before-net':ctx.money(impact.before.net),'after-net':ctx.money(impact.after.net),'before-hours':ctx.duration(impact.before.actual),'after-hours':ctx.duration(impact.after.actual),'before-goal':ctx.money(impact.goalBefore),'after-goal':ctx.money(impact.goalAfter)}))$(`calendar-impact-${id}`).textContent=value;
      for(const [field,before,after]of [['income',impact.before.earned,impact.after.earned],['net',impact.before.net,impact.after.net],['goal',impact.goalBefore,impact.goalAfter]]){styleAmount($(`calendar-impact-before-${field}`),before,ctx);styleChangeValue($(`calendar-impact-after-${field}`),before,after,ctx);}
      styleChangeValue($('calendar-impact-after-hours'),impact.before.actual,impact.after.actual,{state:ctx.state,money:ctx.duration},'neutral');
      $('calendar-impact-scope').textContent=info.future?'未来不记工时或收入；本月已记录的自动工资可能因补班重新分配。':`${key} · 预览截至 ${dt(stamp).replace('T',' ')}；已完成目标的结算保留。`;
      const changed=(result.payrollChanges??[]).length;const protectedCount=Object.entries(state.days).filter(([d,v])=>d.slice(0,7)===key.slice(0,7)&&(salaryIsManual(v)||v.settings.payDaysMode==='manual')).length;paintChange($('calendar-impact-month'),[`本月计薪 ${payrollDaysForMonth(state,key)} → ${payrollDaysForMonth(next,key)} 天；`,{label:'本月已累计净额',before:impact.monthBefore.net,after:impact.monthAfter.net},`。重分 ${changed} 个自动记录，保留 ${protectedCount} 个手动例外；原有费用分摊保留。`],ctx);
      baseline=JSON.stringify(state);candidate=next;$('calendar-impact').hidden=false;$('calendar-edit-save').disabled=false;
    }catch(e){$('calendar-edit-error').textContent=e.message;if(e.calendarFeeRequired){$('calendar-fee-fields').hidden=false;$('calendar-fee-fields').disabled=false;}}
  });
  form.addEventListener('submit',async event=>{event.preventDefault();if(!candidate||saving)return;saving=true;$('calendar-edit-save').disabled=true;
    try{await ctx.commit(candidate,baseline);$('calendar-edit-dialog').close();ctx.toast('这一天已更新，记录与统计重新算好了');}catch(e){$('calendar-edit-error').textContent=e.message;}finally{saving=false;$('calendar-edit-save').disabled=!candidate;}
  });
  $('calendar-undo').addEventListener('click',()=>{try{const state=ctx.state(),next=structuredClone(state),stamp=ctx.now(),base=JSON.stringify(state);undoCalendarChange(next,key,stamp);settleGoal(next,stamp);const i=calendarImpact(state,next,key,stamp);ctx.ask('撤销上次日历修改？',changeLine([{label:'净额',before:i.before.net,after:i.after.net},`；有效工时 ${ctx.duration(i.before.actual)} → ${ctx.duration(i.after.actual)}；`,{label:'目标已攒净赚',before:i.goalBefore,after:i.goalAfter},'。已完成目标结算保留。'],ctx),async()=>{try{await ctx.commit(next,base);$('calendar-edit-dialog').close();ctx.toast('上次日历修改已撤销，撤销记录已保留');}catch(e){$('calendar-edit-error').textContent=e.message;}});}catch(e){$('calendar-edit-error').textContent=e.message;}});
  form.addEventListener('input',invalidate);form.addEventListener('change',invalidate);
  $('calendar-day-kind').addEventListener('change',()=>controls(true));$('calendar-day-pay').addEventListener('change',()=>controls());$('calendar-edit-times').addEventListener('change',()=>controls());$('calendar-add-time').addEventListener('click',()=>{appendTimeRow($('calendar-time-rows'),{key,settings:info.settings,now:ctx.now(),prefix:'calendar-actual'});invalidate();});
  initFeeControls('calendar',invalidate);
  $('calendar-wage-repair').addEventListener('change',()=>controls());
  for(const id of ['calendar-salary','calendar-paydays'])$(id).addEventListener('input',()=>{manualReference=true;});
  $('calendar-special-fields').addEventListener('toggle',()=>controls());
  $('calendar-use-initial').addEventListener('click',()=>{const reference=initialSalaryReference(ctx.state());if(!reference)return;manualReference=true;if(ctx.state().days[key])$('calendar-wage-repair').checked=true;$('calendar-salary').value=reference.salary.toFixed(2);controls();invalidate();});
  return {open};
}

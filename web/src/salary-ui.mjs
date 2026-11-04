import { dateKey, monthStats, goalStats, saveSettings, undoSalaryChange, salaryEvents, initialSalaryReference, settleGoal, validateState, configureClockInReminder } from './model.mjs';
const $=id=>document.getElementById(id);
export function createSalaryEditor(ctx){
  let input,reminder,clockInEnabled,candidate,baseline,saving=false,undoId;
  const form=$('salary-change-form');
  function invalidate(){candidate=null;$('salary-change-save').disabled=true;$('salary-change-impact').hidden=true;$('salary-change-error').textContent='';}
  function latest(){return salaryEvents(ctx.state()).filter(c=>c.source==='dated-adjustment').sort((a,b)=>a.index-b.index).at(-1);}
  function open(settings,enabled,undo=false){
    input=structuredClone(settings);reminder=enabled;clockInEnabled=ctx.clockInEnabled?.()??!!ctx.state().clockInReminder?.enabled;undoId=undo?latest()?.id:null;
    if(undo&&!undoId){ctx.toast('没有可撤销的日期调薪');return;}
    form.reset();invalidate();const state=ctx.state(),today=dateKey(new Date(ctx.now()));
    $('salary-change-title').textContent=undo?'撤销上次日期调薪':'这份工资，何时生效？';
    $('salary-change-date').value=undo?latest().effectiveDate:today;$('salary-change-date').disabled=undo;
    $('salary-change-amount').textContent=ctx.money(undo?latest().salary:settings.salary);
    $('salary-legacy-choice').hidden=undo||initialSalaryReference(state)?.source!=='legacy-reference';
    for(const radio of form.querySelectorAll('[name=legacyChoice]'))radio.required=!$('salary-legacy-choice').hidden;
    $('salary-change-dialog').showModal();$('salary-change-date').focus();
  }
  $('salary-change-preview').addEventListener('click',()=>{
    invalidate();try{
      if(!form.reportValidity())return;
      const state=ctx.state(),next=structuredClone(state),stamp=ctx.now(),date=$('salary-change-date').value;
      const result=undoId?undoSalaryChange(next,undoId,stamp):saveSettings(next,input,date,stamp,{legacyChoice:new FormData(form).get('legacyChoice')});
      if(!undoId){next.reminder??={enabled:false,enabledAt:null,delivered:{}};if(reminder&&!next.reminder.enabled)next.reminder.enabledAt=stamp;next.reminder.enabled=reminder;configureClockInReminder(next,clockInEnabled,stamp);}
      settleGoal(next,stamp);validateState(next);
      const months=[...new Set([date.slice(0,7),...result.affectedDates.map(k=>k.slice(0,7))])].sort();
      const body=$('salary-impact-months');body.replaceChildren();
      for(const month of months){const row=document.createElement('tr');for(const v of [month,ctx.money(monthStats(state,`${month}-01`,stamp).net),ctx.money(monthStats(next,`${month}-01`,stamp).net)]){const cell=document.createElement('td');cell.textContent=v;row.append(cell);}body.append(row);}
      $('salary-impact-dates').textContent=`重算 ${result.affectedDates.length} 个自动工资记录；保留 ${result.protectedDates.length} 个手动工资例外。`;
      $('salary-impact-later').textContent=salaryEvents(next).some(c=>c.effectiveDate>date)?`后续独立调薪保留：${salaryEvents(next).filter(c=>c.effectiveDate>date).map(c=>`${c.effectiveDate} ${ctx.money(c.salary)}`).join('；')}`:'之后沿用这份工资，直到下一次独立调薪。';
      $('salary-impact-goal').textContent=`目标余池 ${ctx.money(goalStats(state,stamp).pool)} → ${ctx.money(goalStats(next,stamp).pool)}。目标创建前收入不追溯，已完成目标结算保留。`;
      baseline=JSON.stringify(state);candidate=next;$('salary-change-impact').hidden=false;$('salary-change-save').disabled=false;
    }catch(error){$('salary-change-error').textContent=error.message;}
  });
  form.addEventListener('input',invalidate);form.addEventListener('change',invalidate);
  form.addEventListener('submit',async event=>{event.preventDefault();if(!candidate||saving)return;saving=true;$('salary-change-save').disabled=true;
    try{await ctx.commit(candidate,baseline);$('salary-change-dialog').close();ctx.saved(undoId?'已撤销该笔调薪，其他调薪和手动例外保留。':`已保存，工资从 ${$('salary-change-date').value} 生效。`);}catch(error){$('salary-change-error').textContent=error.message;}finally{saving=false;$('salary-change-save').disabled=!candidate;}
  });
  $('salary-change-dialog').addEventListener('cancel',e=>{if(saving)e.preventDefault();});
  return {open,latest};
}

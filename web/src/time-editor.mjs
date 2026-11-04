import { isAbsent, dayStats, settleGoal, validateState } from './model.mjs';
import { calendarInfo, editCalendarDay, calendarImpact } from './calendar.mjs';
import { renderTimeRows, readTimeRows, appendTimeRow, feeDecision, initFeeControls } from './time-rows.mjs';
const $=id=>document.getElementById(id);
export function createTimeEditor(ctx){let key,info,candidate,baseline,saving=false;const rows=$('correction-times'),form=$('correction-form');
 function preview(){candidate=null;$('correction-save').disabled=true;$('correction-error').textContent='';
  try{const state=ctx.state(),day=state.days[key],records=readTimeRows(rows),unchanged=records.length===day.sessions.length&&records.every(r=>r.sessionIndex!=='new'&&r.start===day.sessions[r.sessionIndex].start&&r.end===day.sessions[r.sessionIndex].end);
   if(unchanged){$('correction-preview').hidden=true;$('correction-fee-fields').hidden=true;$('correction-fee-fields').disabled=true;$('correction-fee-amount-label').hidden=true;return;}
   const next=structuredClone(state),result=editCalendarDay(next,{date:key,kind:day.calendar?.kind??'work',payMode:day.calendar?.payMode??'standard',amount:day.calendar?.amount,includeOvertimePay:day.calendar?.includeOvertimePay!==false,records,closeDecision:feeDecision('correction')},ctx.now());
   settleGoal(next,ctx.now());validateState(next);const impact=calendarImpact(state,next,key,ctx.now());
   for(const [side,stats]of [['before',impact.before],['after',impact.after]]){for(const [field,value]of Object.entries({earned:ctx.money(stats.earned),net:ctx.money(stats.net),worked:ctx.duration(stats.worked),overtime:ctx.duration(stats.overtime),fee:ctx.money(stats.overtimePay)}))$(`correction-${side}-${field}`).textContent=value;}
   $('correction-goal-impact').textContent=`目标余池 ${ctx.money(impact.goalBefore)} → ${ctx.money(impact.goalAfter)}；已完成目标结算保留。`;
   $('correction-fee-fields').hidden=!result.needsFeeDecision;$('correction-fee-fields').disabled=!result.needsFeeDecision;$('correction-preview').hidden=false;baseline=JSON.stringify(state);candidate=next;$('correction-save').disabled=false;
  }catch(e){$('correction-preview').hidden=true;$('correction-error').textContent=e.message;if(e.calendarFeeRequired){$('correction-fee-fields').hidden=false;$('correction-fee-fields').disabled=false;}}
 }
 function open(date){key=date;const day=ctx.state().days[key];if(!day?.sessions.length||isAbsent(day.calendar)){ctx.toast('请先在日历恢复或补录上班记录');return;}
  info=calendarInfo(ctx.state(),key,ctx.now());form.reset();candidate=null;$('correction-error').textContent='';$('correction-date').textContent=`${key} · 当日排班 ${day.settings.start}–${day.settings.end}`;
  renderTimeRows(rows,{day,key,settings:day.settings,now:ctx.now(),prefix:'correction'});$('correction-fee-fields').hidden=true;$('correction-fee-fields').disabled=true;$('correction-fee-amount-label').hidden=true;$('correction-preview').hidden=true;$('correction-save').disabled=true;
  $('correction-history').textContent=ctx.state().version===1?'原时间与已有加班费保留；本次保存升级日历格式，旧版请用升级前备份。':'原时间、每次返工及已记加班费都留档；修改后先看影响，再保存。';
  $('correction-dialog').showModal();$('correction-time').focus();
 }
 $('correction-dialog').addEventListener('cancel',e=>{if(saving)e.preventDefault();});
 form.addEventListener('input',preview);form.addEventListener('change',preview);initFeeControls('correction',preview);
 $('correction-add-time').addEventListener('click',()=>{appendTimeRow(rows,{key,settings:info.settings,now:ctx.now(),prefix:'correction'});preview();});
 form.addEventListener('submit',async e=>{e.preventDefault();if(!candidate||saving)return;saving=true;$('correction-save').disabled=true;try{for(const b of form.querySelectorAll('[data-close]'))b.disabled=true;await ctx.commit(candidate,baseline);$('correction-dialog').close();ctx.toast('上下班时间已修正，工时和均薪重新算好了');}catch(error){$('correction-error').textContent=error.message;}finally{saving=false;for(const b of form.querySelectorAll('[data-close]'))b.disabled=false;$('correction-save').disabled=!candidate;}});
 return{open};
}

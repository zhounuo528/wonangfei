import {paintChange,styleChangeValue} from './money-change.mjs';
import { dateKey, dailyFixedRows, editDailyFixedCosts, undoableDailyFixedChange, undoDailyFixedChange, fixedForDate, dayStats, monthStats, goalStats, settleGoal, validateState } from './model.mjs';
const $=id=>document.getElementById(id);

export function createDailyFixedEditor(ctx) {
  let key, candidate, baseline, saving=false;
  const form=$('daily-fixed-form'),container=$('daily-fixed-rows');
  const pool=state=>goalStats(state,ctx.now()).pool;
  function syncRow(row) {
    const custom=row.querySelector('select').value==='custom',input=row.querySelector('input');
    row.classList.toggle('custom-amount',custom);input.disabled=!custom;input.closest('label').hidden=!custom;
  }
  function values() {
    return [...container.children].filter(row=>row.dataset.fixedId).flatMap(row=>{
      const mode=row.querySelector('select').value,field=row.querySelector('input');
      return mode==='auto'?[]:[{fixedId:row.dataset.fixedId,amount:mode==='off'?0:field.value===''?NaN:Number(field.value)}];
    });
  }
  function showImpact(next) {
    const state=ctx.state(),future=key>dateKey(new Date(ctx.now()));
    $('daily-fixed-impact').hidden=false;
    $('daily-fixed-before').textContent=ctx.money(fixedForDate(state,key));
    $('daily-fixed-after').textContent=ctx.money(fixedForDate(next,key));
    styleChangeValue($('daily-fixed-after'),fixedForDate(state,key),fixedForDate(next,key),ctx,'lower');
    if(future)$('daily-fixed-effect').textContent='未来日期仅保存费用安排，到当天再计入累计。';else paintChange($('daily-fixed-effect'),[{label:'当日净额',before:dayStats(state,key,ctx.now()).net,after:dayStats(next,key,ctx.now()).net},'；',{label:'所在月份净额',before:monthStats(state,key,ctx.now()).net,after:monthStats(next,key,ctx.now()).net},'；',{label:'目标已攒净赚',before:pool(state),after:pool(next)},'。'],ctx);
    baseline=JSON.stringify(state);candidate=next;$('daily-fixed-save').disabled=false;
  }
  function preview() {
    candidate=null;$('daily-fixed-save').disabled=true;$('daily-fixed-impact').hidden=true;$('daily-fixed-error').textContent='';
    for(const row of container.querySelectorAll('[data-fixed-id]'))syncRow(row);
    try {
      const next=structuredClone(ctx.state()),result=editDailyFixedCosts(next,{date:key,items:values()},ctx.now());
      if(!result.changed)return;
      settleGoal(next,ctx.now());validateState(next);showImpact(next);
    } catch(error) {$('daily-fixed-error').textContent=error.message;}
  }
  function open(date) {
    key=date;candidate=null;form.reset();container.replaceChildren();$('daily-fixed-save').disabled=true;$('daily-fixed-impact').hidden=true;$('daily-fixed-error').textContent='';
    $('daily-fixed-date').textContent=`${key} · 只调整这一天`;
    const rows=dailyFixedRows(ctx.state(),key);
    for(const item of rows) {
      const row=document.createElement('div');row.className='daily-fixed-row';row.dataset.fixedId=item.id;
      const heading=document.createElement('div'),name=document.createElement('b'),note=document.createElement('small');name.textContent=item.name;note.textContent=`${item.repeat==='daily'?'每天':'每个工作日'} · 当天自动 ${ctx.money(item.automaticAmount)}`;heading.append(name,note);
      const label=document.createElement('label'),mode=document.createElement('select');label.textContent='这一天';mode.setAttribute('aria-label',`${item.name} · 这一天`);
      for(const [value,text]of [['auto','按规则'],['off','当天取消'],['custom','当天自定']])mode.add(new Option(text,value));
      mode.value=item.overridden?item.amount===0?'off':'custom':'auto';label.append(mode);
      const amountLabel=document.createElement('label'),amount=document.createElement('input');amountLabel.textContent='当日金额（元）';amount.type='number';amount.min='0';amount.max='1000000000';amount.step='0.01';amount.value=(item.overridden?item.amount:item.automaticAmount).toFixed(2);amount.setAttribute('aria-label',`${item.name} · 当日金额`);amount.disabled=mode.value!=='custom';amountLabel.append(amount);
      row.append(heading,label,amountLabel);container.append(row);syncRow(row);
    }
    if(!rows.length){const p=document.createElement('p');p.className='fine-print';p.textContent='当天没有生效的每日重复费用。可先在固定负担中添加。';container.append(p);}
    const undo=undoableDailyFixedChange(ctx.state(),key);$('daily-fixed-undo').hidden=!undo;$('daily-fixed-undo').disabled=!undo?.safe;
    $('daily-fixed-dialog').showModal();(container.querySelector('select')??$('daily-fixed-reset')).focus();
  }
  form.addEventListener('input',preview);form.addEventListener('change',preview);
  $('daily-fixed-reset').addEventListener('click',()=>{for(const row of container.querySelectorAll('[data-fixed-id]'))row.querySelector('select').value='auto';preview();});
  $('daily-fixed-undo').addEventListener('click',()=>{try{const next=structuredClone(ctx.state());undoDailyFixedChange(next,key,ctx.now());settleGoal(next,ctx.now());validateState(next);showImpact(next);$('daily-fixed-error').textContent='';}catch(error){$('daily-fixed-error').textContent=error.message;}});
  $('daily-fixed-dialog').addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!candidate||saving)return;saving=true;$('daily-fixed-save').disabled=true;
    for(const button of form.querySelectorAll('button'))button.disabled=true;
    try {await ctx.commit(candidate,baseline);$('daily-fixed-dialog').close();ctx.toast('这一天的重复费用已更新');}
    catch(error){$('daily-fixed-error').textContent=error.message;}
    finally {saving=false;for(const button of form.querySelectorAll('button'))button.disabled=false;$('daily-fixed-save').disabled=!candidate;}
  });
  return {open};
}

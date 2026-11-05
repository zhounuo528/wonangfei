import { EXTRA_INCOME_CATEGORIES, dateKey, uid, saveExtraIncome, setExtraIncomeVoided, undoableExtraIncomeChange, undoExtraIncomeChange, dayStats, monthStats, goalStats, settleGoal, validateState } from './model.mjs';
import {changeLine} from './money-change.mjs';
const $=id=>document.getElementById(id);
const actions={add:'添加',edit:'修改',void:'撤销收入',restore:'恢复收入',undo:'撤销修改'};
export function createExtraIncomeUI(ctx) {
  let currentId,original,candidate,baseline,saving=false,limit=100;
  const form=$('extra-income-form');
  for(const category of EXTRA_INCOME_CATEGORIES)$('extra-income-category').add(new Option(category==='其他'?'自定义':category,category));
  function impact(next,dates) {
    const before=ctx.state(),rows=[];
    for(const key of [...new Set(dates)].sort()){
      const a=dayStats(before,key,ctx.now()),b=dayStats(next,key,ctx.now());
      rows.push([`${key} · `,{label:'总收入',before:a.earned,after:b.earned},'；',{label:'净赚',before:a.net,after:b.net}]);
      rows.push([{label:'平均时薪',before:a.hourly,after:b.hourly},'；',{label:'秒薪',before:a.secondly,after:b.secondly},b.actual===0?' · 有效工时为 0，均薪暂显示 —':'']);
    }
    for(const month of [...new Set(dates.map(key=>key.slice(0,7)))].sort())rows.push([{label:`${month} 净赚`,before:monthStats(before,month+'-01',ctx.now()).net,after:monthStats(next,month+'-01',ctx.now()).net}]);
    if(next.goal){const a=goalStats(before,ctx.now()),b=goalStats(next,ctx.now());rows.push([{label:'为目标攒下的净赚',before:a.pool,after:b.pool},'。已完成目标记录保留。']);if(b.status==='ready')rows.push([`这笔将完成当前目标；扣除 ${ctx.money(next.goal.amount)} 后，${ctx.money(b.pool-next.goal.amount)} 留给下个目标。`]);}
    return rows;
  }
  function prepare(next) {settleGoal(next,ctx.now());validateState(next);baseline=JSON.stringify(ctx.state());candidate=next;}
  function preview() {
    candidate=null;$('extra-income-save').disabled=true;$('extra-income-error').textContent='';$('extra-income-impact').hidden=true;$('extra-income-impact-rows').replaceChildren();$('extra-income-duplicate').hidden=true;
    if($('extra-income-amount').value==='')return;
    try {
      const state=ctx.state(),input={id:currentId,category:$('extra-income-category').value,amount:Number($('extra-income-amount').value),date:$('extra-income-date').value,note:$('extra-income-note').value,...(original?{existing:true,expectedUpdatedAt:original.updatedAt,expectedRevision:original.revision}:{})};
      $('extra-income-duplicate').hidden=!(state.extraIncomes??[]).some(entry=>entry.id!==currentId&&entry.voidedAt===null&&entry.date===input.date&&entry.category===input.category&&entry.amount===input.amount);
      const next=structuredClone(state),result=saveExtraIncome(next,input,ctx.now());if(!result.changed)return;
      $('extra-income-impact-rows').replaceChildren();for(const line of impact(next,[original?.date,input.date].filter(Boolean))){const p=document.createElement('p');p.append(changeLine(line,ctx));$('extra-income-impact-rows').append(p);}
      prepare(next);$('extra-income-impact').hidden=false;$('extra-income-save').disabled=false;
    }catch(error){$('extra-income-error').textContent=error.message;}
  }
  function open(date=dateKey(new Date(ctx.now())),id,category='其他') {
    original=id?ctx.state().extraIncomes?.find(entry=>entry.id===id):null;
    if(id&&(!original||original.voidedAt!==null)){ctx.toast('这笔已撤销，请先恢复再修改');return;}
    currentId=original?.id??uid();candidate=null;form.reset();$('extra-income-title').textContent=original?'修改这笔意外之财':'记录意外之财';
    $('extra-income-category').value=original?.category??(EXTRA_INCOME_CATEGORIES.includes(category)?category:'其他');$('extra-income-amount').type=ctx.state().display==='hidden'?'password':'number';$('extra-income-amount').value=original?.amount.toFixed(2)??'';
    $('extra-income-date').value=original?.date??date;$('extra-income-date').max=dateKey(new Date(ctx.now()));$('extra-income-note').value=original?.note??'';
    $('extra-income-save').disabled=true;$('extra-income-impact').hidden=true;$('extra-income-impact-rows').replaceChildren();$('extra-income-error').textContent='';$('extra-income-duplicate').hidden=true;
    const workDate=ctx.workDate?.(),today=dateKey(new Date(ctx.now()));$('extra-income-date-help').textContent=workDate&&workDate!==today?`默认记在今天 ${today}；当前跨日班次属于 ${workDate}，要记到该班次可修改日期。`:'按所选日期计入收入、净赚和均薪；目标从其累计起始日计算。';
    $('extra-income-dialog').showModal();$('extra-income-amount').focus();
  }
  function refresh() {
    if(!$('extra-income-list-dialog').open)return;
    const date=$('extra-income-filter').value,records=[...(ctx.state().extraIncomes??[])].filter(entry=>!date||entry.date===date).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt);
    const list=$('extra-income-list');list.replaceChildren();
    for(const entry of records.slice(0,limit)){
      const row=document.createElement('article');row.className='extra-income-row'+(entry.voidedAt!==null?' voided':'');row.dataset.incomeId=entry.id;
      const heading=document.createElement('div'),title=document.createElement('b'),amount=document.createElement('strong');title.textContent=entry.category==='其他'?'自定义':entry.category;amount.textContent=ctx.money(entry.amount);heading.append(title,amount);
      const detail=document.createElement('p');detail.textContent=`${entry.date}${entry.note?' · '+entry.note:''}${entry.voidedAt!==null?' · 已撤销，金额不计入统计':''}`;
      const buttons=document.createElement('div');buttons.className='income-row-actions';
      function button(text,action,callback){const b=document.createElement('button');b.type='button';b.className='text-button';b.dataset.incomeAction=action;b.textContent=text;b.addEventListener('click',callback);buttons.append(b);return b;}
      if(entry.voidedAt===null)button('修改','edit',()=>{$('extra-income-list-dialog').close();open(entry.date,entry.id);});
      button(entry.voidedAt===null?'撤销收入':'恢复收入',entry.voidedAt===null?'void':'restore',()=>changeRecord(entry,entry.voidedAt===null?'void':'restore'));
      if(undoableExtraIncomeChange(ctx.state(),entry.id)?.safe)button('撤销上次修改','undo',()=>changeRecord(entry,'undo'));
      const history=document.createElement('details'),summary=document.createElement('summary'),events=(ctx.state().extraIncomeAudit??[]).filter(event=>event.incomeId===entry.id);summary.textContent=`修改记录（${events.length}）`;history.append(summary);
      for(const event of events.slice(-10).reverse()){const p=document.createElement('p');p.append(changeLine([`${new Date(event.changedAt).toLocaleString('zh-CN',{hour12:false})} · ${actions[event.action]} · ${event.before?event.before.date+' → ':''}${event.after.date} · `,{label:'计入收入',before:event.before?.voidedAt===null?event.before.amount:0,after:event.after.voidedAt===null?event.after.amount:0}],ctx));history.append(p);}
      row.append(heading,detail,buttons,history);list.append(row);
    }
    if(!records.length){const p=document.createElement('p');p.className='fine-print';p.textContent='还没有记录。红包、补贴、奖金，额外到手就记一笔。';list.append(p);}
    $('extra-income-more').hidden=records.length<=limit;$('extra-income-record-count').textContent=`共 ${records.length} 笔（含已撤销记录）`;
  }
  function openList(date='') {limit=100;$('extra-income-filter').value=date;$('extra-income-filter').max=dateKey(new Date(ctx.now()));$('extra-income-list-dialog').showModal();refresh();}
  function changeRecord(entry,action) {
    if(saving||$('confirm-dialog').open)return;
    try {
      const next=structuredClone(ctx.state());if(action==='undo')undoExtraIncomeChange(next,entry.id,ctx.now());else setExtraIncomeVoided(next,entry.id,action==='void',ctx.now());
      const result=next.extraIncomes.find(record=>record.id===entry.id),copy=document.createDocumentFragment(),base=JSON.stringify(ctx.state());for(const line of impact(next,[entry.date,result.date]))copy.append(changeLine(line,ctx),'；');settleGoal(next,ctx.now());validateState(next);
      ctx.ask(`${action==='void'?'撤销这笔收入':action==='restore'?'恢复这笔收入':'撤销上次修改'}？`,copy,async()=>{if(saving)return;saving=true;try{await ctx.commit(next,base);refresh();ctx.toast('收入记录和相关统计已更新');}catch(error){ctx.toast(error.message);}finally{saving=false;}});
    }catch(error){ctx.toast(error.message);}
  }
  form.addEventListener('input',preview);form.addEventListener('change',preview);
  $('extra-income-dialog').addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  form.addEventListener('submit',async event=>{event.preventDefault();if(!candidate||saving)return;saving=true;for(const b of form.querySelectorAll('button'))b.disabled=true;
    try {const date=$('extra-income-date').value;await ctx.commit(candidate,baseline);$('extra-income-dialog').close();ctx.toast(`已记入 ${date}，相关日期和月份已更新`);}
    catch(error){$('extra-income-error').textContent=error.message;}
    finally{saving=false;for(const b of form.querySelectorAll('button'))b.disabled=false;$('extra-income-save').disabled=!candidate;}
  });
  $('extra-income-filter').addEventListener('change',()=>{limit=100;refresh();});$('extra-income-all').addEventListener('click',()=>{$('extra-income-filter').value='';limit=100;refresh();});$('extra-income-more').addEventListener('click',()=>{limit+=100;refresh();});
  return {open,openList,refresh};
}

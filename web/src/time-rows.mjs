import { at, dateKey } from './model.mjs';
const originals=new WeakMap();
export const dateTimeValue=stamp=>{const d=new Date(stamp);return `${dateKey(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};
export function appendTimeRow(container,{session=null,sessionIndex='new',key,settings,now,prefix='worktime'}) {
  const row=document.createElement('section');row.className='time-edit-row';row.dataset.timeRow='';
  const heading=document.createElement('small');heading.textContent=session?`${session.resumed?'返工记录':'上班记录'} · ${dateTimeValue(session.start).replace('T',' ')}`:'补录一段上班';row.append(heading);
  const grid=document.createElement('div');grid.className='form-grid';
  const values={start:session?.start??at(key,settings.start),end:session?session.end:Math.min(at(key,settings.end),now)};
  const display={};for(const field of ['start','end']){
    const label=document.createElement('label');label.textContent=field==='start'?'实际上班':session?.end===null?'实际下班 · 留空则继续上班':'实际下班';
    const input=document.createElement('input');input.type='datetime-local';input.step='60';input.dataset.timeField=field;input.value=values[field]===null?'':dateTimeValue(values[field]);input.required=field==='start'||session?.end!==null;
    if(!container.children.length)input.id=prefix==='correction'?(field==='start'?'correction-time':'correction-end'):`${prefix}-${field}`;
    label.append(input);grid.append(label);display[field]=input.value;
  }row.append(grid);
  if(session?.end===null){const note=document.createElement('p');note.className='fine-print';note.textContent='忘记点下班？填入真实下班时间，预览保存后停止误计。';row.append(note);}
  if(!session){const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent='取消这段补录';remove.addEventListener('click',()=>{row.remove();container.dispatchEvent(new Event('input',{bubbles:true}));});row.append(remove);}
  originals.set(row,{sessionIndex,values,display});container.append(row);return row;
}
export function renderTimeRows(container,options){container.replaceChildren();const sessions=options.day?.sessions??[];if(sessions.length)for(const [index,session]of sessions.entries())appendTimeRow(container,{...options,session,sessionIndex:index});else appendTimeRow(container,options);}
export function readTimeRows(container){return [...container.querySelectorAll('[data-time-row]')].map(row=>{const original=originals.get(row),result={sessionIndex:original.sessionIndex};for(const field of ['start','end']){const value=row.querySelector(`[data-time-field=${field}]`).value;result[field]=value===original.display[field]?original.values[field]:field==='end'&&value===''?null:new Date(value).getTime();}return result;});}
export function feeDecision(prefix){const choice=document.getElementById(`${prefix}-fee-kind`).value;return choice?{kind:choice,amount:choice==='free'?0:Number(document.getElementById(`${prefix}-fee-amount`).value)}:undefined;}
export function initFeeControls(prefix,changed){const choice=document.getElementById(`${prefix}-fee-kind`),amount=document.getElementById(`${prefix}-fee-amount`),label=document.getElementById(`${prefix}-fee-amount-label`);choice.addEventListener('change',()=>{label.hidden=choice.value!=='paid';amount.required=choice.value==='paid';changed?.();});amount.addEventListener('input',()=>changed?.());}

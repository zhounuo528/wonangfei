import {roundedMoney} from './money.mjs';

// Presentation only: callers provide the business direction, never infer it
// from a positive amount (expenses are usually positive too).
export function changeMeaning(before,after,{polarity='higher',hidden=false}={}) {
  if(hidden)return {tone:'hidden',direction:'hidden',delta:null,loss:false};
  if(!Number.isFinite(before)||!Number.isFinite(after))return {tone:'unknown',direction:'unknown',delta:null,loss:Number.isFinite(after)&&roundedMoney(after)<0};
  const delta=roundedMoney(roundedMoney(after)-roundedMoney(before)),direction=delta>0?'increase':delta<0?'decrease':'same';
  const tone=delta===0?'same':polarity==='neutral'?'neutral':(polarity==='lower'?delta<0:delta>0)?'improved':'worsened';
  return {tone,direction,delta,loss:roundedMoney(after)<0};
}
function description(meaning,ctx,polarity) {
  if(meaning.tone==='hidden')return '变化已隐藏';
  if(meaning.tone==='unknown')return '暂无可比数据';
  if(meaning.direction==='same')return '持平';
  const up=meaning.direction==='increase',words=ctx.changeWords??(polarity==='lower'?['多花','少花']:['增加','减少']),word=words[up?0:1];
  return `${up?'↑':'↓'} ${word} ${ctx.money(Math.abs(meaning.delta))}`;
}
export function styleChangeValue(element,before,after,ctx,polarity='higher') {
  const hidden=ctx.state().display==='hidden',meaning=changeMeaning(before,after,{polarity,hidden});
  element.classList.add('change-value');element.classList.toggle('negative-money',!hidden&&meaning.loss);
  element.dataset.changeTone=meaning.tone;element.dataset.changeDirection=meaning.direction;
  element.dataset.changeLabel=description(meaning,ctx,polarity);
  element.setAttribute('aria-label',`${Number.isFinite(after)?ctx.money(after):'—'}，${element.dataset.changeLabel}`);
  return element;
}
export function styleAmount(element,value,ctx) {element.classList.toggle('negative-money',ctx.state().display!=='hidden'&&Number.isFinite(value)&&roundedMoney(value)<0);}
export function moneyChange(label,before,after,ctx,polarity='higher') {
  const span=document.createElement('span'),previous=document.createElement('span'),current=document.createElement('span');
  span.className='money-change';previous.className='change-before';
  previous.textContent=Number.isFinite(before)?ctx.money(before):'—';current.textContent=Number.isFinite(after)?ctx.money(after):'—';
  previous.classList.toggle('negative-money',ctx.state().display!=='hidden'&&Number.isFinite(before)&&roundedMoney(before)<0);
  styleChangeValue(current,before,after,ctx,polarity);span.append(label?`${label} `:'',previous,' → ',current);return span;
}
export function changeLine(parts,ctx) {
  const fragment=document.createDocumentFragment();
  for(const part of parts)fragment.append(typeof part==='string'?part:moneyChange(part.label,part.before,part.after,ctx,part.polarity));
  return fragment;
}
export function paintChange(element,parts,ctx) {element.classList.remove('negative-money');element.replaceChildren(changeLine(parts,ctx));}

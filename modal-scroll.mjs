export function consumeModalWheel(event,dialog){
  if(event.ctrlKey)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(!dialog.contains(event.target))return;
  const body=dialog.querySelector('.batch-body'),path=event.composedPath?.()||[];
  const candidates=[...new Set([...path.filter(el=>el?.classList&&dialog.contains(el)&&(el.classList.contains('batch-preview-wrap')||el.classList.contains('batch-body'))),body].filter(Boolean))];
  const horizontal=Math.abs(event.deltaX)>Math.abs(event.deltaY),axis=horizontal?'scrollLeft':'scrollTop',size=horizontal?'clientWidth':'clientHeight',extent=horizontal?'scrollWidth':'scrollHeight';
  for(const el of candidates){const raw=horizontal?event.deltaX:event.deltaY,delta=raw*(event.deltaMode===1?16:event.deltaMode===2?el[size]:1),limit=Math.max(0,el[extent]-el[size]),current=el[axis];if(delta>0&&current<limit||delta<0&&current>0){el[axis]=Math.max(0,Math.min(limit,current+delta));return}}
}
export function lockModalScroll(dialog){
  const doc=dialog.ownerDocument,view=doc.defaultView,position={x:view.scrollX,y:view.scrollY};
  const saved=[doc.documentElement,doc.body].map(el=>({el,overflow:el.style.getPropertyValue('overflow'),priority:el.style.getPropertyPriority('overflow'),overscroll:el.style.getPropertyValue('overscroll-behavior'),overscrollPriority:el.style.getPropertyPriority('overscroll-behavior')}));
  for(const {el}of saved){el.style.setProperty('overflow','hidden');el.style.setProperty('overscroll-behavior','none')}
  const wheel=event=>consumeModalWheel(event,dialog);view.addEventListener('wheel',wheel,{capture:true,passive:false});let released=false;
  return ()=>{if(released)return;released=true;view.removeEventListener('wheel',wheel,{capture:true});for(const state of saved){for(const [name,value,priority]of [['overflow',state.overflow,state.priority],['overscroll-behavior',state.overscroll,state.overscrollPriority]])if(value)state.el.style.setProperty(name,value,priority);else state.el.style.removeProperty(name)}view.scrollTo(position.x,position.y)};
}

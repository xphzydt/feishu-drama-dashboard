export function lockModalScroll(dialog){
  const doc=dialog.ownerDocument,view=doc.defaultView,position={x:view.scrollX,y:view.scrollY};
  const saved=[doc.documentElement,doc.body].map(el=>({el,overflow:el.style.getPropertyValue('overflow'),priority:el.style.getPropertyPriority('overflow'),overscroll:el.style.getPropertyValue('overscroll-behavior'),overscrollPriority:el.style.getPropertyPriority('overscroll-behavior')}));
  for(const {el}of saved){el.style.setProperty('overflow','hidden');el.style.setProperty('overscroll-behavior','none')}
  let released=false;return ()=>{if(released)return;released=true;for(const state of saved){for(const [name,value,priority]of [['overflow',state.overflow,state.priority],['overscroll-behavior',state.overscroll,state.overscrollPriority]])if(value)state.el.style.setProperty(name,value,priority);else state.el.style.removeProperty(name)}view.scrollTo(position.x,position.y)};
}

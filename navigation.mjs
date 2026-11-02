export function matchPersonalViews(personField,views){
  const destinations=new Map();
  if(!personField||personField.type!==3)return destinations;
  const options=new Map((personField.property?.options||[]).map(option=>[option.id,option.name]));
  const candidates=[];
  for(const view of views){
    if(view.type!==1)continue;
    const conditions=view.filter?.conditions;
    if(!Array.isArray(conditions)||conditions.length!==1)continue;
    const condition=conditions[0];
    if(condition.fieldId!==personField.id||condition.operator!=='is')continue;
    let values=condition.value;
    if(typeof values==='string'){try{values=JSON.parse(values)}catch{continue}}
    if(!Array.isArray(values)||values.length!==1)continue;
    const person=options.get(values[0]);
    if(!person)continue;
    const rank=/[｜|]我的剧集$/.test(view.name)?0:/\(dashboard_view\)$/.test(view.name)?2:1;
    candidates.push({person,view,rank});
  }
  candidates.sort((a,b)=>a.rank-b.rank||a.view.name.localeCompare(b.view.name,'zh-CN'));
  for(const {person,view} of candidates){if(!destinations.has(person))destinations.set(person,{tableId:view.tableId,viewId:view.id})}
  return destinations;
}
export async function resolvePersonalViews(base){
  const table=await base.getTableByName('02 剧集制作');
  const [fields,metas]=await Promise.all([table.getFieldMetaList(),table.getViewMetaList()]);
  const personField=fields.find(field=>field.name==='制作人');
  const views=await Promise.all(metas.filter(view=>view.type===1).map(async meta=>{
    try{const view=await table.getViewById(meta.id);const filter=await view.getFilterInfo();return {...meta,tableId:table.id,filter}}catch{return {...meta,tableId:table.id,filter:null}}
  }));
  return matchPersonalViews(personField,views);
}

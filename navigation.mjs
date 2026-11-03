// Personal views are the source of ring identity and display names.
export function cellText(value){
  if(value==null)return '';
  if(Array.isArray(value))return value.map(cellText).join('');
  if(typeof value==='object')return String(value.text??value.name??'');
  return String(value);
}
function number(value){const result=Number(cellText(value).replace(/,/g,''));if(!Number.isFinite(result)||result<0)throw Error('统计数值异常，请检查源表');return result}
function selectedOption(value){
  if(typeof value==='string'&&value.trim().startsWith('[')){try{value=JSON.parse(value)}catch{return null}}
  if(Array.isArray(value))return value.length===1?selectedOption(value[0]):null;
  return typeof value==='string'?value:null;
}
export function personalOwner(filter,makerField){
  if(!filter?.conditions?.length)return null;
  if(filter.conditions.length>1&&filter.conjunction!=='and')return null;
  const conditions=filter.conditions.filter(item=>item.fieldId===makerField.id);
  if(conditions.length!==1||conditions[0].operator!=='is')return null;
  const selected=selectedOption(conditions[0].value);
  return makerField.property.options.find(option=>option.id===selected||option.name===selected)??null;
}
function schema(fields,roles){const result={};for(const [role,name]of Object.entries(roles)){const field=fields.find(item=>item.name===name);if(!field)throw Error('源表缺少字段：'+name);result[role]=field}return result}
export async function connectProduction(base){
  const [table,ledger]=await Promise.all([base.getTableByName('02 剧集制作'),base.getTableByName('04 积分流水')]);
  const [fields,creditFields]=await Promise.all([table.getFieldMetaList(),ledger.getFieldMetaList()]);
  return {table,ledger,fields:schema(fields,{maker:'制作人',project:'所属项目',episode:'集号',done:'完成集数',seconds:'成片总秒数'}),creditFields:schema(creditFields,{maker:'制作人',credits:'消耗积分',date:'任务创建时间'})};
}
export async function readRecords(table,viewId){
  const records=[];let pageToken;
  do{const page=await table.getRecords({pageSize:500,...(viewId?{viewId}:{}),...(pageToken?{pageToken}:{})});records.push(...page.records);if(page.hasMore&&(page.pageToken==null||page.pageToken===pageToken))throw Error('源表分页不完整');pageToken=page.hasMore?page.pageToken:undefined}while(pageToken!=null);
  return records;
}
function totals(records,fields){return records.reduce((sum,record)=>{const done=number(record.fields[fields.done.id]);if(done!==0&&done!==1)throw Error('完成集数必须为0或1');sum.total++;sum.done+=done;sum.seconds+=number(record.fields[fields.seconds.id]);return sum},{total:0,done:0,seconds:0})}
function episodeRanges(records,fields){
  const groups=new Map();for(const record of records){const project=cellText(record.fields[fields.project.id])||'未命名项目';const episode=number(record.fields[fields.episode.id]);if(!groups.has(project))groups.set(project,new Set());groups.get(project).add(episode)}
  return [...groups].map(([project,episodes])=>{const sorted=[...episodes].sort((a,b)=>a-b),parts=[];for(let i=0;i<sorted.length;i++){const start=sorted[i];let end=start;while(sorted[i+1]===end+1)end=sorted[++i];parts.push(start===end?String(start):start+'—'+end)}return project+'｜第'+parts.join('、')+'集'}).join('；')||'尚未分配剧集';
}
function episodeOrder(records,fields){
  const episodes=records.map(record=>cellText(record.fields[fields.episode.id]).trim()).filter(Boolean).map(Number).filter(value=>Number.isInteger(value)&&value>0);
  return episodes.length?{first:Math.min(...episodes),last:Math.max(...episodes)}:{first:null,last:null};
}
export function compareEpisodeOrder(a,b){
  return (a.episodeOrder.first??Infinity)-(b.episodeOrder.first??Infinity)||(a.episodeOrder.last??Infinity)-(b.episodeOrder.last??Infinity)||a.id.localeCompare(b.id);
}
function ledgerDate(value){
  const text=cellText(value).trim();if(!text)return '未填写日期';
  const timestamp=Number(text);if(!Number.isFinite(timestamp))return '未填写日期';
  const date=new Date(timestamp);if(!Number.isFinite(date.getTime()))return '未填写日期';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const part=type=>parts.find(p=>p.type===type).value;return part('year')+'-'+part('month')+'-'+part('day');
}
export function aggregateCredits(records,fields,personalRows=[]){
  const people=new Map(),days=new Map(),labels=new Map();let total=0;
  for(const row of personalRows)if(!labels.has(row.owner))labels.set(row.owner,row.name);
  for(const record of records){
    const owner=cellText(record.fields[fields.maker.id]).trim()||'未分配制作人';
    const value=number(record.fields[fields.credits.id]),date=ledgerDate(record.fields[fields.date.id]);
    total+=value;people.set(owner,(people.get(owner)||0)+value);
    if(!days.has(date))days.set(date,{date,total:0,byPerson:Object.create(null)});
    const day=days.get(date);day.total+=value;day.byPerson[owner]=(day.byPerson[owner]||0)+value;
  }
  for(const row of personalRows)if(!people.has(row.owner))people.set(row.owner,0);
  return {total,people:[...people].map(([owner,total])=>({owner,name:labels.get(owner)||owner,total})).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'zh-CN')),daily:[...days.values()].sort((a,b)=>b.date.localeCompare(a.date,'zh-CN'))};
}
export async function readProduction(connection){
  const {table,ledger,fields,creditFields}=connection;
  const [views,all,creditRecords]=await Promise.all([table.getViewMetaList(),readRecords(table),readRecords(ledger)]);
  const credits=new Map();for(const record of creditRecords){const name=cellText(record.fields[creditFields.maker.id]);credits.set(name,(credits.get(name)||0)+number(record.fields[creditFields.credits.id]))}
  const personal=[];
  for(const meta of views){
    if(![1,'grid'].includes(meta.type)||/\(dashboard_view\)$/u.test(meta.name))continue;
    const view=await table.getViewById(meta.id);
    const filter=meta.property?.filterInfo===undefined?await view.getFilterInfo():meta.property.filterInfo;
    const owner=personalOwner(filter,fields.maker);
    if(owner)personal.push({meta,owner});
  }
  const rows=await Promise.all(personal.map(async({meta,owner})=>{
    const records=await readRecords(table,meta.id);
    return {id:meta.id,name:meta.name,owner:owner.name,range:episodeRanges(records,fields),episodeOrder:episodeOrder(records,fields),...totals(records,fields),credits:credits.get(owner.name)||0,destination:{tableId:table.id,viewId:meta.id}};
  }));
  rows.sort(compareEpisodeOrder);
  return {rows,team:totals(all,fields),credits:aggregateCredits(creditRecords,creditFields,rows)};
}

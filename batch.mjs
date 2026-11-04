import {cellText,readRecords} from './navigation.mjs';
export const MAX_EPISODES=5000;
const integer=(value,label)=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>MAX_EPISODES)throw Error(label+'须为1—'+MAX_EPISODES+'的整数');return n};
export function splitTitle(value){const text=cellText(value).trim();const m=text.match(/^(.*?)第\s*0*(\d+)\s*集$/u);if(m)return {prefix:m[1].replace(/[\s·・:：—-]+$/gu,'').trim(),episode:Number(m[2])};if(/^\d+$/u.test(text))return {prefix:'',episode:Number(text)};return null}
export function batchSchema(fields){const result={};for(const [key,name,type] of [['title','剧集',1],['episode','集号',2],['maker','制作人',3],['status','制作状态',3]]){const field=fields.find(f=>f.name===name);if(!field||field.type!==type)throw Error('02 剧集制作的“'+name+'”字段类型不符合批量填写要求');result[key]=field}return result}
export async function connectBatch(base){const table=await base.getTableByName('02 剧集制作');return {table,fields:batchSchema(await table.getFieldMetaList())}}
export async function readBatchContext(base){const connection=await connectBatch(base);const records=await readRecords(connection.table);const prefixes=[...new Set(records.map(r=>splitTitle(r.fields[connection.fields.title.id])?.prefix).filter(Boolean))];return {...connection,records,prefixes}}
export function validateInput(input,fields){
  const total=integer(input.total,'总集数'),prefix=String(input.prefix||'').trim();if(prefix.length>100)throw Error('剧名前缀请控制在100字以内');if(!['create','assign'].includes(input.mode))throw Error('请选择操作方式');
  const options=fields.maker.property.options;
  const ranges=(input.ranges||[]).map((range,index)=>{const start=integer(range.start,'第'+(index+1)+'段起始集'),end=integer(range.end,'第'+(index+1)+'段结束集');if(start>end||end>total)throw Error('第'+(index+1)+'段范围须在第1—'+total+'集之间，且起始集不大于结束集');const owner=range.owner?options.find(o=>o.id===range.owner):null;if(range.owner&&!owner)throw Error('制作人名单已变化，请重新打开后选择');return {start,end,owner}}).sort((a,b)=>a.start-b.start);
  for(let i=1;i<ranges.length;i++)if(ranges[i].start<=ranges[i-1].end)throw Error('分工范围存在重叠，请调整后预览');
  if(input.mode==='assign'&&!ranges.some(r=>r.owner))throw Error('请至少选择一段剧集的制作人');
  return {total,prefix,mode:input.mode,ranges};
}
export function makeBatchPlan(input,context){
  const {fields,records}=context,settings=validateInput(input,fields),existing=new Map();
  for(const record of records){const parsed=splitTitle(record.fields[fields.title.id]);if(!parsed||parsed.prefix!==settings.prefix||parsed.episode<1||parsed.episode>settings.total)continue;const n=Number(cellText(record.fields[fields.episode.id]));if(n&&n!==parsed.episode)throw Error('剧集名称与集号不一致：'+cellText(record.fields[fields.title.id])+'，请先核对');if(existing.has(parsed.episode))throw Error('已有重复剧集：第'+parsed.episode+'集，请先核对后再批量操作');existing.set(parsed.episode,record)}
  const creates=[],updates=[],rows=[];let unchanged=0,missing=0;
  const pending=fields.status.property.options.find(o=>o.name==='待制作');if(settings.mode==='create'&&!pending)throw Error('制作状态中缺少“待制作”选项');
  for(let episode=1;episode<=settings.total;episode++){
    const title=(settings.prefix?settings.prefix+' · ':'')+'第'+episode+'集',owner=settings.ranges.find(r=>episode>=r.start&&episode<=r.end)?.owner||null,record=existing.get(episode);let action;
    if(settings.mode==='create'){
      if(record){unchanged++;action='已有，跳过'}else{const values={[fields.title.id]:[{type:'text',text:title}],[fields.episode.id]:episode,[fields.status.id]:{id:pending.id,text:pending.name}};if(owner)values[fields.maker.id]={id:owner.id,text:owner.name};creates.push({fields:values});action='新增'}
    }else if(!record){missing++;action='不存在，跳过'}else if(!owner){unchanged++;action='未指定，不变'}else{
      const current=record.fields[fields.maker.id],currentId=current?.id||fields.maker.property.options.find(o=>o.name===cellText(current))?.id;
      if(currentId===owner.id){unchanged++;action='负责人相同，不变'}else{updates.push({recordId:record.recordId,fields:{[fields.maker.id]:{id:owner.id,text:owner.name}}});action='分配给 '+owner.name}
    }
    rows.push({episode,title,owner:owner?.name||(record?cellText(record.fields[fields.maker.id]):'')||'暂不分配',action});
  }
  return {settings,rows,creates,updates,unchanged,missing,signature:JSON.stringify({creates,updates,previous:updates.map(update=>({id:update.recordId,owner:records.find(r=>r.recordId===update.recordId)?.fields[fields.maker.id]}))})};
}
export async function applyBatchPlan(base,input,preview,onProgress=()=>{}){
  const fresh=await readBatchContext(base),plan=makeBatchPlan(input,fresh);if(plan.signature!==preview.signature)throw Error('表格数据或制作人名单已变化，请重新预览再确认');
  const {table}=fresh,ids=[];let completed=0;
  try{for(const [method,items] of [['addRecords',plan.creates],['setRecords',plan.updates]])for(let i=0;i<items.length;i+=200){const chunk=items.slice(i,i+200);onProgress(completed,plan.creates.length+plan.updates.length);const response=await table[method](chunk);if(!Array.isArray(response)||response.length!==chunk.length)throw Error('本批写入结果未完整返回');ids.push(...response);completed+=chunk.length}
    const verified=await readRecords(table),byId=new Map(verified.map(r=>[r.recordId,r]));
    for(let i=0;i<ids.length;i++){const expected=[...plan.creates,...plan.updates][i],record=byId.get(ids[i]);if(!record)throw Error('暂未读取到刚写入的记录');for(const [id,value]of Object.entries(expected.fields)){const actual=record.fields[id];if(typeof value==='number'?Number(cellText(actual))!==value:value?.id?(actual?.id||Object.values(fresh.fields).find(f=>f.id===id)?.property?.options?.find(o=>o.name===cellText(actual))?.id)!==value.id:cellText(actual)!==cellText(value))throw Error('写入后的字段核验未通过，请检查剧集表')}}
    onProgress(completed,completed);return {created:plan.creates.length,assigned:plan.updates.length,skipped:plan.unchanged+plan.missing,recordIds:ids};
  }catch(error){throw Error('已确认写入 '+completed+' 条。'+(error.message||String(error))+'。请重新预览，已生成的剧集会跳过。')}
}

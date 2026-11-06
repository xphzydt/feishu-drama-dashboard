import {cellText,readRecords} from './navigation.mjs';

export function parseCanvasUrl(value){
  let url;try{url=new URL(String(value).trim())}catch{throw Error('请粘贴完整的即梦画布链接')}
  const match=url.pathname.match(/^\/ai-tool\/ai-canvas\/([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})\/?$/i);
  if(url.protocol!=='https:'||url.hostname!=='jimeng.jianying.com'||url.port||url.username||url.password||!match)throw Error('请使用 jimeng.jianying.com 的画布链接');
  return {id:match[1].toLowerCase(),url:'https://jimeng.jianying.com/ai-tool/ai-canvas/'+match[1].toLowerCase()};
}
const roles={key:'流水编号',maker:'制作人',canvas:'画布名称',date:'任务创建时间',credits:'消耗积分',kind:'任务类型',resource:'资源编号',source:'数据来源'};
export function creditSchema(fields){return Object.fromEntries(Object.entries(roles).map(([role,name])=>{const field=fields.find(f=>f.name===name);if(!field)throw Error('积分流水缺少“'+name+'”字段');return [role,field]}))}
function integer(value,label){const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw Error(label+'异常');return n}
export function validateSnapshot(snapshot,url){
  const canvas=parseCanvasUrl(url);if(snapshot?.canvasId!==canvas.id)throw Error('读取结果与画布链接不一致');
  const count=integer(snapshot.expectedCount,'画布任务数'),expected=integer(snapshot.expectedCredits,'画布总积分');
  if(!Array.isArray(snapshot.items)||snapshot.items.length!==count)throw Error('画布明细未完整读取，原统计已保留');
  const ids=new Set();let total=0;
  for(const item of snapshot.items){if(typeof item.resource_id!=='string'||!item.resource_id||ids.has(item.resource_id))throw Error('画布明细存在重复编号');ids.add(item.resource_id);integer(item.consumed_credits,'消耗积分');if(!Number.isSafeInteger(item.task_created_at)||item.task_created_at<=0)throw Error('任务日期异常');if(!['video.edit','video.generate','image.generate'].includes(item.task_kind))throw Error('画布包含尚未支持的任务类型');total+=item.consumed_credits}
  if(total!==expected)throw Error('明细合计与画布总积分不一致，原统计已保留');
  return {...snapshot,canvasUrl:canvas.url,expectedCount:count,expectedCredits:expected};
}
export function planCreditSync(snapshot,records,fields,owner){
  const name=owner?.name;if(!name)throw Error('当前工作台未绑定制作人');
  const snapshotChecked=validateSnapshot(snapshot,snapshot.canvasUrl),current=new Map(),creates=[],updates=[];
  for(const record of records){if(cellText(record.fields[fields.source.id])!=='即梦画布')continue;const key=cellText(record.fields[fields.key.id]);if(!key)continue;if(current.has(key))throw Error('积分流水存在重复编号，请先核对');current.set(key,record)}
  const option=(field,value)=>{if(field.type!==3)return [{type:'text',text:value}];const found=field.property?.options?.find(o=>o.name===value);if(!found)throw Error('积分流水“'+field.name+'”中缺少选项：'+value);return {id:found.id,text:found.name}};
  const text=value=>[{type:'text',text:String(value)}];
  for(const item of snapshotChecked.items){
    const key=snapshotChecked.canvasId+':'+item.resource_id,old=current.get(key);
    if(old&&cellText(old.fields[fields.maker.id])!==name)throw Error('这个画布已有其他制作人的流水，请核对链接');
    const kind=item.task_kind==='video.edit'?'视频编辑':item.task_kind==='image.generate'?'图片生成':'视频生成';
    const values={[fields.key.id]:text(key),[fields.maker.id]:option(fields.maker,name),[fields.canvas.id]:text(snapshotChecked.canvasName||'即梦画布'),[fields.date.id]:item.task_created_at,[fields.credits.id]:item.consumed_credits,[fields.kind.id]:option(fields.kind,kind),[fields.resource.id]:text(item.resource_id),[fields.source.id]:option(fields.source,'即梦画布')};
    if(!old)creates.push({fields:values});else if(Object.entries(values).some(([id,value])=>cellText(old.fields[id])!==cellText(value)))updates.push({recordId:old.recordId,fields:values});
  }
  return {creates,updates,unchanged:snapshotChecked.items.length-creates.length-updates.length,total:snapshotChecked.expectedCredits};
}
export function savedCanvasLinks(records,fields,owner){
  const ids=new Set();for(const row of records){if(cellText(row.fields[fields.maker.id])!==owner.name||cellText(row.fields[fields.source.id])!=='即梦画布')continue;const id=cellText(row.fields[fields.key.id]).split(':')[0];try{ids.add(parseCanvasUrl('https://jimeng.jianying.com/ai-tool/ai-canvas/'+id).url)}catch{}}
  return [...ids];
}
export async function applyCreditSnapshot({table,snapshot,url,owner,onProgress=()=>{}}){
  snapshot={...validateSnapshot(snapshot,url),canvasUrl:parseCanvasUrl(url).url};const fields=creditSchema(await table.getFieldMetaList());
  const execute=async()=>{const plan=planCreditSync(snapshot,await readRecords(table),fields,owner);let written=0;
    try{for(const [method,items] of [['setRecords',plan.updates],['addRecords',plan.creates]])for(let i=0;i<items.length;i+=100){const chunk=items.slice(i,i+100);onProgress('正在写入 '+written+' / '+(plan.updates.length+plan.creates.length)+' 条');const ids=await table[method](chunk);if(!Array.isArray(ids)||ids.length!==chunk.length)throw Error('写入结果未完整返回');written+=chunk.length}
      const check=planCreditSync(snapshot,await readRecords(table),fields,owner);if(check.creates.length||check.updates.length)throw Error('写入后核对未通过');return {created:plan.creates.length,updated:plan.updates.length,unchanged:plan.unchanged,total:plan.total,count:snapshot.items.length};
    }catch(error){throw Error('本次已确认写入 '+written+' 条。'+error.message+'。再次点击会核对已有编号，不会重复累计。')}
  };
  if(globalThis.navigator?.locks)return navigator.locks.request('jimeng-credits:'+table.id,execute);return execute();
}

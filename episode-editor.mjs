import {cellText,episodeNumber} from './navigation.mjs';
export function normalizeDuration(value){
  const text=String(value??'').trim();if(!text)return '';
  const match=text.match(/^(\d{1,4})(?:[.:：．](\d{1,2}))?$/u);if(!match)throw Error('请填写分.秒，例如2.36或02:36');
  const minutes=Number(match[1]),seconds=Number(match[2]||0);if(seconds>59)throw Error('秒数应在00到59之间，例如2.36');if(minutes===0&&seconds===0)throw Error('成片时长应大于0秒');
  return String(minutes).padStart(2,'0')+':'+String(seconds).padStart(2,'0');
}
export function episodeSchema(metas){return Object.fromEntries(Object.entries({title:'剧集',maker:'制作人',status:'制作状态',date:'完成日期',duration:'成片时长'}).map(([role,name])=>{const field=metas.find(f=>f.name===name);if(!field)throw Error('剧集表缺少“'+name+'”字段');return [role,field]}))}
export function belongsToOwner(record,fields,owner){const value=record.fields[fields.maker.id];return value?.id===owner.id||cellText(value)===owner.name}
export function ownerEpisodes(records,fields,owner){return records.filter(r=>belongsToOwner(r,fields,owner)).sort((a,b)=>(episodeNumber(a.fields[fields.title.id])??Infinity)-(episodeNumber(b.fields[fields.title.id])??Infinity)||cellText(a.fields[fields.title.id]).localeCompare(cellText(b.fields[fields.title.id]),'zh-CN')||a.recordId.localeCompare(b.recordId))}
export function dateText(value){const timestamp=Number(cellText(value));if(!Number.isFinite(timestamp)||!timestamp)return '';const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(timestamp));const part=type=>parts.find(p=>p.type===type).value;return part('year')+'-'+part('month')+'-'+part('day')}
function dateValue(value){if(!value)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('完成日期格式不正确');const timestamp=Date.parse(value+'T00:00:00+08:00');if(!Number.isFinite(timestamp)||dateText(timestamp)!==value)throw Error('完成日期不存在');return timestamp}
function selected(field,name){const option=field.property?.options?.find(o=>o.name===name||o.id===name);if(!option)throw Error('制作状态选项已变化，请刷新');return {id:option.id,text:option.name}}
export function episodeValue(role,value,fields){if(role==='duration')return normalizeDuration(value);if(role==='date')return dateValue(value);if(role==='status')return value?selected(fields.status,value):null;if(role==='title'){const text=String(value??'').trim();if(!text)throw Error('剧集名称不能为空');if(text.length>200)throw Error('剧集名称过长');return text}throw Error('不支持修改这个字段')}
function comparable(role,value){return role==='date'?dateText(value):cellText(value)}
export async function saveEpisodeField({table,fields,owner,recordId,role,value,expectedValue,now=()=>Date.now()}){
  const normalized=episodeValue(role,value,fields),current=await table.getRecordById(recordId);if(!current?.fields)throw Error('这条剧集已不存在，请刷新');if(!belongsToOwner(current,fields,owner))throw Error('这集已分配给其他制作人，未修改');
  const field=fields[role];if(comparable(role,current.fields[field.id])!==comparable(role,expectedValue)&&comparable(role,current.fields[field.id])!==comparable(role,normalized))throw Object.assign(Error('这一格已被其他人修改，请重新填写'),{conflict:true});
  if(comparable(role,current.fields[field.id])===comparable(role,normalized))return {changed:false,fields:current.fields,value:normalized};
  const patch={[field.id]:normalized};if(role==='status'&&cellText(normalized)==='已完成'&&!cellText(current.fields[fields.date.id]))patch[fields.date.id]=now();
  const result=await table.setRecord(recordId,{fields:patch});if(result===false||result==null)throw Error('保存未成功，请重试');
  const updated=await table.getRecordById(recordId);if(!updated?.fields)throw Error('保存已提交，但暂时无法核验，请刷新查看');if(!belongsToOwner(updated,fields,owner)||Object.entries(patch).some(([id,val])=>id===fields.date.id?dateText(updated.fields[id])!==dateText(val):cellText(updated.fields[id])!==cellText(val)))throw Error('保存后核对未通过，请刷新查看');
  return {changed:true,fields:updated.fields,value:normalized};
}

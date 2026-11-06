import {cellText} from './navigation.mjs';
import {episodeSchema,ownerEpisodes,dateText,saveEpisodeField} from './episode-editor.mjs?v=20261106-workbench';
const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el};
export function renderEpisodeTable({table,metas,records,owner,state,onBusy,onChanged,onOpen}){
  const fields=episodeSchema(metas),rows=ownerEpisodes(records,fields,owner);state.cells??=new Map();state.pending??=new Set();
  const card=node('section','overview-card episode-editor'),header=node('div','episode-heading');header.append(node('h2','',owner.name+'｜我的剧集'));
  const source=node('button','episode-source','打开完整表格 ↗');source.type='button';source.onclick=async()=>{try{await onOpen()}catch(error){message.textContent=error.message;message.classList.add('batch-error')}};header.append(source);card.append(header);
  const message=node('p','episode-message',state.message||'点击单元格修改；时长输入2.36，自动保存为02:36。');message.setAttribute('role','status');if(state.error)message.classList.add('batch-error');card.append(message);
  const wrap=node('div','episode-grid-wrap'),grid=node('table','episode-grid');grid.setAttribute('aria-label',owner.name+'的剧集明细');const head=node('thead'),headerRow=node('tr');for(const title of ['#','剧集','制作人','制作状态','完成日期','成片时长'])headerRow.append(node('th','',title));head.append(headerRow);grid.append(head);const body=node('tbody');grid.append(body);wrap.append(grid);card.append(wrap);
  for(const [index,record]of rows.entries()){
    const tr=node('tr');tr.append(node('td','episode-index',String(index+1)));const title=cellText(record.fields[fields.title.id])||'未命名剧集';
    for(const role of ['title','maker','status','date','duration']){
      const td=node('td','episode-'+role);tr.append(td);if(role==='maker'){td.append(node('span','episode-maker',owner.name));continue}
      const key=record.recordId+':'+role;if(!state.cells.has(key))state.cells.set(key,{});const cell=state.cells.get(key),raw=record.fields[fields[role].id];
      const initial=role==='date'?dateText(raw):cellText(raw),input=node(role==='status'?'select':'input','episode-input');input.setAttribute('aria-label',title+'的'+fields[role].name);
      if(role==='status'){for(const option of [{id:'',name:'未设置'},...(fields.status.property?.options||[])]){const el=node('option','',option.name);el.value=option.id;input.append(el)}const value=cell.hasDraft?cell.draft:fields.status.property.options.find(o=>o.id===raw?.id||o.name===cellText(raw))?.id||'';input.value=value;input.classList.add('episode-status-select')}
      else{input.type=role==='date'?'date':'text';input.value=cell.hasDraft?cell.draft:initial;if(role==='duration'){input.inputMode='decimal';input.placeholder='2.36';input.title='分.秒，例如2.36表示2分36秒；保存为02:36'}if(role==='title')input.maxLength=200}
      input.disabled=state.pending.has(record.recordId);if(cell.error){input.setAttribute('aria-invalid','true');input.title=cell.error}td.append(input);
      const startValue=input.value;input.oninput=()=>{cell.hasDraft=true;cell.draft=input.value;cell.error=''};
      async function commit(){if(state.pending.has(record.recordId)||input.value===startValue)return;cell.hasDraft=true;cell.draft=input.value;cell.error='';state.pending.add(record.recordId);onBusy(record.recordId,true);for(const control of tr.querySelectorAll('input,select'))control.disabled=true;message.textContent='正在保存 '+title+'…';message.classList.remove('batch-error');
        try{const result=await saveEpisodeField({table,fields,owner,recordId:record.recordId,role,value:cell.draft,expectedValue:raw});Object.assign(record.fields,result.fields);cell.hasDraft=false;cell.draft=undefined;state.message=title+'已保存';state.error=false}
        catch(error){cell.error=error.message;state.message=error.message;state.error=true;if(error.conflict){cell.hasDraft=false;cell.draft=undefined}}
        finally{state.pending.delete(record.recordId);onBusy(record.recordId,false);await onChanged()}
      }
      if(role==='status'||role==='date')input.onchange=()=>{input.blur();commit()};else{input.onblur=commit;input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();input.blur()}}}
    }body.append(tr);
  }
  if(!rows.length){const tr=node('tr'),td=node('td','episode-empty','暂无分配的剧集');td.colSpan=6;tr.append(td);body.append(tr)}return card;
}

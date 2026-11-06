import {parseCanvasUrl,creditSchema,savedCanvasLinks,applyCreditSnapshot} from './credit-sync.mjs';
import {readRecords} from './navigation.mjs';

const serviceUrl='http://127.0.0.1:19876';
async function connector(canvasUrl){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),180000);
  try{let response;try{response=await fetch(serviceUrl+'/read',{method:'POST',mode:'cors',targetAddressSpace:'loopback',credentials:'omit',headers:{'Content-Type':'application/json','X-Jimeng-Action':'manual-update'},body:JSON.stringify({canvasUrl}),signal:controller.signal})}catch(error){throw Error(error.name==='AbortError'?'读取超时，原积分已保留':'未连接本机服务，请先启动“飞书即梦积分连接”，并允许组件访问本机连接')}
    const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'读取未成功');return result.data;
  }finally{clearTimeout(timeout)}
}
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
export function createCreditControl({table,owner,state,onChanged,onBusy=()=>{}}){
  let discover=false;if(!state.initialized){state.initialized=true;state.storageKey='jimeng-canvas:'+table.id+':'+owner.id;try{const saved=localStorage.getItem(state.storageKey);if(saved){state.url=parseCanvasUrl(saved).url;state.savedUrl=state.url}}catch{}discover=!state.url}
  const card=el('section','overview-card canvas-control'),head=el('div','daily-heading');head.append(el('h2','','即梦画布积分'),el('span','section-note','点击更新，不自动采集'));card.append(head);
  const details=el('details','canvas-link-settings'),summary=el('summary','',state.savedUrl?'更换画布链接':'设置画布链接');details.open=state.linkExpanded??!state.savedUrl;details.ontoggle=()=>{state.linkExpanded=details.open};details.append(summary);
  const label=el('label','canvas-label','画布链接'),input=el('input','canvas-url');input.type='url';input.placeholder='粘贴当前制作人的即梦画布链接';input.setAttribute('aria-label','即梦画布链接');input.value=state.url||'';input.disabled=state.busy;label.append(input);
  const save=el('button','canvas-save','保存链接');save.type='button';save.disabled=state.busy;save.setAttribute('aria-label','保存画布链接');const linkRow=el('div','canvas-controls');linkRow.append(label,save);details.append(linkRow);card.append(details);
  const button=el('button','batch-primary canvas-update',state.busy?'正在更新…':'更新积分');button.type='button';button.disabled=state.busy;card.append(button);
  const status=el('p','canvas-status',state.message||'只读取这个画布；同一条消费不会重复累计。');status.setAttribute('role','status');card.append(status);if(state.error)status.classList.add('batch-error');
  input.oninput=()=>{state.url=input.value;state.linkExpanded=true;state.message='';state.error=false};
  function saveLink(parsed){state.url=parsed.url;state.savedUrl=parsed.url;state.linkExpanded=false;input.value=parsed.url;details.open=false;summary.textContent='更换画布链接';try{localStorage.setItem(state.storageKey,parsed.url)}catch{}}
  function saveEditedLink(){try{saveLink(parseCanvasUrl(input.value));status.textContent='画布链接已保存，点击“更新积分”即可。';status.classList.remove('batch-error');button.focus()}catch(error){status.textContent=error.message;status.classList.add('batch-error');details.open=true}}
  save.onclick=saveEditedLink;input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();saveEditedLink()}};
  async function creditSchemaSource(){const fields=creditSchema(await table.getFieldMetaList()),links=savedCanvasLinks(await readRecords(table),fields,owner);if(!state.url&&links.length===1)saveLink(parseCanvasUrl(links[0]))}
  if(discover)creditSchemaSource().catch(()=>{});
  button.onclick=async()=>{if(state.busy)return;let parsed;try{parsed=parseCanvasUrl(input.value)}catch(error){status.textContent=error.message;status.classList.add('batch-error');details.open=true;return}
    saveLink(parsed);state.busy=true;state.error=false;input.disabled=true;button.disabled=true;save.disabled=true;button.textContent='正在读取…';status.classList.remove('batch-error');status.textContent='正在连接即梦画布…';onBusy(true);
    try{const snapshot=await connector(parsed.url);status.textContent='画布读取完成，正在核对并写入飞书…';const result=await applyCreditSnapshot({table,snapshot,url:parsed.url,owner,onProgress:text=>{status.textContent=text}});state.message='更新完成：'+result.count+'条明细，'+result.total.toLocaleString()+'积分；新增'+result.created+'条，更新'+result.updated+'条。';state.error=false;
    }catch(error){state.message=error.message||'读取未成功，原统计已保留';state.error=true}
    finally{state.busy=false;onBusy(false);await onChanged();}
  };return card;
}

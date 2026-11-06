import {parseCanvasUrl,creditSchema,savedCanvasLinks,applyCreditSnapshot} from './credit-sync.mjs';
import {readRecords} from './navigation.mjs';

const channel='FEISHU_JIMENG_CREDITS_V1';
function connector(action,canvasUrl){return new Promise((resolve,reject)=>{
  const id=crypto.randomUUID(),timeout=setTimeout(()=>finish(Error(action==='PING'?'尚未连接积分组件，请先在当前 Chrome 安装连接组件，再刷新飞书页面':'读取超时，原积分已保留，请确认即梦已登录后重试')),action==='PING'?2000:180000);
  function finish(error,value){clearTimeout(timeout);window.removeEventListener('message',receive);error?reject(error):resolve(value)}
  function receive(event){const d=event.data;if(event.source!==window||event.origin!==location.origin||d?.channel!==channel||d.type!=='RESPONSE'||d.id!==id)return;d.ok?finish(null,d.data):finish(Error(d.error||'读取未成功'))}
  window.addEventListener('message',receive);window.postMessage({channel,type:'REQUEST',id,action,canvasUrl},location.origin);
})}
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
export function createCreditControl({table,owner,state,onChanged,onBusy=()=>{}}){
  const card=el('section','overview-card canvas-control'),head=el('div','daily-heading');head.append(el('h2','','即梦画布积分'),el('span','section-note','点击更新，不自动采集'));card.append(head);
  const label=el('label','canvas-label','画布链接'),input=el('input','canvas-url');input.type='url';input.placeholder='粘贴当前制作人的即梦画布链接';input.setAttribute('aria-label','即梦画布链接');input.value=state.url||'';input.disabled=state.busy;label.append(input);
  const button=el('button','batch-primary',state.busy?'正在更新…':'更新积分');button.type='button';button.disabled=state.busy;const row=el('div','canvas-controls');row.append(label,button);card.append(row);
  const status=el('p','canvas-status',state.message||'只读取这个画布；同一条消费不会重复累计。');status.setAttribute('role','status');card.append(status);if(state.error)status.classList.add('batch-error');
  input.oninput=()=>{state.url=input.value;state.message='';state.error=false};
  if(!state.initialized){state.initialized=true;const storageKey='jimeng-canvas:'+table.id+':'+owner.id;state.storageKey=storageKey;try{state.url=localStorage.getItem(storageKey)||state.url||'';input.value=state.url}catch{}
    if(!state.url)creditSchemaSource().catch(()=>{});
  }
  async function creditSchemaSource(){const fields=creditSchema(await table.getFieldMetaList()),links=savedCanvasLinks(await readRecords(table),fields,owner);if(!state.url&&links.length===1){state.url=links[0];input.value=state.url}}
  button.onclick=async()=>{if(state.busy)return;let parsed;try{parsed=parseCanvasUrl(input.value)}catch(error){status.textContent=error.message;status.classList.add('batch-error');return}
    state.url=parsed.url;state.busy=true;state.error=false;input.disabled=true;button.disabled=true;button.textContent='正在读取…';status.classList.remove('batch-error');status.textContent='正在连接即梦画布…';onBusy(true);
    try{await connector('PING');const snapshot=await connector('READ',parsed.url);status.textContent='画布读取完成，正在核对并写入飞书…';const result=await applyCreditSnapshot({table,snapshot,url:parsed.url,owner,onProgress:text=>{status.textContent=text}});state.message='更新完成：'+result.count+'条明细，'+result.total.toLocaleString()+'积分；新增'+result.created+'条，更新'+result.updated+'条。';try{localStorage.setItem(state.storageKey,parsed.url)}catch{}state.error=false;
    }catch(error){state.message=error.message||'读取未成功，原统计已保留';state.error=true}
    finally{state.busy=false;onBusy(false);await onChanged();}
  };
  return card;
}

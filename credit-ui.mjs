import {parseCanvasUrl,creditSchema,savedCanvasLinks,applyCreditSnapshot} from './credit-sync.mjs';
import {readRecords} from './navigation.mjs';

const serviceUrl='http://127.0.0.1:19876';
const connectionKey='jimeng-local-connection-v2';
async function connector(canvasUrl){
  let token='';try{token=localStorage.getItem(connectionKey)||''}catch{}
  if(!token)throw Error('首次使用，请展开“本机连接设置”填写一次连接码');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),180000);
  try{let response;try{response=await fetch(serviceUrl+'/read',{method:'POST',mode:'cors',targetAddressSpace:'loopback',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({canvasUrl}),signal:controller.signal})}catch(error){throw Error(error.name==='AbortError'?'读取超时，原积分已保留':'未连接本机服务，请先启动“飞书即梦积分连接”，并允许组件访问本机连接')}
    const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'读取未成功');return result.data;
  }finally{clearTimeout(timeout)}
}
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
export function createCreditControl({table,owner,state,onChanged,onBusy=()=>{}}){
  const card=el('section','overview-card canvas-control'),head=el('div','daily-heading');head.append(el('h2','','即梦画布积分'),el('span','section-note','点击更新，不自动采集'));card.append(head);
  const label=el('label','canvas-label','画布链接'),input=el('input','canvas-url');input.type='url';input.placeholder='粘贴当前制作人的即梦画布链接';input.setAttribute('aria-label','即梦画布链接');input.value=state.url||'';input.disabled=state.busy;label.append(input);
  const button=el('button','batch-primary',state.busy?'正在更新…':'更新积分');button.type='button';button.disabled=state.busy;const row=el('div','canvas-controls');row.append(label,button);card.append(row);
  const status=el('p','canvas-status',state.message||'只读取这个画布；同一条消费不会重复累计。');status.setAttribute('role','status');card.append(status);if(state.error)status.classList.add('batch-error');
  const settings=el('details','canvas-settings'),summary=el('summary','','本机连接设置（首次填写一次）');settings.append(summary);
  const connectionLabel=el('label','canvas-label','连接码'),code=el('input','canvas-url');code.type='password';code.autocomplete='off';code.placeholder='填写本机连接码';code.setAttribute('aria-label','本机连接码');try{code.value=localStorage.getItem(connectionKey)||''}catch{}connectionLabel.append(code);
  const save=el('button','batch-primary','保存连接');save.type='button';const configRow=el('div','canvas-controls');configRow.append(connectionLabel,save);settings.append(configRow,el('p','section-note','只需在这台电脑设置一次。更新时保持 Chrome 运行并已登录即梦，无需打开飞书网页版。'));card.append(settings);
  save.onclick=()=>{if(!/^[A-Za-z0-9_-]{32}$/.test(code.value.trim())){status.textContent='连接码格式不正确，请使用本机服务提供的连接码';status.classList.add('batch-error');return}try{localStorage.setItem(connectionKey,code.value.trim());status.textContent='本机连接已保存，现在可点击“更新积分”。';status.classList.remove('batch-error');settings.open=false}catch{status.textContent='无法保存连接设置，请检查客户端存储权限'}};
  input.oninput=()=>{state.url=input.value;state.message='';state.error=false};
  if(!state.initialized){state.initialized=true;const storageKey='jimeng-canvas:'+table.id+':'+owner.id;state.storageKey=storageKey;try{state.url=localStorage.getItem(storageKey)||state.url||'';input.value=state.url}catch{}
    if(!state.url)creditSchemaSource().catch(()=>{});
  }
  async function creditSchemaSource(){const fields=creditSchema(await table.getFieldMetaList()),links=savedCanvasLinks(await readRecords(table),fields,owner);if(!state.url&&links.length===1){state.url=links[0];input.value=state.url}}
  button.onclick=async()=>{if(state.busy)return;let parsed;try{parsed=parseCanvasUrl(input.value)}catch(error){status.textContent=error.message;status.classList.add('batch-error');return}
    state.url=parsed.url;state.busy=true;state.error=false;input.disabled=true;button.disabled=true;button.textContent='正在读取…';status.classList.remove('batch-error');status.textContent='正在连接即梦画布…';onBusy(true);
    try{const snapshot=await connector(parsed.url);status.textContent='画布读取完成，正在核对并写入飞书…';const result=await applyCreditSnapshot({table,snapshot,url:parsed.url,owner,onProgress:text=>{status.textContent=text}});state.message='更新完成：'+result.count+'条明细，'+result.total.toLocaleString()+'积分；新增'+result.created+'条，更新'+result.updated+'条。';try{localStorage.setItem(state.storageKey,parsed.url)}catch{}state.error=false;
    }catch(error){state.message=error.message||'读取未成功，原统计已保留';state.error=true}
    finally{state.busy=false;onBusy(false);await onChanged();}
  };
  return card;
}

import {renderEpisodeTable} from './workbench.mjs?v=20261106-workbench';
import {createCreditControl} from './credit-ui.mjs?v=20261106-workbench';
import {openBatchGenerator} from './batch-ui.mjs';
import {bitable,dashboard,DashboardState,Rollup,SourceType} from './sdk.mjs';
import {formatDuration,renderOverview,renderPersonal} from './render.mjs?v=20261106-workbench';
import {connectProduction,readProduction} from './navigation.mjs?v=20261106-workbench';
const app=document.querySelector('#app');
const params=new URLSearchParams(location.search);
const hostParams=new URLSearchParams(location.hash.slice(location.hash.indexOf('?')));
const surface=params.get('surface')||(['isCreate','isConfig','isFullScreen'].some(key=>hostParams.get(key)==='1')?'dashboard':'sidebar');
const embedded=window.parent!==window;
let mode=['duration','personal'].includes(params.get('widget'))?params.get('widget'):'rings';let owner=params.get('owner')||'';let video=null;
let configuring=surface==='dashboard'&&[DashboardState.Create,DashboardState.Config].includes(dashboard.state);
let connection=null,source=null,people=null,error='',busy=false,unsubscribers=[];
let destinations=new Map(),team=null,credits=null;
const detailState={month:"all",owner:"all"};
let dataSignature="";let componentVisible=true;const activeWrites=new Set(),creditStates=new Map(),editorStates=new Map();let episodeRecords=[];
function setWriteBusy(key,value){if(value)activeWrites.add(key);else activeWrites.delete(key)}
async function openPerson(destination){try{const opened=await timed(bitable.ui.switchToView(destination.tableId,destination.viewId),'打开个人剧集');if(!opened)throw Error('无法打开个人视图，请检查访问权限')}catch(error){bitable.ui.showToast({toastType:'error',message:error.message}).catch(()=>{});throw error}}
async function timed(promise,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+'超时，请在飞书内刷新插件')),12000)})])}finally{clearTimeout(timer)}}
function makeCondition(connection){const fields=connection.fields;return {tableId:connection.table.id,dataRange:{type:SourceType.ALL},groups:[{fieldId:fields.maker.id}],series:[fields.done.id,fields.seconds.id].map(fieldId=>({fieldId,rollup:Rollup.SUM}))}}
function element(tag,cls,text){const el=document.createElement(tag);el.className=cls;el.textContent=text;return el}
function draw(){app.replaceChildren();if(configuring){const bar=element('div','config','');bar.append(element('strong','','短剧制作实时统计'));const select=document.createElement('select');select.setAttribute('aria-label','展示类型');for(const [value,label] of [['duration','已完成总时长'],['rings','制作总看板'],['personal','个人视频产出']]){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option)}select.value=mode;select.onchange=async()=>{mode=select.value;show()};const ownerSelect=document.createElement('select');ownerSelect.setAttribute('aria-label','工作台制作人');for(const option of connection?.fields.maker.property?.options||[]){const el=document.createElement('option');el.value=option.id;el.textContent=option.name;ownerSelect.append(el)}if(!owner)owner=ownerSelect.options?.[0]?.value||'';ownerSelect.value=owner;ownerSelect.onchange=()=>{owner=ownerSelect.value;show()};if(mode==='personal')bar.append(ownerSelect);const save=element('button','','添加到看板');save.disabled=busy||!source||!!error||!people;save.onclick=async()=>{save.disabled=true;try{if(!await timed(dashboard.saveConfig({dataConditions:[source],customConfig:{mode,owner}}),'保存组件'))throw Error('配置未保存，请重试');configuring=false;await initialize()}catch(e){error=e.message;show()}};bar.append(select,save);app.append(bar)}
if(embedded&&mode==='rings'&&!configuring){const tools=element('div','app-tools',''),launch=element('button','batch-launch','批量生成 / 分配剧集');launch.type='button';launch.onclick=()=>openBatchGenerator({base:bitable.base,onChanged:()=>initialize()});tools.append(launch);app.append(tools)}const content=element('section','content '+mode,'');app.append(content);if(error)content.append(element('div','error','暂时无法读取实时数据：'+error));else if(!people)content.append(element('div','loading','正在读取实时数据…'));else if(mode==='duration'){const value=team.seconds;content.append(element('div','metric-title','已完成总时长'),element('div','metric-value',formatDuration(value)))}else if(mode==='personal'){const person=connection.fields.maker.property.options.find(p=>p.id===owner);let creditControl;if(person){const key=connection.ledger.id+':'+owner;if(!creditStates.has(key))creditStates.set(key,{});creditControl=createCreditControl({table:connection.ledger,owner:person,state:creditStates.get(key),onBusy:value=>setWriteBusy('credits',value),onChanged:async()=>{await refresh();show()}})}const layout=element('div','personal-workbench','');if(person){const editorKey=connection.table.id+':'+owner;if(!editorStates.has(editorKey))editorStates.set(editorKey,{});const destination=people.find(row=>row.owner===person.name)?.destination;layout.append(renderEpisodeTable({table:connection.table,metas:connection.episodeFields,records:episodeRecords,owner:person,state:editorStates.get(editorKey),onBusy:(key,value)=>setWriteBusy('episode:'+key,value),onChanged:async()=>{await refresh();show()},onOpen:()=>destination?openPerson(destination):Promise.reject(Error('请先建立该制作人的个人视图'))}))}layout.append(renderPersonal({rows:people,team,credits,video},owner,creditControl));content.append(layout);}else content.append(renderOverview({rows:people,team,credits,video},{destinations,onOpen:openPerson},detailState));if(people&&!error)app.append(element('div','stamp','原表实时统计 · '+new Date().toLocaleTimeString('zh-CN',{hour12:false})));}
function show(){
  const scroll={x:window.scrollX||0,y:window.scrollY||0};
  const detailScroll=app.querySelector?.('.daily-table-wrap')?.scrollTop||0;
  const focusLabel=document.activeElement?.getAttribute?.('aria-label');
  try{draw()}catch(e){error=e.message;people=null;draw()}finally{
    const detail=app.querySelector?.('.daily-table-wrap');if(detail)detail.scrollTop=detailScroll;
    if(focusLabel)for(const select of app.querySelectorAll?.('select,input')||[])if(select.getAttribute('aria-label')===focusLabel)select.focus({preventScroll:true});
    window.scrollTo?.(scroll.x,scroll.y);
    if(embedded&&surface==='dashboard')dashboard.setRendered().catch(()=>{});
  }
}
async function refresh(){
  if(busy||!connection||activeWrites.size||!componentVisible||app.querySelector('.episode-editor .episode-input:focus'))return;busy=true;let changed=false;
  try{const result=await timed(readProduction(connection),'读取个人视图');const signature=JSON.stringify(result);changed=signature!==dataSignature||!!error||!people;people=result.rows;team=result.team;credits=result.credits;video=result.video;episodeRecords=result.episodes;destinations=new Map(people.map(person=>[person.id,person.destination]));dataSignature=signature;error=''}
  catch(e){error=e.message||String(e);people=null;changed=true}
  finally{busy=false;if(changed)show();else{const stamp=app.querySelector?.('.stamp');if(stamp)stamp.textContent='原表实时统计 · '+new Date().toLocaleTimeString('zh-CN',{hour12:false})}}
}
async function initialize(){try{unsubscribers.forEach(stop=>stop());unsubscribers=[];dataSignature="";if(surface==='dashboard'&&!configuring){const config=await timed(dashboard.getConfig(),'读取组件配置');mode=config?.customConfig?.mode||mode;owner=config?.customConfig?.owner||owner}connection=await timed(connectProduction(bitable.base),'连接剧集与积分源表');source=makeCondition(connection);for(const table of [connection.table,connection.ledger])for(const event of ['onRecordAdd','onRecordModify','onRecordDelete'])unsubscribers.push(table[event](()=>refresh()));error='';await refresh()}catch(e){error=e.message||String(e);people=null;show()}}
function applyTheme(){document.documentElement.style.setProperty('--bg','#090909');document.documentElement.style.setProperty('--fg','#ffffff')}
if(embedded){if(surface==='dashboard'){dashboard.onDataChange(()=>refresh());dashboard.onConfigChange(()=>initialize());dashboard.onThemeChange(event=>applyTheme(event.data));dashboard.getTheme().then(applyTheme).catch(()=>{})}else bitable.base.onPermissionChange(()=>initialize());show();if(typeof IntersectionObserver!=='undefined'){const visibility=new IntersectionObserver(entries=>{const wasVisible=componentVisible;componentVisible=entries.some(entry=>entry.isIntersecting);if(componentVisible&&!wasVisible)refresh()});visibility.observe(document.documentElement)}initialize();setInterval(()=>{if(componentVisible&&document.visibilityState==='visible')refresh()},10000)}else{error='请从飞书多维表格的插件入口打开，单独打开网址不能读取表格';show()}

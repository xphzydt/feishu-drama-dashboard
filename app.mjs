import {openBatchGenerator} from './batch-ui.mjs';
import {bitable,dashboard,DashboardState,Rollup,SourceType} from './sdk.mjs';
import {formatDuration,renderOverview} from './render.mjs';
import {connectProduction,readProduction} from './navigation.mjs';
const app=document.querySelector('#app');
const params=new URLSearchParams(location.search);
const hostParams=new URLSearchParams(location.hash.slice(location.hash.indexOf('?')));
const surface=params.get('surface')||(['isCreate','isConfig','isFullScreen'].some(key=>hostParams.get(key)==='1')?'dashboard':'sidebar');
const embedded=window.parent!==window;
let mode=params.get('widget')==='duration'?'duration':'rings';
let configuring=surface==='dashboard'&&[DashboardState.Create,DashboardState.Config].includes(dashboard.state);
let connection=null,source=null,people=null,error='',busy=false,unsubscribers=[];
let destinations=new Map(),team=null,credits=null;
const detailState={month:"all",owner:"all"};
let dataSignature="";
async function openPerson(destination){try{const opened=await timed(bitable.ui.switchToView(destination.tableId,destination.viewId),'打开个人剧集');if(!opened)throw Error('无法打开个人视图，请检查访问权限')}catch(error){bitable.ui.showToast({toastType:'error',message:error.message}).catch(()=>{});throw error}}
async function timed(promise,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+'超时，请在飞书内刷新插件')),12000)})])}finally{clearTimeout(timer)}}
function makeCondition(connection){const fields=connection.fields;return {tableId:connection.table.id,dataRange:{type:SourceType.ALL},groups:[{fieldId:fields.maker.id}],series:[fields.done.id,fields.seconds.id].map(fieldId=>({fieldId,rollup:Rollup.SUM}))}}
function element(tag,cls,text){const el=document.createElement(tag);el.className=cls;el.textContent=text;return el}
function draw(){app.replaceChildren();if(configuring){const bar=element('div','config','');bar.append(element('strong','','短剧制作实时统计'));const select=document.createElement('select');select.setAttribute('aria-label','展示类型');for(const [value,label] of [['duration','已完成总时长'],['rings','制作总看板']]){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option)}select.value=mode;select.onchange=async()=>{mode=select.value;show()};const save=element('button','','添加到看板');save.disabled=busy||!source||!!error||!people;save.onclick=async()=>{save.disabled=true;try{if(!await timed(dashboard.saveConfig({dataConditions:[source],customConfig:{mode}}),'保存组件'))throw Error('配置未保存，请重试');configuring=false;await initialize()}catch(e){error=e.message;show()}};bar.append(select,save);app.append(bar)}
if(embedded&&mode==='rings'&&!configuring){const tools=element('div','app-tools',''),launch=element('button','batch-launch','批量生成 / 分配剧集');launch.type='button';launch.onclick=()=>openBatchGenerator({base:bitable.base,onChanged:()=>initialize()});tools.append(launch);app.append(tools)}const content=element('section','content '+mode,'');app.append(content);if(error)content.append(element('div','error','暂时无法读取实时数据：'+error));else if(!people)content.append(element('div','loading','正在读取实时数据…'));else if(mode==='duration'){const value=team.seconds;content.append(element('div','metric-title','已完成总时长'),element('div','metric-value',formatDuration(value)))}else content.append(renderOverview({rows:people,team,credits},{destinations,onOpen:openPerson},detailState));if(people&&!error)app.append(element('div','stamp','原表实时统计 · '+new Date().toLocaleTimeString('zh-CN',{hour12:false})));}
function show(){
  const scroll={x:window.scrollX||0,y:window.scrollY||0};
  const detailScroll=app.querySelector?.('.daily-table-wrap')?.scrollTop||0;
  const focusLabel=document.activeElement?.getAttribute?.('aria-label');
  try{draw()}catch(e){error=e.message;people=null;draw()}finally{
    const detail=app.querySelector?.('.daily-table-wrap');if(detail)detail.scrollTop=detailScroll;
    if(focusLabel)for(const select of app.querySelectorAll?.('select')||[])if(select.getAttribute('aria-label')===focusLabel)select.focus({preventScroll:true});
    window.scrollTo?.(scroll.x,scroll.y);
    if(embedded&&surface==='dashboard')dashboard.setRendered().catch(()=>{});
  }
}
async function refresh(){
  if(busy||!connection)return;busy=true;let changed=false;
  try{const result=await timed(readProduction(connection),'读取个人视图');const signature=JSON.stringify(result);changed=signature!==dataSignature||!!error||!people;people=result.rows;team=result.team;credits=result.credits;destinations=new Map(people.map(person=>[person.id,person.destination]));dataSignature=signature;error=''}
  catch(e){error=e.message||String(e);people=null;changed=true}
  finally{busy=false;if(changed)show();else{const stamp=app.querySelector?.('.stamp');if(stamp)stamp.textContent='原表实时统计 · '+new Date().toLocaleTimeString('zh-CN',{hour12:false})}}
}
async function initialize(){try{unsubscribers.forEach(stop=>stop());unsubscribers=[];dataSignature="";if(surface==='dashboard'&&!configuring){const config=await timed(dashboard.getConfig(),'读取组件配置');mode=config?.customConfig?.mode||mode}connection=await timed(connectProduction(bitable.base),'连接剧集与积分源表');source=makeCondition(connection);for(const table of [connection.table,connection.ledger])for(const event of ['onRecordAdd','onRecordModify','onRecordDelete'])unsubscribers.push(table[event](()=>refresh()));error='';await refresh()}catch(e){error=e.message||String(e);people=null;show()}}
function applyTheme(theme){if(theme?.chartBgColor)document.documentElement.style.setProperty('--bg',theme.chartBgColor);if(theme?.labelColorTokenList?.[0])document.documentElement.style.setProperty('--fg',theme.labelColorTokenList[0]);}
if(embedded){if(surface==='dashboard'){dashboard.onDataChange(()=>refresh());dashboard.onConfigChange(()=>initialize());dashboard.onThemeChange(event=>applyTheme(event.data));dashboard.getTheme().then(applyTheme).catch(()=>{})}else bitable.base.onPermissionChange(()=>initialize());show();initialize();setInterval(()=>{if(document.visibilityState==='visible')refresh()},10000)}else{error='请从飞书多维表格的插件入口打开，单独打开网址不能读取表格';show()}

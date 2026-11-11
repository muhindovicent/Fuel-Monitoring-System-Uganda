import {api,setCsrf,escapeHtml as esc,money,date} from './api.js';
import {icon,services} from './ui.js';
import {discoveryMarkup,mountDiscovery,freshPrice} from './discovery.js';
import {workspaceFor} from './access.js';
import {loadLeaflet} from './leaflet.js';
import {mediaManagementMarkup,mountMediaManagement} from './media-management.js';
import {newsCard,imageCard,videoCard,videoPlayer,homepagePublishing,photoCarousel} from './media-content.js';
import {mountPasswordToggles,resetPasswordVisibility} from './password-toggle.js';

const $=selector=>document.querySelector(selector);
const state={user:null,summary:null,page:'overview',adminTab:'dashboard',room:null,stations:[],assigned:[],ticket:null,authMode:'login',offset:0,activityOffset:0,adminOffset:0,filters:{q:'',district:'',fuel:'petrol',sort:'price',radius:'10'},position:null,carouselIndex:0,bootError:null};
let map,discovery,mediaManager,toastTimer,routeVersion=0;
const isStaff=()=>['admin','inspector'].includes(state.user?.role);
const isAdmin=()=>state.user?.role==='admin';
const empty=text=>`<div class="empty">${esc(text)}</div>`;
const badge=(text,kind=text)=>`<span class="badge ${esc(kind)}">${esc(text)}</span>`;
const heading=(title,description,eyebrow='MAFUTAWATCH UGANDA')=>`<div class="page-heading"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p>${esc(description)}</p></div></div>`;
const metric=(value,label,warning=false)=>`<div class="metric workspace-metric${warning?' warning':''}"><span class="workspace-metric-icon">${icon(warning?'clock':'chart')}</span><strong>${esc(value??'—')}</strong><span class="label">${esc(label)}</span></div>`;
const field=(label,name,{type='text',required=true,value='',min,max,step,maxlength=200,placeholder=''}={})=>`<label>${esc(label)}<input name="${esc(name)}" type="${type}" ${required?'required':''} value="${esc(value)}" ${min!==undefined?`${['number','date','datetime-local'].includes(type)?'min':'minlength'}="${min}"`:''} ${max!==undefined?`max="${max}"`:''} ${step?`step="${step}"`:''} ${type==='password'?`autocomplete="${['newPassword','password','confirmPassword'].includes(name)?'new-password':'current-password'}"`:''} maxlength="${maxlength}" placeholder="${esc(placeholder)}"></label>`;
const select=(label,name,options,selected='',required=true)=>`<label>${esc(label)}<select name="${name}" aria-label="${esc(label)}" ${required?'required':''}>${options.map(([value,text])=>`<option value="${esc(value)}" ${String(value)===String(selected)?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`;
const fuelOptions=[['petrol','Petrol'],['diesel','Diesel'],['kerosene','Kerosene']];
const fuelField=(selected='petrol')=>select('Fuel type','fuel',fuelOptions,selected);
const priceField=()=>field('Price (UGX per litre)','price',{type:'number',min:100,max:100000,step:1});
const textarea=(label,name,{min=1,max=3000}={})=>`<label>${esc(label)}<textarea name="${name}" required minlength="${min}" maxlength="${max}" rows="3"></textarea></label>`;
const formEnd=text=>`<p class="form-error" role="alert"></p><button class="primary" type="submit">${esc(text)}</button>`;
const stationSelect=(items=state.stations,selected='')=>select('Fuel station','stationId',[['','Select a station'],...items.map(s=>[s.id,`${s.name} · ${s.district}${s.demo?' (demo)':''}`])],selected);
const evidenceInput=()=>'<label>Evidence (optional, up to 3 files, 5 MiB each)<input name="evidence" type="file" multiple accept="image/png,image/jpeg,application/pdf"></label><p class="small">Evidence is private to you and authorized case reviewers. Remove personal information that is not relevant.</p>';
function showError(error){$('#errorBanner').textContent=error.message;$('#errorBanner').hidden=false;if(error.status===401){state.user=null;updateAccount();} }
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('#toast').hidden=true;},6000);}
function updateAccount(){
  document.body.classList.toggle('signed-in',Boolean(state.user));
  $('#accountButton').textContent=state.user?`${state.user.display_name} · ${state.user.role}`:'Sign in';
  $('#accountButton').dataset.action=state.user?'account':'auth';$('#logoutButton').hidden=!state.user;
  $('[data-page="admin"]').hidden=!['admin','inspector','analyst'].includes(state.user?.role);
  $('[data-page="operator"]').hidden=Boolean(state.user)&&!['citizen','operator','admin'].includes(state.user.role);
  if(state.workspaceRole!==state.user?.role){state.adminTab=state.user?.role==='analyst'?'intelligence':'dashboard';state.caseAssignment=state.user?.role==='inspector'?'mine':'all';state.caseStatus='';state.analyticsFuel=null;state.operatorStationId=null;state.workspaceRole=state.user?.role;applySavedWorkspacePreferences();}
  $('#registerButton').hidden=Boolean(state.user);
  const workspace=workspaceFor(state.user?.role);
  $('#workspaceLink').href=`#${workspace.page}`;
  $('#workspaceLink').title=workspace.title;
  $('#primaryNavigation .mobile-only[href]').href=`#${workspace.page}`;
  $('#stakeholderAccess').hidden=Boolean(state.user);
  $('#notificationButton').hidden=!state.user;
  const names={citizen:'Citizen services',operator:'Station operations',inspector:'Case management',analyst:'Market analysis',admin:'Platform administration'};
  $('#workspaceRole').textContent=names[state.user?.role]||'Citizen services';
  $('#workspaceName').textContent=state.user?.display_name||'Welcome to MafutaWatch';
  $('#workspaceIdentity').textContent=state.user?`${state.user.role} account`:'Sign in to contribute';
  $('#accountAvatar').textContent=(state.user?.display_name||'M').slice(0,1).toUpperCase();
  if(!state.user){state.preferences=null;state.notifications=[];updateNotificationBadge();}
}
function applySavedWorkspacePreferences(){
  const settings=state.preferences?.roleSettings??{},role=state.user?.role;
  if(role==='admin'&&settings.dashboardPreferences&&settings.lastAdminTab)state.adminTab=settings.lastAdminTab;
  if(role==='inspector'&&settings.workspacePreferences){if(settings.lastCaseStatus!==undefined)state.caseStatus=settings.lastCaseStatus;if(settings.lastCaseAssignment)state.caseAssignment=settings.lastCaseAssignment;}
  if(role==='analyst'&&settings.savedChartFilters&&settings.lastFuelView)state.analyticsFuel=settings.lastFuelView;
  if(role==='operator'&&settings.assignedStationDashboard&&settings.lastStationId)state.operatorStationId=settings.lastStationId;
}
async function loadPreferences(){
  state.preferences=null;if(!state.user)return;
  const userId=state.user.id,result=await api('/me/preferences');
  if(state.user?.id===userId)state.preferences=result.preferences;
}
async function rememberSetting(role,partial){
  const toggle={admin:'dashboardPreferences',inspector:'workspacePreferences',analyst:'savedChartFilters',operator:'assignedStationDashboard'}[role];
  if(state.user?.role!==role||state.preferences?.roleSettings?.[toggle]!==true)return;
  const userId=state.user.id;
  await api('/me/preferences',{method:'PATCH',body:{roleSettings:partial}});
  if(state.user?.id===userId)state.preferences.roleSettings={...state.preferences.roleSettings,...partial};
}
function updateNotificationBadge(){const unread=(state.notifications||[]).filter(n=>!n.read_at).length;$('#notificationCount').textContent=unread;$('#notificationCount').hidden=!unread;$('#notificationButton').setAttribute('aria-label',unread?`Notifications, ${unread} unread in the latest 100`:'Notifications');}
async function refreshNotifications(){if(!state.user)return;const userId=state.user.id;const result=await api('/me/notifications');if(state.user?.id!==userId)return;state.notifications=result.items;updateNotificationBadge();}
async function notificationDialog(){if(!authRequired())return;await refreshNotifications();if(!state.user)return;$('#detailTitle').textContent='Notifications';$('#detailContent').innerHTML=`<p class="small">Your latest in-app updates. No external delivery is implied.</p><div class="notification-list">${(state.notifications||[]).slice(0,10).map(n=>`<article class="notification-item ${n.read_at?'':'unread'}"><span class="notification-icon">${icon('bell')}</span><div>${n.read_at?'':badge('Unread','pending')}<p>${esc(n.message)}</p><small>${date(n.created_at)}</small></div></article>`).join('')||empty('No updates yet. Follow a station to receive price-change notifications.')}</div><div class="actions"><button data-action="read-notifications">Mark displayed notifications read</button><a class="button primary" href="#activity" data-action="close-detail">View my activity ${icon('arrow')}</a></div>`;$('#detailDialog').showModal();}
function authRequired(){if(state.user)return true;openAuth();return false;}
function openAuth(mode='login'){if($('#detailDialog').open)$('#detailDialog').close();state.authMode=mode;renderAuth();$('#authDialog').showModal();}
function renderAuth(){
  const register=state.authMode==='register',staff=state.authMode==='staff';$('#authTitle').textContent=register?'Create a citizen account':staff?'Authorized Staff Sign In':'Sign in';
  $('#authHint').textContent=register?'Registration creates a citizen account only. Operator access requires a separate application and approval.':staff?'For existing administrators, inspectors and analysts. The same secure sign-in checks your assigned account role; this form cannot grant staff access.':'Use your existing account. You will be directed to the workspace authorized by your account role.';
  $('#registerToggle').hidden=staff;
  $('#nameLabel').hidden=!register;$('#nameLabel input').required=register;
  $('#consentLabel').hidden=!register;$('#consentLabel input').required=register;
  $('#authForm button[type=submit]').textContent=register?'Create account':'Sign in';
  const password=$('#authForm [name=password]');password.minLength=register?12:1;password.autocomplete=register?'new-password':'current-password';
  $('#registerToggle').textContent=register?'Already registered? Sign in':'Create a citizen account';$('#authError').textContent='';
  resetPasswordVisibility($('#authForm'));mountPasswordToggles($('#authForm'));
}
async function loadDirectory(){
  // Forms need the full approved register, not just a silently truncated first page.
  const stations=[];
  for(let offset=0;;offset+=100){const batch=await api(`/stations?limit=100&offset=${offset}`);stations.push(...batch.items);if(batch.items.length<100)break;}
  state.stations=stations;return stations;
}
async function loadStationBatch(offset=0){return (await api(`/stations?limit=100&offset=${offset}`)).items;}
function syncDemoBanner(){
  const banner=$('#demoBanner'),demo=Boolean(state.summary?.demo_stations);
  if(state.page==='overview'){banner.hidden=false;banner.style.visibility=demo?'visible':'hidden';}
  else{banner.style.visibility='';banner.hidden=!demo;}
}
async function summary(){
  state.summary=await api('/summary');
  syncDemoBanner();
  $('#connection').textContent=`Updated ${new Date().toLocaleTimeString('en-UG',{timeZone:'Africa/Kampala',hour:'2-digit',minute:'2-digit'})} EAT`;
}
function skeletonFill(label){return `<div class="loading-surface"><p class="loading-message" role="status">${esc(label)}</p><div aria-hidden="true"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div></div>`;}
function advisoryGrid(notices){return notices.slice(0,3).map(a=>`<article class="card advisory-card"><span class="advisory-label">${icon('report')}SOURCE LINKED</span><h3>${esc(a.title)}</h3><p class="clamp-three">${esc(a.body)}</p><small>${date(a.created_at)} · ${esc(a.author)}</small><a class="text-link" href="${esc(a.source_url)}" target="_blank" rel="noopener noreferrer">Read original source ${icon('arrow')}</a></article>`).join('')||`<div class="empty advisory-empty">${icon('bell')}<h3>No published advisories yet</h3><p>Source-linked releases will appear here when a platform administrator publishes them.</p><a href="#advisories">Explore advisories & town halls →</a></div>`;}
function overviewShell(){
  return `<section class="portal-hero" aria-labelledby="heroTitle">
    <img class="hero-photograph" src="/assets/kampala-road.jpg" srcset="/assets/kampala-road-960.jpg 960w, /assets/kampala-road-1280.jpg 1280w, /assets/kampala-road-1600.jpg 1600w, /assets/kampala-road.jpg 1920w" sizes="(max-width: 900px) 50vw, 100vw" width="1600" height="1067" alt="Evening traffic on Kampala Road, Uganda" fetchpriority="high">
    <div class="container hero-inner"><div class="hero-copy"><span class="hero-kicker"><span class="status-dot"></span>UGANDA · MOBILITY & FUEL INTELLIGENCE</span><h1 id="heroTitle">Find Affordable Fuel.<br><span>Drive Smarter.</span></h1><p>Discover fuel stations, compare verified prices, plan journeys, and report fuel market concerns across Uganda.</p><div class="actions hero-actions"><button class="button amber" data-action="find-nearby">${icon('pin')} Find Fuel Near Me</button><a class="button hero-outline" href="#prices">Compare Fuel Prices ${icon('arrow')}</a></div><a class="hero-concern" href="#report">${icon('report')} Report a Price ${icon('arrow')}</a><div class="hero-trust"><span>${icon('check')}Real sources. Clear freshness.</span><span>${icon('check')}Your voice, tracked.</span></div></div>
    <aside class="hero-price-card"><div class="hero-price-heading">${icon('pump')} THE PRICE PICTURE</div><p>Fresh published price indicators</p><div class="hero-fuel-row"><span>Petrol <small>UGX / litre</small></span><strong data-hero-price="petrol">—</strong></div><div class="hero-fuel-row"><span>Diesel <small>UGX / litre</small></span><strong data-hero-price="diesel">—</strong></div><div class="hero-card-note">${icon('clock')}Regional averages weighted by sample count. Demo and stale prices excluded.</div><a href="#analytics">Explore the data ${icon('arrow')}</a></aside></div>
    <div class="container hero-credit"><a href="#credits">Kampala Road · Kyakwera / CC BY-SA 4.0</a></div>
  </section>
  ${photoCarousel([])}
  <section class="container search-section" aria-labelledby="searchTitle"><div class="search-panel"><div class="search-intro">${icon('search')}<div><h2 id="searchTitle">Where are you refuelling?</h2><p>Find a station. Check a price. Plan ahead.</p></div></div><form id="homeSearch" class="portal-search">${field('Station name or area','q',{required:false,placeholder:'Search a station or area'})}${districtSelect([])}${select('Fuel type','fuel',fuelOptions)}<button class="primary" type="submit">${icon('search')} Search prices</button></form></div></section>
  <template id="homeRest">
  <section class="portal-section discovery-section"><div class="container">${sectionHeading('EXPLORE THE FUEL NETWORK','Your next stop, in one clear view.','Search the directory, select a station, and inspect the source behind its price.','#stations','Open fuel discovery')}<div data-overview="discovery">${skeletonFill('Loading station discovery…')}</div></div></section>
  <section class="container home-kpis" aria-label="Platform records"><div data-overview="kpis">${skeletonFill('Loading platform records…')}</div></section>
  <section class="portal-section services-section"><div class="container">${sectionHeading('YOUR QUICK LINKS','One platform. Practical services.','From the next fuel stop to a concern that deserves an answer.', '#services','All citizen services')}${serviceDirectory()}</div></section>
  <section class="portal-section insights-section"><div class="container">${sectionHeading('FUEL MARKET INTELLIGENCE','Numbers with a source. Not a guess.','Compare fresh operational prices and understand what the available data can tell you.','#analytics','Reports & analytics')}<div class="grid insights-grid"><article class="card"><div class="card-head"><h3>Regional price snapshot</h3>${badge('Fresh · ≤48h')}</div><p class="small">UGX per litre · Accepted operational prices only.</p><div data-overview="region-chart">${skeletonFill('Loading regional averages…')}</div><a class="text-link" href="#analytics">View regional data ${icon('arrow')}</a></article><article class="card"><div class="card-head"><h3>Lowest fresh published prices</h3>${icon('pump')}</div><p class="small">Across the directory · Petrol · Not a price guarantee.</p><div data-overview="price-comparison">${skeletonFill('Loading price comparison…')}</div><a class="text-link" href="#prices">Compare fuel prices ${icon('arrow')}</a></article></div></div></section>
  <section class="container record-insights"><div class="grid"><article class="card"><h2>Recent verified updates</h2><p class="small">Fresh operational records, with their actual publication source.</p><div data-overview="recent-updates">${skeletonFill('Loading recent updates…')}</div></article><article class="card"><h2>Station distribution</h2><p class="small">Operational entries in this directory, not a measure of national coverage.</p><div data-overview="distribution">${skeletonFill('Loading station distribution…')}</div></article></div></section>
  <section class="portal-section"><div class="container"><div class="citizen-feature"><div class="citizen-feature-copy"><span class="eyebrow">CITIZEN PARTICIPATION</span><h2>A concern deserves<br>more than a comment.</h2><p>Submit a station concern, attach private evidence, and follow the case through a documented response.</p><ol class="case-steps"><li><span>01</span>Describe the issue</li><li><span>02</span>Receive a tracked case</li><li><span>03</span>Follow the response</li></ol><a class="button amber" href="#complaints">Report a concern ${icon('arrow')}</a><a class="citizen-follow" href="#complaints">Already submitted? Track your case →</a></div><figure class="citizen-photo"><img src="/assets/kabale-station.jpg" alt="Agaba petrol station in Kabale town, Uganda; an illustrative photograph" width="1400" height="1050" loading="lazy" decoding="async" fetchpriority="low"><figcaption>Kabale, Uganda · Documentary photography, not an endorsement. <a href="#credits">Photo credits ↗</a></figcaption></figure></div></div></section>
   <section class="portal-section advisory-section"><div class="container">${sectionHeading('PUBLIC INFORMATION','Advisories you can trace.','Published platform releases with links to their original sources.','#advisories','All advisories & town halls')}<div class="grid three" data-overview="advisories">${skeletonFill('Loading advisories…')}</div></div></section>
  <div data-overview="publishing">${skeletonFill('Loading newsroom…')}</div><section class="container community-strip"><div>${icon('users')}<div><h2>Better journeys begin with shared information.</h2><p>Join the conversation along Uganda’s transport corridors.</p></div></div><a class="button primary" href="#community">Explore driver community ${icon('arrow')}</a></section>
  </template>`;
}
async function hydrateOverview(version){
  const alive=()=>version===routeVersion;
  let restReady=false;const pendingRest=[];
  const fill=(name,html)=>{
    if(!restReady){pendingRest.push(()=>fill(name,html));return;}
    const el=document.querySelector(`[data-overview="${name}"]`);if(el&&alive())el.innerHTML=html;
  };
  const replace=(name,html)=>{
    if(!restReady){pendingRest.push(()=>replace(name,html));return;}
    const el=document.querySelector(`[data-overview="${name}"]`);if(el&&alive())el.outerHTML=html;
  };
  const summaryTask=summary().catch(error=>{
    if(!alive())return;
    showError(error);$('#connection').textContent='Unavailable';
    fill('kpis',empty('Platform metrics are unavailable right now. Use Refresh data to try again.'));
    fill('region-chart',empty('Regional averages are unavailable right now.'));
  });
  const stationsTask=loadStationBatch(0).catch(()=>[]);
  const mediaTask=api('/media').then(result=>result.items??[]).catch(()=>[]);
  const newsTask=api('/news').then(result=>result.items??[]).catch(()=>[]);
  const videosTask=api('/videos').then(result=>result.items??[]).catch(()=>[]);
  const advisoriesTask=api('/advisories').then(result=>result.items??[]).catch(()=>[]);
  const fillStations=stations=>{
    const district=$('#homeSearch [name=district]');
    if(district?.closest('label'))district.closest('label').outerHTML=districtSelect(stations);
    fill('price-comparison',priceComparison(stations));
    fill('recent-updates',recentPriceUpdates(stations));
    fill('distribution',stationDistribution(stations));
    fill('discovery',discoveryMarkup(stations,state.discoveryPreferences));
    mountFuelDiscovery();
  };
  await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
  if(!alive())return;
  const rest=document.getElementById('homeRest');
  if(rest)rest.replaceWith(...rest.content.childNodes);
  restReady=true;
  while(pendingRest.length)pendingRest.shift()();
  const stations=await stationsTask;
  if(!alive())return;
  state.stations=stations;state.discoveryStations=stations;
  fillStations(stations);
  if(stations.length===100)loadDirectory().then(full=>{if(alive())fillStations(full);}).catch(()=>{});
  summaryTask.then(()=>{
    if(!alive()||!state.summary)return;
    document.querySelectorAll('[data-hero-price]').forEach(el=>{el.innerHTML=fuelIndicator(el.dataset.heroPrice);});
    const s=state.summary,regions=new Set(s.regions.map(r=>r.region)).size;
    fill('kpis',`<div class="metrics">${publicMetric(s.verified_today,'Verified reports today','shield')}${publicMetric(s.stations-s.demo_stations,'Operational directory stations','pump')}${publicMetric(regions,'Regions with fresh prices','globe')}${publicMetric(s.resolved_tickets,'Resolved consumer cases','check')}</div><p class="data-note">${icon('info')}Metrics are actual platform records. ${s.demo_stations?`${s.demo_stations} demonstration directory entries are excluded from the operational station count.`:'Prices older than 48 hours are excluded from fresh-price insights.'}</p>`);
    fill('region-chart',regionChart(s.regions));
  });
  mediaTask.then(media=>{if(!alive())return;const carousel=$('.photo-carousel');if(carousel){carousel.outerHTML=photoCarousel(media);renderCarousel();}});
  Promise.all([newsTask,videosTask]).then(([news,videos])=>{if(alive())replace('publishing',homepagePublishing(news,videos));});
  advisoriesTask.then(notices=>{if(alive())fill('advisories',advisoryGrid(notices));});
  await Promise.all([summaryTask,stationsTask,mediaTask,newsTask,videosTask,advisoriesTask]);
}
function sectionHeading(kicker,title,text,href,label){return `<div class="section-heading"><div><span class="eyebrow">${esc(kicker)}</span><h2>${esc(title)}</h2><p>${esc(text)}</p></div>${href?`<a class="text-link" href="${href}">${esc(label)} ${icon('arrow')}</a>`:''}</div>`;}
function serviceDirectory(){return `<div class="service-grid">${services.map((s,i)=>`<a class="service-card service-tone-${i%3}" href="${s.href}"><span class="service-icon">${icon(s.icon)}</span><span class="service-tag">${s.tag}</span><h3>${s.title}</h3><p>${s.description}</p><span class="service-arrow">${icon('arrow')}</span></a>`).join('')}</div>`;}
function districtOptions(stations){return [['','All districts'],...[...new Set(stations.map(s=>s.district))].sort().map(d=>[d,d])];}
function districtSelect(stations,selected=''){return select('District','district',districtOptions(stations),selected,false);}
function publicMetric(value,label,name){return `<article class="metric public-metric"><span class="metric-icon">${icon(name)}</span><div><strong>${Number(value).toLocaleString('en-UG')}</strong><span class="label">${esc(label)}</span></div></article>`;}
function fuelIndicator(fuel){const rows=state.summary.regions.filter(r=>r.fuel===fuel);const samples=rows.reduce((n,r)=>n+r.samples,0);return samples?Math.round(rows.reduce((n,r)=>n+r.average*r.samples,0)/samples).toLocaleString('en-UG'):'<span class="unavailable-price">Awaiting data</span>';}
function regionChart(rows){if(!rows.length)return empty('No fresh operational prices yet. Accepted non-demo observations will appear here.');const max=Math.max(...rows.map(r=>r.average)),fuels=[...new Set(rows.map(r=>r.fuel))];return `<div class="region-chart" role="group" aria-label="Regional average published prices in UGX per litre"><div class="chart-legend">${fuels.map(f=>`<span class="legend-${esc(f)}">${esc(f.charAt(0).toUpperCase()+f.slice(1))}</span>`).join('')}</div>${rows.map(r=>`<div class="region-bar-row"><span>${esc(r.region)}<small>${esc(r.fuel)} · ${r.samples} samples</small></span><span class="region-bar-track" aria-hidden="true"><span class="region-bar ${r.fuel==='diesel'?'diesel':r.fuel==='kerosene'?'kerosene':''}" style="width:${r.average/max*100}%"></span></span><strong>${Number(r.average).toLocaleString('en-UG')}</strong></div>`).join('')}</div>`;}
function priceComparison(stations){const entries=stations.filter(s=>!s.demo).map(s=>({station:s,price:s.prices.find(p=>p.fuel==='petrol'&&p.source!=='demo'&&!p.stale)})).filter(e=>e.price).sort((a,b)=>a.price.price-b.price.price).slice(0,5);return entries.length?`<div class="comparison-list">${entries.map((e,i)=>`<div><span class="comparison-rank">${i+1}</span><div><strong>${esc(e.station.name)}</strong><small>${esc(e.station.district)} · ${esc(e.price.source)}</small></div><strong>${money(e.price.price)}</strong><button class="quiet small" data-action="station" data-id="${e.station.id}" aria-label="View ${esc(e.station.name)}">${icon('arrow')}</button></div>`).join('')}</div>`:empty('No fresh operational petrol prices are available for comparison. Demo prices are not ranked.');}
function recentPriceUpdates(stations){const updates=stations.flatMap(s=>s.prices.map(p=>({station:s,price:freshPrice(s,p.fuel)})).filter(x=>x.price)).sort((a,b)=>new Date(b.price.updated_at)-new Date(a.price.updated_at)).slice(0,6);return updates.length?`<div class="verified-update-feed">${updates.map(({station:s,price:p})=>`<article><span class="update-icon">${icon('check')}</span><div><strong>${esc(s.name)}</strong><p>${esc(p.fuel)} · ${money(p.price)} / litre</p><small>${esc(p.source)} · ${date(p.updated_at)}</small></div><button class="quiet small" data-action="station" data-id="${s.id}" aria-label="Inspect ${esc(s.name)} price update">${icon('arrow')}</button></article>`).join('')}</div>`:empty('No fresh verified operational updates yet. Sample and outdated prices are excluded.');}
function stationDistribution(stations){const counts={};stations.filter(s=>!s.demo).forEach(s=>{counts[s.region]=(counts[s.region]||0)+1;});const entries=Object.entries(counts);if(!entries.length)return empty('No operational station distribution is available. Demonstration entries are not counted.');const max=Math.max(...Object.values(counts));return `<div class="distribution-chart">${entries.map(([name,count])=>`<div><span>${esc(name)}</span><span class="region-bar-track"><span class="region-bar" style="width:${count/max*100}%"></span></span><strong>${count}</strong></div>`).join('')}</div>`;}
async function fuelDiscoveryView(){const stations=await loadDirectory();state.discoveryStations=stations;return `${heading('Find your next fuel stop.','Discover stations, compare source-labeled prices, and choose a stop that fits your journey.','MOBILITY / FUEL DISCOVERY')}${discoveryMarkup(stations,state.discoveryPreferences)}<div class="discovery-followup"><span>${icon('info')}Distance is a straight-line estimate, not a road route. A recorded price does not confirm fuel stock.</span><div class="actions"><a href="#prices">Compare prices</a><a href="#trip">Plan trip cost</a><a href="#report">Report a price</a></div></div>`;}
async function servicesView(){return `${heading('Every journey. A practical service.','Choose the service you need. Personal records and submissions require sign-in.','CITIZEN SERVICES')}${serviceDirectory()}<section class="card service-explainer"><h2>One citizen account, different journeys.</h2><p>Boda riders, truck drivers and private motorists use the same citizen permissions. Choose a transport type when submitting a case or your own fuel efficiency when planning a trip.</p><div class="actions"><a class="button primary" href="#complaints">Consumer cases ${icon('arrow')}</a><a class="button secondary" href="#trip">Plan a journey ${icon('route')}</a></div></section>`;}
async function analyticsView(){const [caps,stations]=await Promise.all([api('/caps'),loadDirectory()]);return `${heading('A clearer view of the fuel market.','Operational price intelligence drawn from published platform records.','REPORTS & ANALYTICS')}<div class="metrics">${publicMetric(state.summary.verified_today,'Reports verified today','shield')}${publicMetric(state.summary.stations-state.summary.demo_stations,'Operational stations','pump')}${publicMetric(state.summary.active_tickets,'Active consumer cases','report')}${publicMetric(state.summary.resolved_tickets,'Resolved cases','check')}</div><div class="grid"><section class="card"><h2>Fresh regional averages</h2><p class="small">UGX / litre · Source-linked records · Demo and stale prices excluded.</p>${regionChart(state.summary.regions)}</section><section class="card"><h2>Lowest fresh petrol prices</h2>${priceComparison(stations)}</section></div><section class="card"><h2>Currently effective district directives</h2><p>Only administrator-published, source-linked directives within their effective period are shown. These records do not imply a nationwide legal price cap.</p>${capTable(caps.items)}</section>`;}
function aboutView(){return `${heading('Information that moves Uganda.','An independent fuel-price transparency and citizen engagement platform.','ABOUT MAFUTAWATCH')}<div class="grid"><section class="card"><span class="feature-icon">${icon('pump')}</span><h2>Know what is behind the price.</h2><p>Every published price identifies its source and update time. Operator updates, independently confirmed observations and moderator decisions have distinct provenance.</p><p>Prices more than 48 hours old are labeled stale. Demonstration entries never contribute to fresh operational price analytics.</p><a class="text-link" href="#prices">Explore price information ${icon('arrow')}</a></section><section class="card"><span class="feature-icon">${icon('shield')}</span><h2>A record of your concern.</h2><p>Consumer cases keep evidence private to the submitter and authorized case officers. Replies, assignment and decisions form a trackable conversation.</p><p>The platform records a 24-hour response target. Actual response depends on the operating case team; submission is not a guarantee of enforcement.</p><a class="text-link" href="#complaints">Open a consumer case ${icon('arrow')}</a></section></div><section class="card"><h2>Independent by design. Clear about authority.</h2><p>MafutaWatch branding does not assert government ownership, ministry endorsement or a partnership with any station shown. Published source links let you inspect the original information. The platform is not a substitute for an authorized regulator or an emergency service.</p><a href="#privacy">Read our data-use notice →</a></section>`;}
function contactView(){return `${heading('Find the right way to get help.','Use a tracked workflow for station concerns and case follow-up.','HELP & CONTACT')}<div class="grid"><section class="card"><span class="feature-icon">${icon('report')}</span><h2>A concern about a fuel station?</h2><p>Submit a consumer case, attach relevant evidence, and read replies from the operating case team in your account.</p><a class="button primary" href="#complaints">Open or track a case ${icon('arrow')}</a></section><section class="card"><span class="feature-icon">${icon('users')}</span><h2>Account or access assistance</h2><p>Account recovery and staff access are managed by the organization operating this deployment. No public support phone number or email address has been configured.</p><p class="small">We do not publish an invented contact or imply that a government support service is connected.</p><a class="text-link" href="#operator">Station access applications ${icon('arrow')}</a></section></div><section class="card"><h2>Before you submit</h2><p>Keep a receipt where available, note the station and incident date, and avoid including unrelated personal information in uploaded evidence. Reports and replies require a live connection.</p><div class="actions"><a href="#privacy">Privacy & data use</a><a href="#activity">My activity</a></div></section>`;}
function creditsView(){return `${heading('A real place. A credited photograph.','Documentary images of Ugandan transport and the fuel sector.','PHOTOGRAPHY CREDITS')}<div class="grid"><article class="card credit-card"><img src="/assets/kampala-road.jpg" alt="Evening traffic on Kampala Road" width="1600" height="1067" loading="lazy"><h2>Evening traffic jam setting in on Kampala road 05</h2><p>Kyakwera · 20 February 2020 · Kampala, Uganda.</p><p>Original JPEG retained; responsive cropping and a separate gradient overlay are used in the hero. This photograph remains under CC BY-SA 4.0.</p><div class="actions"><a href="https://commons.wikimedia.org/wiki/File:Evening_traffic_jam_setting_in_on_Kampala_road_05.jpg" target="_blank" rel="noopener noreferrer">Original source ↗</a><a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0 ↗</a></div></article><article class="card credit-card"><img src="/assets/kabale-station.jpg" alt="Agaba petrol station in Kabale town" width="1400" height="1050" loading="lazy"><h2>Agaba petrol station in Kabale town</h2><p>Owobusingye · 24 August 2025 · Kabale, Uganda.</p><p>Original JPEG retained, responsively cropped in the citizen-services feature. Depiction does not imply affiliation, a live price observation or endorsement.</p><div class="actions"><a href="https://commons.wikimedia.org/wiki/File:Agaba_petrol_station_in_Kabale_town.jpg" target="_blank" rel="noopener noreferrer">Original source ↗</a><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0 ↗</a></div></article></div>`;}
async function profileView(){
  if(!state.user)return loginCard('Sign in to view your profile.');
  let profile,preferences,subs,emailChange;try{const [p,pr,s,ec]=await Promise.all([api('/me/profile'),api('/me/preferences'),api('/me/subscriptions'),api('/me/email/status').catch(()=>null)]);profile=p;preferences=pr.preferences??{};state.preferences=preferences;preferences.notifications={priceChanges:true,reportUpdates:true,complaintUpdates:true,advisories:true,...preferences.notifications};subs=s.items??[];emailChange=ec;}catch(error){return `<div class="empty">Unable to load your profile. ${error.message}</div>`;}
  const initials=(profile.displayName??'U').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
  const avatarImg=profile.avatarUrl?`<img src="${esc(profile.avatarUrl)}" alt="Profile picture" class="avatar">`:`<div class="avatar placeholder">${esc(initials)}</div>`;
  let stationsHtml;
  if(subs.length){stationsHtml=`<div class="card-head"><h2>Saved stations</h2><p class="small">Stations you follow for price-change alerts.</p></div>${subs.map(s=>`<div class="list-item"><div><strong>Station #${esc(s.station_id)}</strong><p class="small">Followed for price-change alerts</p></div><div class="actions"><button class="small" data-action="station" data-id="${s.station_id}">View details ${icon('arrow')}</button><button class="small danger" data-action="unsubscribe" data-id="${s.station_id}">Remove ${icon('close')}</button></div></div>`).join('')}<div class="actions"><a class="text-link" href="#stations">Browse stations ${icon('arrow')}</a></div>`;}else{stationsHtml=`${empty('No saved stations yet. Follow a station from the directory to track its price changes.')}<div class="actions"><a class="text-link" href="#stations">Browse stations ${icon('arrow')}</a></div>`;}
  const del=await api('/me/deletion-request').catch(()=>({request:null}));
  const request=del.request;
  const active=request&&['pending','info_requested'].includes(request.status);
  const delHtml=request?`<p><strong>Deletion request:</strong> ${badge(request.status.replaceAll('_',' '),request.status)} · submitted ${date(request.created_at)}${request.reviewed_at?` · reviewed ${date(request.reviewed_at)}`:''}</p><p class="small">Reason: ${esc(request.reason)}</p>${request.review_note?`<p class="small">Administrator note: ${esc(request.review_note)}</p>`:''}${request.user_response?`<p class="small">Your response: ${esc(request.user_response)}</p>`:''}${request.status==='approved'?`<p class="small">Approved. An authorized administrator runs the deletion procedure separately; accounts and evidence are never erased automatically. Investigation records, financial evidence and legally required data are retained under the approved retention policy.</p>`:''}${request.status==='rejected'?`<p class="small">Rejected. Your account remains active.</p>`:''}`:'';
  return `${heading('My profile','Your personal details, preferences and account settings.','MY PROFILE')}<div class="grid"><section class="card profile-card"><div class="actions" style="justify-content:flex-start;gap:14px;margin-bottom:18px;">${avatarImg}<div><h2 style="margin:0 0 2px 0;">${esc(profile.displayName)}</h2><p class="small">${esc(profile.preferredName??'')}${profile.preferredName?' · ':''}${esc(profile.role)} · ${profile.identityVerified?badge('Verified identity','verified'):''}</p><p class="small">Member since ${date(profile.created_at)}</p></div></div><section class="card"><h2>Personal information</h2><form id="profileForm">${field('Display name','displayName',{value:profile.displayName??'',maxlength:80})}${field('Preferred name','preferredName',{value:profile.preferredName??'',maxlength:80,placeholder:'Optional'})}${field('Phone number','phone',{type:'tel',value:profile.phone??'',maxlength:15,placeholder:'e.g. +256700000000'})}${field('Preferred district','district',{value:profile.district??'',maxlength:100,placeholder:'e.g. Kampala'})}<div class="actions"><button class="primary" data-action="profile-save">Save changes</button><span id="profileSaveStatus" class="small"></span></div></form></section><section class="card"><h2>Profile picture</h2><div class="actions" style="flex-direction:column;gap:10px;align-items:flex-start;"><label>Upload photo (JPEG, PNG or WebP, max 2 MiB)<input type="file" id="avatarFile" accept="image/jpeg,image/png,image/webp"></label><img id="avatarPreview" src="" alt="Preview" style="max-width:160px;border-radius:50%;border:1px solid var(--line);margin-top:8px;display:none"><button class="primary" data-action="profile-avatar">Save photo</button><button${profile.avatarUrl?'':' hidden'} class="danger small" data-action="profile-avatar-remove">Remove photo</button><span id="avatarStatus" class="small"></span></div></section></section></div><section class="card"><h2>Password &amp; security</h2><form id="profilePasswordForm">${field('Current password','currentPassword',{type:'password',maxlength:128})}${field('New password (at least 12 characters)','newPassword',{type:'password',min:12,maxlength:128})}${formEnd('Change password')}<p class="small">Changing your password signs out all active sessions and revokes integration credentials.</p></form></section><section class="card"><h2>Fuel &amp; vehicle preferences</h2><p class="small">These personalize fuel discovery and trip-planning defaults for your account.</p><form id="preferencesForm">${select('Preferred fuel','fuelType',[['petrol','Petrol'],['diesel','Diesel'],['kerosene','Kerosene']],preferences.fuelType??'')}${select('Vehicle category','vehicleType',[['private','Private car'],['boda','Boda boda'],['taxi','Taxi'],['truck','Truck'],['other','Other']],preferences.vehicleType??'')}${field('Preferred district','preferredDistrict',{value:preferences.preferredDistrict??'',maxlength:100,placeholder:'e.g. Kampala'})}<div class="actions"><button class="primary" data-action="preferences-save">Save preferences</button><span id="prefSaveStatus" class="small"></span></div><details class="card"><summary>Notification settings</summary><p class="small">In-app alerts only. No SMS, email or push channels are configured.</p><label class="check"><input name="priceChanges" type="checkbox"${preferences.notifications&&preferences.notifications.priceChanges?' checked':''}> Price changes at followed stations</label><label class="check"><input name="reportUpdates" type="checkbox"${preferences.notifications&&preferences.notifications.reportUpdates?' checked':''}> Updates to your reports</label><label class="check"><input name="complaintUpdates" type="checkbox"${preferences.notifications&&preferences.notifications.complaintUpdates?' checked':''}> Complaint &amp; investigation progress</label><label class="check"><input name="advisories" type="checkbox"${preferences.notifications&&preferences.notifications.advisories?' checked':''}> Published platform advisories</label><div class="actions"><button class="primary" data-action="preferences-save">Save notification settings</button></div></details><details class="card"><summary>Privacy &amp; visibility</summary><label class="check"><input name="publicDisplayName" type="checkbox"${preferences.privacy&&preferences.privacy.publicDisplayName?' checked':''}> Show my display name publicly</label><p class="small">Your email, phone and password are never shown publicly. When this is off, station reviews and community messages show you as Anonymous Member.</p></details></form></section>${stationsHtml}<section class="card"><h2>Account management</h2>${delHtml}${request?.status==='info_requested'?`<form id="deletionResponseForm">${textarea('Additional information','response',{min:10,max:2000})}${formEnd('Send additional information')}</form>`:''}${active?`<p class="small">Your request is in the administrator review queue. You will be notified when its status changes.</p>`:`<form id="deletionForm">${field('Reason','reason',{min:5,maxlength:1000})}${field('Current password','delPassword',{type:'password',maxlength:128})}<div class="actions"><button class="danger" data-action="deletion-request">Request account deletion</button><span id="delStatus" class="small"></span></div></form>`}<p class="small">Account deletion requires administrator review. Records required by law or for active investigations are retained according to policy.</p></section>${roleSettingsHtml(emailChange)}</div>`;}
function avatarPreview(input){const preview=$('#avatarPreview');if(input.files&&input.files[0]){preview.src=URL.createObjectURL(input.files[0]);preview.style.display='block';}else{preview.style.display='none';}}
function roleSettingsHtml(emailChange){
  const role=state.user?.role;if(role==='citizen')return'';
  const settings=state.preferences?.roleSettings??{};
  const check=(key,label,defaultOn=false)=>`<label class="check"><input name="${key}" type="checkbox"${(settings[key]??defaultOn)?' checked':''}> ${label}</label>`;
  const card=(title,controls,description)=>`<section class="card"><h2>${title}</h2><form id="roleSettingsForm">${controls}<p class="small">${description}</p><div class="actions"><button class="primary" data-action="role-settings-save">Save settings</button><span id="roleSettingsStatus" class="small" role="status"></span></div></form></section>`;
  const emailRow=`<div class="actions" style="margin-top:10px;"><button class="primary" data-action="profile-email-save">Save email</button><span id="emailSaveStatus" class="small"></span></div>`;
  const common=emailChange?.enabled
    ?`<section class="card"><h2>Email address</h2><p class="small">Changing your email requires approval from both mailboxes: one single-use link is sent to your current address and another to the new one. Your address does not change until both are confirmed, each link expires in 24 hours, and confirming the second link signs out every session.</p><form id="profileEmailForm">${field('New email address','email',{type:'email',maxlength:254})}${field('Current password','emailPassword',{type:'password',maxlength:128})}${emailRow}</form></section>`
    :`<section class="card"><h2>Email address</h2><p class="banner warning" role="status">Email changes are unavailable on this deployment: an email delivery provider is not configured, so no verification link can be sent. Your address cannot be changed from the app right now. Contact the operator of this deployment to update it.</p></section>`;
  if(role==='admin')return common+card('Administrator settings',check('securityAlerts','Security alerts',true)+check('dashboardPreferences','Remember my selected operations tab'),'Security alerts cover account changes, password resets and staff provisioning by other administrators. Essential notices to the affected account are always delivered. Remembering restores your selected operations tab after sign-in.');
  if(role==='inspector')return common+card('Inspector settings',check('assignedCaseNotifications','Assigned-case notifications',true)+check('inspectionAlerts','Inspection alerts',true)+check('workspacePreferences','Remember my case queue filters'),'Receive alerts when another officer assigns you a case or a new consumer case arrives. Remembering restores your case status and assignment filters after sign-in.');
  if(role==='analyst')return common+card('Analyst settings',check('savedChartFilters','Remember my applied chart fuel view'),'Restore your last applied intelligence fuel view after sign-in.');
  if(role==='operator')return common+card('Station operator settings',check('priceUpdateNotifications','Fuel-price update notifications',true)+check('assignedStationDashboard','Remember my selected station'),'Receive price changes published by others at your assigned stations. Remembering restores your station selection after sign-in; it does not grant station access.');
  return '';
}
function capTable(items){return items.length?`<div class="table-wrap"><table><thead><tr><th>District</th><th>Fuel</th><th>Maximum UGX/L</th><th>Expires (EAT)</th><th>Source</th></tr></thead><tbody>${items.map(c=>`<tr><td>${esc(c.district)}</td><td>${esc(c.fuel)}</td><td>${money(c.price)}</td><td>${date(c.effective_until)}</td><td><a href="${esc(c.source_url)}" target="_blank" rel="noopener noreferrer">View directive ↗</a></td></tr>`).join('')}</tbody></table></div>`:empty('No currently effective directives have been published.');}
async function stationsView(){
  const query=new URLSearchParams({...state.filters,limit:50,offset:state.offset});
  if(!state.filters.district)query.delete('district');
  if(state.position){query.set('lat',state.position.latitude);query.set('lng',state.position.longitude);}
  const result=await api(`/stations?${query}`);
  state.visibleStations=result.items;
  const rangeLabel=result.items.length?`${state.offset+1}–${state.offset+result.items.length}`:'0 matching stations';
  return `${heading('Find your next fuel stop.','Search the directory, compare a fuel type, and check when a price was last confirmed.','DIRECTORY / COMPARE PRICES')}
    <form id="stationFilter" class="filters">${field('Search station, area or district','q',{required:false,value:state.filters.q,placeholder:'e.g. Ntinda or Jinja'})}${field('District (exact name, optional)','district',{required:false,value:state.filters.district})}${select('Fuel','fuel',fuelOptions,state.filters.fuel)}${select('Sort by','sort',[['price','Lowest fresh price'],['name','Station name']],state.filters.sort)}${select('GPS radius','radius',[['3','Within 3 km'],['10','Within 10 km'],['25','Within 25 km'],['100','Within 100 km']],state.filters.radius)}<button type="submit" class="primary">Search</button><button type="button" data-action="locate">${state.position?'Update location':'Use my location'}</button>${state.position?'<button type="button" data-action="clear-location">Clear GPS</button>':''}</form>
    <div class="actions"><button data-action="price-map" aria-controls="stationMap" aria-expanded="false">Map View</button></div><div id="stationMap" class="map" aria-label="Station locations" hidden></div>
    <section class="card"><div class="card-head"><h2>Station directory</h2><span class="small">${rangeLabel} · ${esc(state.filters.fuel)} prices / litre</span></div>${result.items.length?`<div class="table-wrap"><table><thead><tr><th>Station</th><th>District</th><th>Price (UGX/L)</th><th>Source & freshness</th><th>Details</th></tr></thead><tbody>${result.items.map(s=>{const p=s.prices.find(p=>p.fuel===state.filters.fuel);return `<tr><td><strong>${esc(s.name)}</strong><br><small>${esc(s.operator_name)} · ${esc(s.area)}</small>${s.demo?`<br>${badge('Demo directory entry','demo')}`:''}</td><td>${esc(s.district)}</td><td class="price">${money(p?.price)}</td><td>${p?`${badge(p.source)} ${p.stale?badge('Stale · >48h','stale'):''}<br><small>${date(p.updated_at)}</small>`:'No observation'}</td><td><button class="small" data-action="station" data-id="${s.id}">View station</button></td></tr>`;}).join('')}</tbody></table></div>`:empty('No matching stations. Try another area or clear your GPS filter.')}${pagination(state.offset,result.items.length,'stations-page')}</section>`;
}
function pagination(offset,length,action){return `<div class="pagination"><button class="small" data-action="${action}" data-offset="${Math.max(0,offset-50)}" ${offset===0?'disabled':''}>← Previous</button><span>Page ${Math.floor(offset/50)+1}</span><button class="small" data-action="${action}" data-offset="${offset+50}" ${length<50?'disabled':''}>Next →</button></div>`;}
function initMap(){
  const el=$('#stationMap');if(!el)return;const L=window.L;
  if(map){map.invalidateSize();return;}
  if(!L){el.innerHTML=empty('Map unavailable. All stations remain accessible in the directory below.');return;}
  map=L.map(el).setView([0.6,32.5],7);
  const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,referrerPolicy:'strict-origin-when-cross-origin',attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'});
  tiles.on('tileerror',()=>{if(!el.querySelector('.map-feedback')){const note=document.createElement('div');note.className='map-feedback';note.setAttribute('role','status');note.textContent='Map tiles unavailable. Station locations and linked directory results are still available.';el.append(note);}});
  tiles.addTo(map);
  const points=[];
  for(const s of state.visibleStations){const marker=L.circleMarker([s.latitude,s.longitude],{radius:7,color:s.demo?'#a07418':'#2f703c',fillOpacity:.8}).addTo(map);const content=document.createElement('div');const title=document.createElement('strong');title.textContent=s.name;const button=document.createElement('button');button.textContent='View station';button.dataset.action='station';button.dataset.id=s.id;content.append(title,document.createElement('br'),button);marker.bindPopup(content);points.push([s.latitude,s.longitude]);}
  if(state.position)L.circleMarker([state.position.latitude,state.position.longitude],{radius:8,color:'#245fc5'}).addTo(map);
  if(points.length)map.fitBounds(points,{padding:[24,24],maxZoom:14});
}
async function stationDetail(id){
  const s=await api(`/stations/${id}`);state.currentStation=s;
  let subscribed=false;if(state.user){const subs=await api('/me/subscriptions');subscribed=subs.items.some(x=>x.station_id===s.id);}
  $('#detailTitle').textContent=s.name;
  $('#detailContent').innerHTML=`<p>${esc(s.operator_name)} · ${esc(s.area)}, ${esc(s.district)}</p>${s.demo?'<div class="banner warning">This directory entry is a demonstration fixture. Confirm the station and prices independently.</div>':''}<div class="metrics">${s.prices.map(p=>`<div class="metric"><strong class="price">${money(p.price)}</strong><span class="label">${esc(p.fuel)} / litre</span><br>${badge(p.source)} ${p.stale?badge('Stale','stale'):''}<br><small>${date(p.updated_at)}</small></div>`).join('')||empty('No published prices yet.')}</div>
    <div class="actions"><button class="primary" data-action="report-station" data-id="${s.id}">Report a price</button><button data-action="subscribe" data-id="${s.id}" data-enabled="${!subscribed}">${subscribed?'Unfollow price changes':'Follow price changes'}</button><a class="button" href="https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}" target="_blank" rel="noopener noreferrer">Driving directions ↗</a></div>
    <h3>Recent accepted price history</h3>${s.history.length?`<div class="table-wrap"><table><thead><tr><th>Fuel</th><th>Price</th><th>Source</th><th>Updated</th></tr></thead><tbody>${s.history.slice(0,12).map(p=>`<tr><td>${esc(p.fuel)}</td><td>${money(p.price)}</td><td>${esc(p.source)}</td><td>${date(p.created_at)}</td></tr>`).join('')}</tbody></table></div>`:empty('No accepted price history yet.')}
    <h3>Station reviews</h3>${s.reviews.map(r=>`<div class="list-item"><strong>${esc(r.display_name)} · ${r.rating}/5</strong><p>${esc(r.body)}</p><small>${date(r.created_at)}</small></div>`).join('')||empty('No reviews yet.')}
    <details><summary>Write or update your review</summary>${state.user?`<form id="reviewForm" data-id="${s.id}">${select('Rating','rating',[[5,'5 — Excellent'],[4,'4 — Good'],[3,'3 — Average'],[2,'2 — Poor'],[1,'1 — Very poor']])}${textarea('Your experience','body',{max:2000})}${formEnd('Save review')}</form>`:'<button data-action="auth">Sign in to write a review</button>'}</details>`;
  if(!$('#detailDialog').open)$('#detailDialog').showModal();
}
async function reportView(){
  if(!state.user)return loginCard('Sign in before entering an observation so it can be tracked to your account.');
  await loadDirectory();return `${heading('Share the price you see.','Report the displayed pump price. You can follow its review status in My activity.','CITIZEN / PRICE OBSERVATIONS')}<div class="grid"><section class="card"><form id="reportForm" data-key="${crypto.randomUUID()}">${stationSelect()}<div class="form-row">${fuelField()}${priceField()}</div><label>Optional observation note<textarea name="note" maxlength="500" placeholder="Pump label, time or useful context"></textarea></label><div class="actions"><button type="button" data-action="report-gps">Attach GPS location (optional)</button><span id="gpsStatus" class="small">Location not shared</span></div>${formEnd('Submit for verification')}</form></section><aside class="card soft"><h2>Useful evidence. Responsible publishing.</h2><p>Each observation is tied to your account and checked against accepted prices and current source-linked directives.</p><p>Unusual prices go to a case officer. Automatic consensus needs three independently identity-verified citizens in a 15-minute window. Creating accounts or repeating reports does not establish independence.</p><p>GPS coordinates are self-reported supporting context, not proof that a price is correct.</p><a href="#activity">Track your contributions →</a></aside></div>`;
}
function loginCard(text){return `${heading('Your account, your records.',text)}<section class="card">${empty('Sign in to access this workspace.')}<button class="primary" data-action="auth">Sign in or create an account</button></section>`;}
async function complaintsView(){
  if(!state.user)return loginCard('Consumer cases and evidence are private to you and authorized case officers.');
  await loadDirectory();const tickets=await api('/tickets?limit=50');
  return `${heading(isStaff()?'Consumer case queue':'Consumer complaints','Describe what happened, attach evidence, and follow a documented response.','ACCOUNTABILITY / CASE MANAGEMENT')}
    <div class="banner info">The platform tracks a 24-hour response target and overdue cases. Actual response depends on the operating case team. Updates are delivered here in the app.</div>
    <details class="card"><summary>+ Open a consumer case</summary><form id="complaintForm" data-key="${crypto.randomUUID()}">${stationSelect()}<div class="form-row">${select('Issue category','category',[['tampering','Pump or meter tampering'],['adulterated','Suspected adulterated fuel'],['overpricing','Pricing concern'],['refusal','Refusal to comply with a directive'],['quality','Fuel quality'],['other','Other consumer concern']])}${select('Transport type','vehicleType',[['boda','Boda boda'],['truck','Truck'],['private','Private vehicle'],['other','Other']])}</div>${field('Date of incident','incidentDate',{type:'date',value:new Date().toISOString().slice(0,10),max:new Date().toISOString().slice(0,10)})}${textarea('What happened?','description',{min:10,max:5000})}${evidenceInput()}${formEnd('Create tracked case')}</form></details><section><div class="card-head"><h2>${isStaff()?'Cases available to your team':'Your cases'}</h2><span class="small">${tickets.items.length} on this page</span></div>${ticketCards(tickets.items)}</section>`;
}
function sla(ticket){if(['resolved','closed'].includes(ticket.status))return `Resolved ${date(ticket.resolved_at)}`;const hours=(new Date(ticket.due_at)-Date.now())/3600000;return hours<0?`${Math.abs(hours).toFixed(1)}h overdue`:`${hours.toFixed(1)}h to response target`;}
function ticketCards(tickets){return tickets.length?tickets.map(t=>`<article class="ticket-card ${t.overdue?'overdue':''}"><div class="item-header"><div><span class="reference">${esc(t.reference)}</span><h3>${esc(t.station_name||'Consumer case')}</h3></div>${badge(t.status)}</div><p>${esc(t.description.slice(0,220))}</p><div class="actions"><span class="small">${esc(sla(t))} · ${esc(t.assignee||'Awaiting assignment')}</span><button class="small" data-action="ticket" data-id="${t.id}">Open case →</button></div></article>`).join(''):empty('No cases found. New cases will appear here.');}
async function ticketDetail(id,{refresh=false}={}){
  const ticket=await api(`/tickets/${id}`);
  let officers=[];if(isStaff())officers=(await api('/admin/officers')).items;
  // A delayed save response must not reopen a case the user has already dismissed.
  if(refresh&&(!$('#detailDialog').open||state.ticket?.id!==id))return;
  state.ticket=ticket;
  $('#detailTitle').textContent=ticket.reference;
  const next={open:['investigating'],investigating:['dispatched','resolved'],dispatched:['resolved'],resolved:['closed'],closed:[]};
  $('#detailContent').innerHTML=`<div class="actions">${badge(ticket.status)}<span class="small">${esc(sla(ticket))}</span></div><p class="notice-text">${esc(ticket.description)}</p><p class="small">Incident: ${new Date(ticket.incident_date).toLocaleDateString('en-UG',{timeZone:'Africa/Kampala'})} · ${esc(ticket.category)} · ${esc(ticket.vehicle_type)} · Created ${date(ticket.created_at)}</p>
    <h3>Private evidence</h3><div class="evidence-links">${ticket.attachments.map(a=>`<a href="/api/v1/attachments/${a.id}">${esc(a.name)} (${Math.ceil(a.size/1024)} KB) ↓</a>`).join('')||'<span class="small">No evidence attached.</span>'}</div>
    ${ticket.user_id===state.user.id&&!['resolved','closed'].includes(ticket.status)?`<details><summary>Attach additional evidence</summary><form id="ticketEvidence" data-id="${ticket.id}">${evidenceInput()}${formEnd('Upload evidence')}</form></details>`:''}
    <h3>Case conversation</h3><div class="chat-box">${ticket.messages.map(m=>`<article class="message ${['admin','inspector'].includes(m.role)?'official':''}"><strong>${esc(m.display_name)} · ${['admin','inspector'].includes(m.role)?'Case officer':'Citizen'}</strong><p>${esc(m.body)}</p><small>${date(m.created_at)}</small></article>`).join('')||empty('No replies yet.')}</div>
    ${!['resolved','closed'].includes(ticket.status)?`<form class="messages-form" id="ticketMessage" data-id="${ticket.id}">${textarea('Reply to this case','body')}${formEnd('Send reply')}</form>`:''}
    ${isStaff()&&next[ticket.status].length?`<details open><summary>Case officer action</summary><form id="ticketAction" data-id="${ticket.id}" data-version="${ticket.version}">${select('Next status','status',[[ticket.status,`Keep ${ticket.status} (assignment only)`],...next[ticket.status].map(s=>[s,s])])}${select('Assigned officer','assignedTo',officers.map(o=>[o.id,o.display_name]),ticket.assigned_to||state.user.id)}${textarea('Action taken / reason (shared with citizen)','reason',{min:5,max:1000})}${formEnd('Save case decision')}</form></details>`:''}`;
  if(!$('#detailDialog').open)$('#detailDialog').showModal();
}
async function activityView(){
  if(!state.user)return loginCard('Sign in to track your observations, cases and price-change notifications.');
  const [reports,notifications,tickets]=await Promise.all([api(`/me/reports?limit=50&offset=${state.activityOffset}`),api('/me/notifications'),api('/tickets?limit=50')]);state.notifications=notifications.items;
  updateNotificationBadge();
  return `${heading(state.user.role==='citizen'?'Citizen Dashboard':'Your contributions. In one place.','Track decisions, case updates and the stations you follow.','ACCOUNT / MY ACTIVITY')}${state.user.role==='citizen'?'<p class="workspace-access-request"><a href="#operator">Station Operator Access Request →</a><span class="small">Station permissions require approval; your account remains a citizen until approved.</span></p>':''}${citizenExperience()}<div class="metrics">${metric(reports.items.length,'Reports on this page')}${metric(notifications.items.filter(n=>!n.read_at).length,'Unread notifications')}${metric(tickets.items.filter(t=>t.user_id===state.user.id).length,'Your cases on this page')}${metric(state.user.identity_verified?'Verified':'Not verified','Independent identity status')}</div><div class="grid"><section class="card"><div class="card-head"><h2>Price observations</h2><button class="small" data-action="refresh">Refresh status</button></div>${reportTable(reports.items)}${pagination(state.activityOffset,reports.items.length,'activity-page')}</section><section class="card"><div class="card-head"><h2>Notifications</h2><button class="small" data-action="read-notifications">Mark displayed read</button></div>${notifications.items.map(n=>`<div class="list-item">${n.read_at?'':badge('New')}<p>${esc(n.message)}</p><small>${date(n.created_at)}</small></div>`).join('')||empty('No notifications. Follow a station to receive price changes.')}</section></div><details class="card"><summary>Change your password</summary><form id="passwordForm">${field('Current password','currentPassword',{type:'password',maxlength:128})}${field('New password (at least 12 characters)','newPassword',{type:'password',min:12,maxlength:128})}${formEnd('Change password and sign out all sessions')}</form></details>`;
}
function citizenExperience(){if(state.user?.role!=='citizen')return '';return `<section class="citizen-experience card"><div><span class="eyebrow">YOUR JOURNEY</span><h2>One account. A workspace that fits.</h2><p>Choose useful starting defaults. This changes your experience, not your citizen permissions.</p></div><div class="experience-options" aria-label="Journey preferences">${[['private','Private motorist','route'],['boda','Boda rider','bike'],['truck','Truck driver','truck']].map(([mode,label,name])=>`<button data-action="citizen-mode" data-mode="${mode}" aria-pressed="${(state.citizenMode||'private')===mode}">${icon(name)}${label}</button>`).join('')}</div></section><nav class="citizen-quicklinks" aria-label="Journey shortcuts"><a href="#stations">${icon('pin')}Nearby fuel discovery</a><a href="#prices">${icon('pump')}Compare published prices</a><a href="#trip">${icon('route')}Plan fuel budget</a><a href="#complaints">${icon('shield')}Your complaints & cases</a><a href="#profile">${icon('user')}Your profile</a></nav>`;}
function reportTable(reports,moderate=false){return reports.length?`<div class="table-wrap"><table><thead><tr><th>Station / date</th><th>Observation</th><th>Status / reason</th>${moderate?'<th>Decision</th>':''}</tr></thead><tbody>${reports.map(r=>`<tr><td><strong>${esc(r.station_name)}</strong><br><small>${date(r.created_at)}</small></td><td>${esc(r.fuel)}<br><strong>${money(r.price)}</strong></td><td>${badge(r.status)}<br><small>${esc(r.decision_reason||r.note||'Awaiting independent confirmation or officer review')}</small></td>${moderate?`<td><button class="small" data-action="review-report" data-id="${r.id}" data-status="verified">Verify</button><button class="small danger" data-action="review-report" data-id="${r.id}" data-status="rejected">Reject</button></td>`:''}</tr>`).join('')}</tbody></table></div>`:empty('No price observations to show.');}
async function operatorView(){
  if(!state.user)return `${heading('Station Operator Access Request','Start with a citizen account, then submit a station application and supporting license documents.','STATION ACCESS')}<section class="card"><p>Registration does not make you an operator. An administrator reviews your documents before granting access to the named station. After sign-in, use the Station Operator Access Request link in your dashboard.</p><div class="actions"><button class="primary" data-action="auth">Sign In</button><button data-action="register">Citizen Registration</button></div></section>`;
  if(!['citizen','operator','admin'].includes(state.user.role))return `${heading('Station access is role-specific.','Your current staff account has no station-operator assignment.','WORKSPACE / ACCESS')}<section class="card"><p>Price publication and station integrations require an approved operator account or administrator permission.</p><a class="button primary" href="#admin">Return to your authorized workspace ${icon('arrow')}</a></section>`;
  await loadDirectory();const applications=await api('/applications?limit=50');
  const authorized=['operator','admin'].includes(state.user.role);
  let workspace='';
  if(authorized){const [assigned,reports,tokens,caps]=await Promise.all([api('/operator/stations'),api('/operator/reports'),api('/tokens'),api('/caps')]);state.assigned=assigned.items;
    const current=assigned.items.find(s=>s.id===state.operatorStationId)||assigned.items[0];
    const currentPrice=current?.prices.find(p=>p.fuel==='petrol');
    const districts=new Set(assigned.items.map(s=>s.district));
    workspace=`<div class="metrics">${metric(assigned.items.length,'Assigned active stations')}${metric(reports.items.length,'Recent station observations')}${metric(tokens.items.filter(t=>!t.revoked_at&&new Date(t.expires_at)>new Date()).length,'Active integration credentials')}${metric(applications.items.filter(a=>a.status==='pending').length,'Pending applications')}</div>
      <div class="grid operator-primary"><section class="card"><h2>Publish a pump price</h2><p class="small">Choose an assigned station. Your update is audited and subscribers receive an in-app notification.</p><form id="operatorPrice">${stationSelect(assigned.items,current?.id)}<div class="form-row">${fuelField()}${priceField()}</div><div id="currentPrice" class="banner info">${currentPrice?`Current petrol: ${money(currentPrice.price)} · ${esc(currentPrice.source)} · ${date(currentPrice.updated_at)}`:'No published petrol price for this station.'}</div>${formEnd('Publish official operator price')}</form></section><section class="card" id="operatorStationOverview">${operatorProfile(current)}</section></div>
      <div class="grid"><section class="card"><h2>Community observations for your stations</h2>${reportTable(reports.items)}</section><section class="card"><h2>Effective sourced directives</h2><p class="small">Published directives for the districts of your assigned stations. Inspect the original source and effective dates.</p>${capTable(caps.items.filter(c=>districts.has(c.district)))}</section></div>
      <section class="card"><h2>Station integration credentials</h2><p class="small">Credentials can only publish prices for their assigned station and expire after 90 days. Secrets are displayed once.</p><form id="tokenForm"><div class="form-row">${stationSelect(assigned.items)}${field('Credential name','name',{min:3,maxlength:80})}</div>${formEnd('Generate scoped credential')}</form><div id="tokenOnce"></div><div class="table-wrap"><table><thead><tr><th>Name / prefix</th><th>Station</th><th>Expiry</th><th>Action</th></tr></thead><tbody>${tokens.items.map(t=>`<tr><td>${esc(t.name)}<br><code>${esc(t.prefix)}…</code></td><td>#${t.station_id}</td><td>${date(t.expires_at)}</td><td>${t.revoked_at?badge('Revoked','closed'):`<button class="small danger" data-action="revoke-token" data-id="${t.id}">Revoke</button>`}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
  return `${heading(authorized?'Assigned Station Workspace':'Station Operator Access Request','Access is limited to approved station assignments.','OPERATORS / STATION WORKSPACE')}${workspace}<details class="card" ${authorized?'':'open'}><summary>Request access to a station</summary><form id="applicationForm" data-key="${crypto.randomUUID()}">${stationSelect()}${field('Trading / operating license reference','licenseReference',{min:3,maxlength:200})}${evidenceInput()}${formEnd('Submit access application')}</form></details><section class="card"><h2>Your access applications</h2>${applicationCards(applications.items.filter(a=>a.user_id===state.user.id))}</section>`;
}
function operatorProfile(s){if(!s)return empty('No active station is assigned. Request access below to begin the approval workflow.');return `<div class="card-head"><h2>${isAdmin()?'Accessible station profile':'Assigned station profile'}</h2>${icon('building')}</div><h3>${esc(s.name)}</h3><p class="small">${esc(s.operator_name)} · ${esc(s.area)}, ${esc(s.district)} · ${esc(s.region)} region</p>${s.demo?badge('Demonstration entry','demo'):badge(isAdmin()?'Administrator station access':'Approved operator assignment')}<div class="operator-price-grid">${s.prices.map(p=>`<div><small>${esc(p.fuel)} / litre</small><strong>${money(p.price)}</strong><span>${esc(p.source)}${p.stale?' · Stale':''}</span><small>${date(p.updated_at)}</small></div>`).join('')||empty('No prices published for this station yet.')}</div><p class="small">Coordinates: ${Number(s.latitude).toFixed(4)}, ${Number(s.longitude).toFixed(4)}. A published price does not confirm fuel stock.</p><div class="actions"><button class="secondary" data-action="station" data-id="${s.id}">View price history & profile ${icon('arrow')}</button><button class="quiet" data-action="station-map" data-id="${s.id}">${icon('pin')}Locate on map</button></div>`;}
function applicationCards(applications,review=false){return applications.length?applications.map(a=>`<article class="list-item"><div class="item-header"><h3>${esc(a.station_name)}</h3>${badge(a.status)}</div><p>${esc(a.display_name)} · License reference: ${esc(a.license_reference)}</p><p class="small">${esc(a.decision_reason||'Pending document review')}</p><div class="evidence-links">${a.attachments.map(f=>`<a href="/api/v1/attachments/${f.id}">${esc(f.name)} ↓</a>`).join('')}</div>${a.user_id===state.user.id&&a.status==='pending'?`<details><summary>Add supporting license documents</summary><form class="applicationEvidence" data-id="${a.id}">${evidenceInput()}${formEnd('Upload license evidence')}</form></details>`:''}${review&&a.status==='pending'?`<div class="actions"><button class="small" data-action="review-application" data-id="${a.id}" data-status="approved">Approve access</button><button class="small danger" data-action="review-application" data-id="${a.id}" data-status="rejected">Reject</button></div>`:''}</article>`).join(''):empty('No access applications.');}
function deletionRequestTable(items){return items.length?`<div class="table-wrap"><table><thead><tr><th>Requester</th><th>Role</th><th>Reason</th><th>Submitted</th><th>Status</th><th>Review</th></tr></thead><tbody>${items.map(r=>`<tr><td>${esc(r.display_name)}<br><small>${esc(r.email)}</small></td><td>${esc(r.role)}</td><td class="overflow-wrap">${esc(r.reason)}${r.user_response?`<br><small>Response: ${esc(r.user_response)}</small>`:''}</td><td class="nowrap">${date(r.created_at)}</td><td>${badge(r.status.replaceAll('_',' '),r.status)}</td><td>${['pending','info_requested'].includes(r.status)?`<button class="small" data-action="deletion-review" data-id="${r.id}">Review</button>`:`<small>${r.reviewed_at?date(r.reviewed_at):'Decided'}</small>`}</td></tr>`).join('')}</tbody></table></div>`:empty('No deletion requests.');}
async function communityView(){
  const rooms=await api('/rooms');if(!state.room&&rooms.items.length)state.room=rooms.items[0].id;
  const messages=state.room?await api(`/rooms/${state.room}/messages`):{items:[]};
  return `${heading('The road is better, together.','Share corridor updates. Your display name appears only when you enable Show my display name publicly in your profile privacy settings; otherwise you show as Anonymous Member. Community messages are observations, not verified price directives.','COMMUNITY / DRIVER CORRIDORS')}<div class="two-column"><section class="card"><h2>Transport corridors</h2>${rooms.items.map(r=>`<button class="room-button ${r.id===state.room?'active':''}" data-action="room" data-id="${r.id}">${esc(r.name)} →</button>`).join('')||empty('No corridor rooms configured yet.')}</section><section class="card"><div class="card-head"><h2>${esc(rooms.items.find(r=>r.id===state.room)?.name||'Community messages')}</h2><button class="small" data-action="refresh">Refresh messages</button></div><div class="chat-box" id="chatMessages">${messages.items.map(m=>`<article class="message"><div class="item-header"><strong>${esc(m.display_name)}</strong><small>${date(m.created_at)}</small></div><p>${esc(m.body)}</p><div class="actions"><button class="small quiet" data-action="vote" data-id="${m.id}">Helpful · ${m.votes}</button>${isStaff()?`<button class="small danger" data-action="hide-message" data-id="${m.id}">Hide message</button>`:''}</div></article>`).join('')||empty('No messages yet. Share the first useful corridor update.')}</div>${state.room?`<form id="messageForm" class="messages-form">${textarea('Your corridor update','body',{max:500})}${formEnd('Send message')}</form>`:''}</section></div>`;
}
async function advisoriesView(){
  const [notices,halls]=await Promise.all([api('/advisories'),api('/town-halls')]);
  return `${heading('Information you can trace.','Read source-linked platform releases and ask questions ahead of scheduled town halls.','PUBLIC INFORMATION / ADVISORIES')}<div class="grid"><section><h2>Published advisories</h2>${notices.items.map(a=>`<article class="card"><div class="eyebrow">PLATFORM ADVISORY · ${date(a.created_at)}</div><h2>${esc(a.title)}</h2><p class="notice-text">${esc(a.body)}</p><p class="small">Published by ${esc(a.author)}</p><a href="${esc(a.source_url)}" target="_blank" rel="noopener noreferrer">Read original source ↗</a></article>`).join('')||empty('No source-linked advisories have been published.')}</section><section><h2>Town halls & questions</h2>${halls.items.map(h=>`<article class="card"><h3>${esc(h.title)}</h3><p>${esc(h.host)} · ${date(h.starts_at)}</p>${h.questions.map(q=>`<div class="message"><p><strong>Question:</strong> ${esc(q.body)}</p>${q.answer?`<p><strong>Platform response:</strong> ${esc(q.answer)}</p>`:isAdmin()?`<button class="small" data-action="answer-question" data-id="${q.id}">Answer</button>`:''}</div>`).join('')}${new Date(h.starts_at)>new Date()?`<form class="questionForm" data-id="${h.id}">${textarea('Ask a question','body',{min:5,max:1000})}${formEnd('Submit question')}</form>`:badge('Questions closed','closed')}</article>`).join('')||empty('No town halls scheduled.')}</section></div>`;
}
function tripView(){
  const mode=state.user?.role==='citizen'?state.citizenMode:'private';
  const efficiency=mode==='truck'?3:mode==='boda'?30:12;
  return `${heading('Plan the fuel. Know the estimate.','Use your road distance and vehicle efficiency. Costs use fresh operational prices for the fuel you select.','MOBILITY / TRIP COST')}<div class="grid"><section class="card"><form id="tripForm"><div class="form-row">${field('Road distance (km)','distanceKm',{type:'number',min:.1,max:3000,step:.1,placeholder:'Distance from your navigation app'})}${field('Fuel efficiency (km per litre)','kmPerLitre',{type:'number',min:1,max:100,step:.1,value:efficiency})}</div>${fuelField(mode==='truck'?'diesel':'petrol')}<p class="small">For example: a boda at 30 km/L, a car at 12 km/L, or a truck at 3 km/L. These are editable starting estimates, not measured consumption. Adjust for your actual vehicle and conditions.</p>${formEnd('Estimate trip fuel cost')}</form></section><section class="card" id="tripResult">${empty('Enter the road distance to see fuel needed and an indicative cost. Prices and consumption can change.')}</section></div>`;
}
function trendChart(rows){
  if(!rows.length)return '';
  const values=rows.slice(-14),max=Math.max(...values.map(r=>r.average));
  return `<figure class="price-trend"><figcaption>Latest ${values.length} daily fuel averages <span>Zero baseline · UGX / litre</span></figcaption><div class="trend-plot" role="img" aria-label="Daily average accepted update prices, detailed in the table below">${values.map(r=>`<div class="trend-column"><strong>${Number(r.average).toLocaleString('en-UG')}</strong><div class="trend-bar-area"><span class="trend-bar ${r.fuel==='diesel'?'diesel':''}" style="height:${r.average/max*100}%"></span></div><small>${esc(String(r.day).slice(5,10))}<br>${esc(r.fuel)}</small></div>`).join('')}</div></figure>`;
}
const adminTabs=()=>[['dashboard','Overview'],['intelligence','Price intelligence'],...(isStaff()?[['reports','Price review'],['tickets','Consumer cases']]:[]),...(isAdmin()?[['applications','Operator access'],['directory','Station directory'],['publishing','Public information'],['media','Media management'],['users','User management'],['deletions','Deletion requests']]:[]),['audit','Audit trail']];
function commandHeading(){
  const headings={admin:[workspaceFor('admin').title,'Platform administration, source-backed intelligence and authorized operations.'],inspector:[workspaceFor('inspector').title,'Prioritize your assigned cases, examine evidence, and record accountable decisions.'],analyst:[workspaceFor('analyst').title,'Analyze published observations and accepted price history without unsupported predictions.']};
  const [title,description]=headings[state.user.role];return heading(title,description,'MAFUTAWATCH / COMMAND CENTER');
}
function commandPriorities(){const actions=state.user.role==='admin'?[['users','User verification & access','users'],['directory','Station registration','building'],['applications','Operator approvals','shield'],['tickets','Case operations','report'],['publishing','Sourced notices & directives','bell'],['audit','Audit records','clock']]:state.user.role==='inspector'?[['tickets','My assigned investigations','shield'],['reports','Price verification queue','report'],['audit','Decision audit trail','clock']]:[['intelligence','Price comparisons & history','chart'],['audit','System activity records','clock']];return `<section class="command-priorities" aria-label="Authorized workspace priorities">${actions.map(([tab,label,name])=>`<button data-action="admin-tab" data-tab="${tab}" ${state.user.role==='inspector'&&tab==='tickets'?'data-assignment="mine"':''}>${icon(name)}<span>${label}</span>${icon('arrow')}</button>`).join('')}</section>`;}
async function readinessStatus(){try{const response=await fetch('/health/ready',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(5000)});const value=await response.json();return {ready:response.ok&&value.status==='ready',checked:new Date().toISOString()};}catch(_error){return {ready:false,checked:new Date().toISOString()};}}
function readinessCard(status){return `<section class="card readiness-card"><div class="card-head"><h2>Operational readiness</h2>${badge(status.ready?'Ready':'Unavailable',status.ready?'verified':'flagged')}</div><p>${status.ready?'The application readiness endpoint confirmed database/schema access.':'The readiness endpoint could not confirm availability. Check deployment monitoring for details.'}</p><small>Checked ${date(status.checked)}. This is a readiness check, not an uptime, capacity or predictive health metric.</small><div class="actions"><a href="/health/ready" target="_blank" rel="noopener noreferrer">Inspect readiness response ↗</a><button class="quiet small" data-action="refresh">Refresh</button></div></section>`;}
function assignedCaseOverview(tickets){const assigned=tickets.filter(t=>t.assigned_to===state.user.id&&!['resolved','closed'].includes(t.status));return `<section class="card"><div class="card-head"><h2>Your assigned investigations</h2><button class="small" data-action="admin-tab" data-tab="tickets" data-assignment="mine">Open assigned queue</button></div><p class="small">${assigned.length} active assigned cases in the latest ${tickets.length} accessible records. Deadlines are server-owned.</p>${ticketCards(assigned.slice(0,5))}</section>`;}
async function intelligencePanel(){const [d,stations]=await Promise.all([api('/admin/dashboard'),loadDirectory()]);state.discoveryStations=stations;const fuel=state.analyticsFuel||'all',history=d.trend.filter(r=>fuel==='all'||r.fuel===fuel),regions=state.summary.regions.filter(r=>fuel==='all'||r.fuel===fuel);return `<form id="intelligenceFilter" class="intelligence-toolbar">${select('Fuel view','fuelView',[['all','All reported fuels'],...fuelOptions],fuel)}<button type="submit">Apply fuel view</button><button type="button" class="primary" data-action="export-price-history" ${history.length?'':'disabled'}>Export accepted history CSV</button></form><div class="metrics">${metric(d.verified,'Verified reports · all time')}${metric(state.summary.stations-state.summary.demo_stations,'Operational directory stations')}${metric(regions.reduce((n,r)=>n+r.samples,0),'Fresh published fuel records')}${metric(history.length,'Daily history rows in view')}</div><div class="grid"><section class="card"><h2>Regional fuel comparisons</h2><p class="small">Fresh operational prices in UGX per litre. Demo and stale entries excluded.</p>${regionChart(regions)}</section><section class="card"><h2>Accepted historical observations</h2><p class="small">Actual daily averages of accepted updates in the last 30 days. Missing dates are not imputed.</p>${trendChart(history)}${history.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Fuel</th><th>Average UGX/L</th></tr></thead><tbody>${history.map(r=>`<tr><td>${esc(r.day)}</td><td>${esc(r.fuel)}</td><td>${money(r.average)}</td></tr>`).join('')}</tbody></table></div>`:empty('No accepted price history for this fuel view.')}</section></div><div class="grid"><section class="card"><h2>Station activity distribution</h2>${stationDistribution(stations)}</section><section class="card"><h2>Recent verified public updates</h2>${recentPriceUpdates(stations)}</section></div><section class="workspace-map-panel"><div class="card-head"><h2>Station network discovery</h2><a href="#stations">Open public explorer ↗</a></div><p class="small">Public directory locations and source-labeled prices. Map filters are independent from the analytical fuel view above.</p>${discoveryMarkup(stations,state.discoveryPreferences)}</section>`;}
async function adminView(){
  if(!['admin','inspector','analyst'].includes(state.user?.role))return state.user?`${heading('Workspace access is restricted.','Your current account does not have an administrator, inspector or analyst role.')}<a class="button primary" href="#${workspaceFor(state.user.role).page}">Return to ${esc(workspaceFor(state.user.role).title)}</a>`:loginCard('This workspace is restricted to provisioned operations staff.');
  if(!adminTabs().some(([id])=>id===state.adminTab))state.adminTab='dashboard';
  const shell=`${commandHeading()}<nav class="workspace-tabs" aria-label="Operations sections">${adminTabs().map(([id,text])=>`<button data-action="admin-tab" data-tab="${id}" class="${state.adminTab===id?'active':''}">${text}</button>`).join('')}</nav>`;
  if(state.adminTab==='intelligence')return shell+commandPriorities()+await intelligencePanel();
  if(state.adminTab==='dashboard'){
    const [d,health,tickets]=await Promise.all([api('/admin/dashboard'),isAdmin()?readinessStatus():Promise.resolve(null),state.user.role==='inspector'?api('/tickets?limit=50'):Promise.resolve({items:[]})]);return shell+commandPriorities()+`<div class="metrics">${metric(d.reports,'Total price observations')}${metric(d.review_queue,'Observations awaiting review',true)}${metric(d.overdue,'Cases beyond response target',true)}${metric(d.signed_in_today,'Accounts signed in today')}</div>${state.user.role==='inspector'?assignedCaseOverview(tickets.items):''}<div class="grid"><section class="card"><h2>Verification & response</h2><div class="list-item">Verified observations <strong>${d.verified}</strong></div><div class="list-item">Pending station applications <strong>${d.applications}</strong></div><div class="list-item">Mean time to first officer response <strong>${d.average_response_hours==null?'Not enough data':`${d.average_response_hours}h`}</strong></div><p class="small">Signed-in accounts count distinct accounts with a session created today. It is not a total visitor count.</p><button data-action="export-dashboard">Download KPI CSV</button></section><section class="card"><h2>Accepted price observations · last 30 days</h2><p class="small">Daily average of accepted updates; not a continuously sampled national index. Missing dates have no observations.</p>${trendChart(d.trend)}${d.trend.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Fuel</th><th>Average UGX/L</th></tr></thead><tbody>${d.trend.map(p=>`<tr><td>${esc(String(p.day).slice(0,10))}</td><td>${esc(p.fuel)}</td><td>${money(p.average)}</td></tr>`).join('')}</tbody></table></div>`:empty('No accepted operational price history yet.')}</section></div>${health?readinessCard(health):''}`;
  }
  if(state.adminTab==='reports'){const reports=await api(`/admin/reports?limit=50&offset=${state.adminOffset}`);return shell+`<section class="card"><h2>Verification queue</h2><p class="small">Check the observed price and source before verifying. A newer published price cannot be overwritten by an older report.</p>${reportTable(reports.items,true)}${pagination(state.adminOffset,reports.items.length,'admin-page')}</section>`;}
  if(state.adminTab==='tickets'){const tickets=await api(`/tickets?limit=50&offset=${state.adminOffset}${state.caseStatus?`&status=${encodeURIComponent(state.caseStatus)}`:''}`),assignment=state.caseAssignment||'all',visible=tickets.items.filter(t=>assignment==='all'||assignment==='mine'&&t.assigned_to===state.user.id||assignment==='unassigned'&&!t.assigned_to);return shell+`<form id="caseQueueFilter" class="case-queue-toolbar">${select('Case status','caseStatus',[['','All statuses'],['open','Open'],['investigating','Investigating'],['dispatched','Dispatched'],['resolved','Resolved'],['closed','Closed']],state.caseStatus||'',false)}${select('Assignment','caseAssignment',[['mine','Assigned to me'],['all','All accessible cases'],['unassigned','Unassigned cases']],assignment)}<button type="submit" class="primary">Apply case filters</button></form><p class="small">${visible.length} matched among ${tickets.items.length} loaded records. Assignment filtering applies to this page; use pagination for further accessible cases.</p>`+ticketCards(visible)+pagination(state.adminOffset,tickets.items.length,'admin-page');}
  if(state.adminTab==='applications'){const applications=await api(`/applications?limit=50&offset=${state.adminOffset}`);return shell+`<section class="card"><h2>Operator access review</h2><p>Validate the license and supporting documents with the issuing authority before approval. Approval grants access only to the named station.</p>${applicationCards(applications.items,true)}${pagination(state.adminOffset,applications.items.length,'admin-page')}</section>`;}
  if(state.adminTab==='audit'){const audit=await api(`/admin/audit?limit=50&offset=${state.adminOffset}`);return shell+`<section class="card"><div class="card-head"><h2>Append-only audit trail</h2><button class="small" data-action="export-audit">Export displayed rows</button></div><p class="small">Protected from update, delete and truncate by the application database role. Database owners retain infrastructure authority.</p><div class="table-wrap"><table><thead><tr><th>Time (EAT)</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead><tbody>${audit.items.map(a=>`<tr><td class="nowrap">${date(a.created_at)}</td><td>${esc(a.actor||'System CLI')}</td><td>${esc(a.action)}</td><td class="overflow-wrap">${esc(a.entity_id)}</td><td class="overflow-wrap"><small>${esc(JSON.stringify(a.details))}</small></td></tr>`).join('')}</tbody></table></div>${pagination(state.adminOffset,audit.items.length,'admin-page')}</section>`;}
  if(state.adminTab==='users'){const users=await api(`/admin/users?limit=50&offset=${state.adminOffset}`),assignable=['citizen','operator','inspector','analyst'];return shell+`<section class="card"><h2>Staff accounts & access</h2><p>Provision an inspector or analyst only after verifying their identity and appointment through your approved procedure. No email is sent; deliver the temporary password through a secure channel.</p><form id="staffProvision"><div class="form-row">${field('Email address','email',{type:'email',maxlength:254})}${field('Display name','displayName',{min:2,maxlength:80})}</div><div class="form-row">${select('Staff role','role',[['inspector','Inspector'],['analyst','Analyst']])}${field('Temporary password','password',{type:'password',min:12,maxlength:128})}</div><div class="form-row">${field('Confirm temporary password','confirmPassword',{type:'password',min:12,maxlength:128})}${field('Your administrator password','administratorPassword',{type:'password',maxlength:128})}</div>${field('Authorization reason','reason',{min:20,maxlength:500})}<label class="check"><input name="identityVerified" type="checkbox" required> I verified this person's identity and appointment.</label>${formEnd('Provision staff account')}</form><p class="small">Mark a citizen identity verified only after independently validating the person through the operating organization's identity procedure. Only assign a role after confirming the person and their authorization. A role change ends that account's active sessions and station integrations. Operator role assignment does not grant a station; station access still requires an approved application or assignment. Administrator roles remain CLI-managed.</p><div class="table-wrap"><table><thead><tr><th>Account</th><th>Role</th><th>Identity</th><th>Actions</th></tr></thead><tbody>${users.items.map(u=>`<tr><td>${esc(u.display_name)}<br><small>${esc(u.email)}</small></td><td>${esc(u.role)}</td><td>${badge(u.identity_verified?'Verified':'Not verified',u.identity_verified?'verified':'pending')}</td><td>${u.role!=='admin'?`<div class="actions"><select data-role-for="${u.id}" aria-label="Role for ${esc(u.display_name)}">${assignable.map(role=>`<option value="${role}"${role===u.role?' selected':''}>${role}</option>`).join('')}</select><button class="small" data-action="assign-role" data-id="${u.id}" data-name="${esc(u.display_name)}" data-current="${u.role}">Update role</button></div><div class="actions"><button class="small" data-action="verify-user" data-id="${u.id}" data-value="${!u.identity_verified}">${u.identity_verified?'Remove identity verification':'Verify identity'}</button><button class="small danger" data-action="disable-user" data-id="${u.id}" data-value="${!u.disabled}">${u.disabled?'Restore account':'Disable account'}</button></div>`:'Administrator roles are managed through the deployment CLI.'}</td></tr>`).join('')}</tbody></table></div>${pagination(state.adminOffset,users.items.length,'admin-page')}</section><section class="card"><h2>Reset an account password</h2><p>Reset a non-administrator password only after verifying the request through your approved recovery procedure. Existing sessions and integration credentials are revoked; no email is sent.</p>${users.items.some(u=>u.role!=='admin')?`<form id="adminPasswordReset">${select('Account','userId',users.items.filter(u=>u.role!=='admin').map(u=>[u.id,`${u.display_name} · ${u.email}`]))}<div class="form-row">${field('New temporary password','newPassword',{type:'password',min:12,maxlength:128})}${field('Confirm temporary password','confirmPassword',{type:'password',min:12,maxlength:128})}</div>${field('Your administrator password','administratorPassword',{type:'password',maxlength:128})}${field('Authorization reason','reason',{min:20,maxlength:500})}${formEnd('Reset password and revoke access')}</form>`:'<p class="small">No non-administrator accounts are on this page.</p>'}</section>`;}
  if(state.adminTab==='directory'){
    const [operators,register,assignments,operatorAccounts]=await Promise.all([api('/operators'),api(`/admin/stations?limit=50&offset=${state.adminOffset}`),api(`/admin/assignments?limit=50&offset=${state.adminOffset}`),api('/admin/operator-accounts')]);
    return shell+`<div class="grid"><section class="card"><h2>Register an operator brand</h2><form id="operatorBrand">${field('Full operator name','name',{min:2,maxlength:150})}${field('Short name','shortName',{min:2,maxlength:30})}${formEnd('Add operator')}</form><hr><h2>Create a driver corridor</h2><form id="roomCreate">${field('Corridor room name','name',{min:3,maxlength:100})}${formEnd('Create corridor room')}</form></section>
      <section class="card"><h2>Register a verified station</h2><form id="stationCreate">${select('Operator','operatorId',operators.items.map(o=>[o.id,o.name]))}${field('Station name','name',{min:2})}<div class="form-row">${field('Area','area',{min:2,maxlength:100})}${field('District','district',{min:2,maxlength:100})}</div>${select('Region','region',[['Central','Central'],['Eastern','Eastern'],['Northern','Northern'],['Western','Western']])}<div class="form-row">${field('Latitude','latitude',{type:'number',min:-1.6,max:4.3,step:.000001})}${field('Longitude','longitude',{type:'number',min:29.5,max:35.1,step:.000001})}</div>${formEnd('Add station')}</form></section></div>
      <section class="card"><h2>Station register</h2>${register.items.map(s=>`<div class="list-item item-header"><div><strong>${esc(s.name)}</strong> <small>${esc(s.district)}${s.demo?' · Demo fixture':''}</small> ${s.active?'':badge('Inactive','closed')}</div><button class="small ${s.active?'danger':''}" data-action="deactivate-station" data-id="${s.id}" data-active="${!s.active}">${s.active?'Deactivate':'Reactivate'}</button></div>`).join('')||empty('No stations registered.')}${pagination(state.adminOffset,register.items.length,'admin-page')}</section>
      <section class="card"><h2>Assign an operator to a station</h2><p class="small">Station access is explicit and audited. Assign only an active operator account that has been authorized for this station.</p>${operatorAccounts.items.length&&register.items.some(s=>s.active)?`<form id="stationAssign">${select('Active station','stationId',register.items.filter(s=>s.active).map(s=>[s.id,`${s.name} · ${s.district}`]))}${select('Operator account','userId',operatorAccounts.items.map(u=>[u.id,`${u.display_name} · ${u.email}`]))}${field('Authorization reason','reason',{min:10,maxlength:500})}${formEnd('Assign station access')}</form>`:'<p class="small">Register an active station and create an operator account before assigning station access.</p>'}<h2>Station staff assignments</h2>${assignments.items.map(a=>`<div class="list-item item-header"><div><strong>${esc(a.display_name)}</strong><p class="small">${esc(a.email)} · ${esc(a.station_name)}</p></div><button class="small danger" data-action="revoke-assignment" data-id="${a.station_id}" data-user="${a.user_id}">Revoke station access</button></div>`).join('')||empty('No staff assignments on this page.')}</section>`;
  }
  if(state.adminTab==='media'){state.mediaContent=await api('/admin/media');return shell+mediaManagementMarkup(state.mediaContent);}
  if(state.adminTab==='deletions'){const requests=await api(`/admin/deletion-requests?limit=50&offset=${state.adminOffset}`);return shell+`<section class="card"><h2>Account deletion requests</h2><p class="small">Review each request and record your reason for the decision. Approving authorizes the separate, authorized deletion procedure; it never erases accounts or evidence automatically. Investigation records, financial evidence and legally required data are retained under the approved retention policy.</p>${deletionRequestTable(requests.items)}${pagination(state.adminOffset,requests.items.length,'admin-page')}</section>`;}
  const caps=await api('/caps');return shell+`<div class="grid"><section class="card"><h2>Publish a source-linked advisory</h2><form id="advisoryForm">${field('Title','title',{min:5})}${textarea('Release text','body',{min:10,max:10000})}${field('Original source URL (HTTPS)','sourceUrl',{type:'url',maxlength:2000})}${formEnd('Publish advisory')}</form></section><section class="card"><h2>Schedule a town hall</h2><form id="hallForm">${field('Session title','title',{min:5})}${field('Host / office','host',{min:2,maxlength:100})}${field('Starts at (your device local time)','startsAt',{type:'datetime-local'})}${formEnd('Schedule session')}</form></section><section class="card"><h2>Publish a district directive</h2><form id="capForm">${field('District','district',{min:2,maxlength:100})}<div class="form-row">${fuelField()}${priceField()}</div>${field('Authoritative source URL (HTTPS)','sourceUrl',{type:'url',maxlength:2000})}<div class="form-row">${field('Effective from (device local time)','effectiveFrom',{type:'datetime-local'})}${field('Effective until (device local time)','effectiveUntil',{type:'datetime-local'})}</div>${formEnd('Save sourced directive')}</form></section><section class="card"><h2>Currently effective directives</h2>${capTable(caps.items)}</section></div>`;
}
function privacyView(){return `${heading('Privacy & data use.','Understand what the platform stores and who can see it.','PLATFORM / YOUR INFORMATION')}<section class="card"><h2>What is collected</h2><p>Your account stores an email address, display name and password hash. Price reports include station, price, note, time and optional GPS coordinates. Station reviews and community messages show your display name only when you enable Show my display name publicly in My profile; otherwise you appear as Anonymous Member. Your account email is available to authorized administrators.</p><h2>Private complaints & evidence</h2><p>Consumer cases, conversations and uploaded evidence are available to the submitting account and authorized administrators/case officers. Operator applications and license evidence are available to the applicant and approving administrators. Files are downloaded, not publicly hosted.</p><h2>Purpose & retention</h2><p>Records support fuel-price transparency, complaint investigation and abuse prevention. Sessions expire after 12 hours. Rate-limit identifiers are hashed. In-app notifications are cleaned after 90 days when scheduled maintenance runs. The deployment operator must publish its controller identity, contact details and approved retention policy before collecting live data.</p><h2>Your access & corrections</h2><p>Use My activity to view your reports and notifications, and the complaint workspace for your cases. Request access, corrections, deletion or account recovery from the organization operating this deployment. The administrator must verify ownership before processing requests.</p><h2>External providers</h2><p>Map tiles are requested from OpenStreetMap; directions open Google Maps. Those providers receive ordinary connection metadata and the destination you choose. Optional routing services receive submitted route coordinates. Passwords, session tokens and private case data are never stored in localStorage or the offline cache.</p><h2>Offline operation</h2><p>The application shell can open offline. Operational data and writes require a live connection. Failed submissions are not presented as accepted, and no sensitive records are silently queued on a shared device.</p></section>`;}

async function newsView(){
  const items=(await api('/news')).items??[];
  return `${heading('Energy News & Updates','Verified reporting on Uganda’s fuel, energy and transport sectors.','ENERGY NEWSROOM')}<section id="publicMediaContent" class="grid three">${items.map(newsCard).join('')||empty('No news articles published yet.')}</section>`;
}
async function mediaGalleryView(){
  const items=(await api('/media')).items??[];
  return `${heading('Photography & Media Gallery','Documented images of Uganda’s fuel stations, transport and energy sector.','PHOTOGRAPHY & MEDIA')}<section id="publicMediaContent" class="grid three">${items.map(imageCard).join('')||empty('No media gallery entries yet.')}</section>`;
}
async function videoCentreView(){
  const items=(await api('/videos')).items??[];
  return `${heading('Video & Education Centre','Learn about fuel prices, road safety and how MafutaWatch works.','VIDEO & EDUCATION')}<section id="publicMediaContent" class="grid three">${items.map(videoCard).join('')||empty('No videos published yet.')}</section>`;
}

function emailVerifyMessage(title,detail,{signIn=false}={}){
  return `${heading(title,detail,'ACCOUNT SECURITY')}<section class="card"><h2>${esc(title)}</h2><p>${esc(detail)}</p><div class="actions">${signIn?`<button class="primary" data-action="auth">Sign in to confirm</button>`:''}<a class="button secondary" href="#profile">Go to my profile</a></div></section>`;
}
function emailVerifiedView(){
  return `${heading('Email address updated.','Your new email address is now the address you sign in with.','ACCOUNT SECURITY')}<section class="card"><h2>You have been signed out</h2><p>Every previous session was signed out when the change was confirmed. Sign in with your new email address and your existing password; your reports, cases and settings are unchanged.</p><div class="actions"><button class="primary" data-action="auth">Sign in with the new address</button><a class="button secondary" href="#overview">Back to home</a></div></section>`;
}
async function emailVerifyView(){
  const pending=state.emailVerify;
  if(!pending)return emailVerifyMessage('This verification link is incomplete.','Open the link from your email again, or request a new email change from My profile.',{signIn:!state.user});
  if(pending.status==='pending'){
    if(!state.user)return emailVerifyMessage('Sign in to confirm your new email address.','Your verification link is valid for 24 hours. Sign in to the account you are changing and this confirmation completes automatically.',{signIn:true});
    pending.status='confirming';
    try{
      const result=await api('/me/email/confirm',{method:'POST',body:{token:pending.token}});
      if(result&&result.complete===false){pending.status='awaiting';pending.approved=result.approved??'new';}
      else{
        pending.status='done';state.user=null;setCsrf(null);updateAccount();refreshNotifications().catch(()=>{});
        history.replaceState(null,'',`${location.pathname}#email-verified`);
        state.page='email-verified';
        return emailVerifiedView();
      }
    }catch(error){
      pending.status='error';pending.message=error.message;
      if(error.status===401){state.user=null;setCsrf(null);updateAccount();pending.signIn=true;}
    }
  }
  if(pending.status==='awaiting'){
    const fromNew=pending.approved==='new';
    return emailVerifyMessage('One more confirmation is needed.',fromNew
      ?'Your new address is confirmed. Open the link we emailed to your current address to finish the change; until then your current address still signs you in and nothing has been modified.'
      :'Your current address has approved the change. Open the link we emailed to your new address to finish; the address does not change until that confirmation arrives.',{signIn:false});
  }
  if(pending.status==='confirming')return emailVerifyMessage('Confirming your new email address…','This takes a moment. Refresh the page if the confirmation does not complete.',{signIn:false});
  if(pending.status==='done')return emailVerifiedView();
  return emailVerifyMessage('We could not confirm this email address.',`${pending.message||'This link could not be used.'} Request a new email change from My profile to try again.`,{signIn:Boolean(pending.signIn)||!state.user});
}
const renderers={overview:overviewShell,prices:stationsView,stations:fuelDiscoveryView,services:servicesView,analytics:analyticsView,about:aboutView,contact:contactView,credits:creditsView,news:newsView,gallery:mediaGalleryView,videos:videoCentreView,profile:profileView,report:reportView,complaints:complaintsView,community:communityView,advisories:advisoriesView,trip:tripView,activity:activityView,operator:operatorView,admin:adminView,privacy:privacyView,'email-verify':emailVerifyView,'email-verified':emailVerifiedView};
const publicPages=new Set(['overview','prices','stations','services','analytics','advisories','about','contact','credits','privacy','news','gallery','videos']);
const summaryPages=new Set(['overview','analytics','admin','stations']);
function mountFuelDiscovery(){
  if(!$('#fuelDiscovery'))return;
  discovery=mountDiscovery($('#fuelDiscovery'),state.discoveryStations,{embeddedMap:state.page==='admin',initial:state.discoveryPreferences,position:state.discoveryPosition,asOf:state.summary?.as_of,onDetails:stationDetail,onChange:(filters,position)=>{state.discoveryPreferences=filters;state.discoveryPosition=position;}});
  if(state.locateOnArrival){state.locateOnArrival=false;discovery.locate();}
  if(state.mapStationOnArrival){discovery.select(state.mapStationOnArrival);state.mapStationOnArrival=null;}
}
function closeMenu(){const nav=$('#primaryNavigation');nav.classList.remove('is-open');$('#menuToggle').setAttribute('aria-expanded','false');$('#menuToggle').setAttribute('aria-label','Open navigation');}
const compactWorkspace=()=>matchMedia('(max-width: 900px)').matches;
function syncWorkspaceShell(){
  const workspace=document.body.dataset.shell==='workspace',compact=compactWorkspace();
  $('#sidebarToggle').hidden=!workspace;
  $('#workspaceSidebar').hidden=!workspace||(compact&&!state.sidebarOpen);
  $('#sidebarBackdrop').hidden=!(workspace&&compact&&state.sidebarOpen);
  $('#main').inert=workspace&&compact&&Boolean(state.sidebarOpen);
  $('.site-footer').inert=workspace&&compact&&Boolean(state.sidebarOpen);
  document.body.classList.toggle('sidebar-collapsed',workspace&&!compact&&Boolean(state.sidebarCollapsed));
  document.body.classList.toggle('sidebar-open',workspace&&compact&&Boolean(state.sidebarOpen));
  $('#sidebarToggle').setAttribute('aria-expanded',String(compact?Boolean(state.sidebarOpen):!state.sidebarCollapsed));
  $('#sidebarToggle').setAttribute('aria-label',compact?(state.sidebarOpen?'Close workspace navigation':'Open workspace navigation'):(state.sidebarCollapsed?'Expand workspace navigation':'Collapse workspace navigation'));
}
function decorateWorkspaceNav(){const icons={overview:'grid',stations:'pin',report:'report',complaints:'shield',community:'chat',advisories:'bell',trip:'route',activity:'chart',operator:'building',admin:'grid',profile:'user'};document.querySelectorAll('#navigation a').forEach(a=>{const text=a.textContent;a.innerHTML=`${icon(icons[a.dataset.page])}<span class="nav-text">${esc(text)}</span>`;a.title=text;});}
async function navigate(){
  const version=++routeVersion;
  const raw=location.hash.slice(1)||'overview';
  if(raw.startsWith('email-verify')){
    state.page='email-verify';
    const token=/^email-verify\?token=([a-f0-9]{64})$/.exec(raw)?.[1]??null;
    if(token){if(state.emailVerify?.token!==token)state.emailVerify={token,status:'pending'};}
    else state.emailVerify=null;
  }else if(raw==='email-verified'){state.page='email-verified';}
  else state.page=raw;
  if(!renderers[state.page])state.page='overview';
  closeMenu();state.sidebarOpen=false;document.body.dataset.shell=publicPages.has(state.page)?'public':'workspace';document.body.classList.toggle('is-home',state.page==='overview');syncWorkspaceShell();
  const pageNames={overview:'Home',prices:'Fuel prices',stations:'Fuel stations',services:'Citizen services',analytics:'Reports & analytics',activity:'My activity',operator:'Station workspace',admin:'Operations dashboard',complaints:'Consumer complaints',report:'Price observation',community:'Driver community',trip:'Trip planner',advisories:'Advisories',privacy:'Privacy',about:'About',contact:'Contact',credits:'Photography credits',profile:'My profile',news:'Energy News',gallery:'Media Gallery',videos:'Video Centre','email-verify':'Verify email address','email-verified':'Email address updated'};
  $('#errorBanner').hidden=true;$('#breadcrumb').textContent=pageNames[state.page]||state.page;
  document.querySelectorAll('[data-page]').forEach(a=>{a.classList.toggle('active',a.dataset.page===state.page);if(a.dataset.page===state.page)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  document.querySelectorAll('[data-public-page]').forEach(a=>{if(a.dataset.publicPage===state.page)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  mediaManager?.destroy();mediaManager=null;discovery?.destroy();discovery=null;if(map){map.remove();map=null;}$('#view').setAttribute('aria-busy','true');
  try{
    syncDemoBanner();
    if(state.page==='overview'){
      $('#view').innerHTML=overviewShell();
      renderCarousel();
      await hydrateOverview(version);
    }else{
      $('#view').innerHTML='<div class="loading-surface"><p class="loading-message" role="status">Loading current records…</p><div aria-hidden="true"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div></div>';
      if(state.bootError){
        try{
          const session=await api('/auth/session');
          state.user=session.user;setCsrf(session.csrfToken);state.bootError=null;
          await loadPreferences().catch(()=>{});updateAccount();
        }catch(error){state.bootError=error;throw error;}
      }
      if(summaryPages.has(state.page))await summary();
      const html=await renderers[state.page]();
      if(version!==routeVersion)return;
      $('#view').innerHTML=html;
      if($('#fuelDiscovery'))mountFuelDiscovery();
    }
    if(version!==routeVersion)return;
    if(state.page==='report'&&state.reportStation){$('#reportForm [name=stationId]').value=state.reportStation;delete state.reportStation;}
    if(state.page==='complaints'&&state.citizenMode&&$('#complaintForm'))$('#complaintForm [name=vehicleType]').value=state.citizenMode;
  }
  catch(error){if(version!==routeVersion)return;$('#view').innerHTML=empty('Unable to load current records. Check your connection and use Refresh data.');showError(error);$('#connection').textContent='Unavailable';}
  finally{if(version===routeVersion){$('#view').setAttribute('aria-busy','false');mountPasswordToggles($('#view'));if($('#mediaManagement'))mediaManager=mountMediaManagement($('#mediaManagement'),state.mediaContent,{onSaved:announceContentUpdate});}}
}
function validateFiles(files){if(files.length>3)throw new Error('Choose no more than three files.');for(const file of files)if(file.size>5242880||!['image/png','image/jpeg','application/pdf'].includes(file.type))throw new Error('Use JPEG, PNG or PDF files, each no larger than 5 MiB.');}
async function uploadFiles(kind,id,files){for(const file of files)await api(`/${kind}/${id}/attachments`,{method:'POST',headers:{'content-type':file.type,'x-file-name':file.name.replace(/[^\x20-\x7E]/g,'_')},raw:file});}
function csv(rows,filename){
  if(!rows.length)return toast('No data to export.');
  const columns=Object.keys(rows[0]);const cell=value=>{let s=typeof value==='object'?JSON.stringify(value):String(value??'');if(/^[\s]*[=+\-@\t\r\n]/.test(s))s=`'${s}`;return `"${s.replace(/"/g,'""')}"`;};
  const text=[columns.map(cell).join(','),...rows.map(r=>columns.map(c=>cell(r[c])).join(','))].join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff',text],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`${filename}-${new Date().toISOString().slice(0,10)}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const infoTitles={about:'About MafutaWatch',advisories:'Advisories & town halls',contact:'Help & contact',privacy:'Privacy & data use',credits:'Photography credits'};
const infoPages=new Set(['about','advisories','contact','privacy','credits']);
let infoCurrent=null,infoStack=[];
async function renderInfo(kind){const renderer=renderers[kind];if(!renderer)return'';try{return await renderer();}catch(error){return `<div class="empty">${esc(error.message||'This information is unavailable right now.')}</div>`;}}
async function openInfo(kind){if(infoCurrent!==null&&infoCurrent!==kind)infoStack.push(infoCurrent);infoCurrent=kind;const html=await renderInfo(kind);$('#infoTitle').textContent=infoTitles[kind]||'Information';$('#infoContent').innerHTML=html;$('#backInfo').hidden=infoStack.length===0;$('#infoDialog').showModal();}
async function showInfoBack(){const prev=infoStack.pop();if(prev===undefined)return;infoCurrent=prev;const html=await renderInfo(prev);$('#infoTitle').textContent=infoTitles[prev]||'Information';$('#infoContent').innerHTML=html;$('#backInfo').hidden=infoStack.length===0;}
function renderCarousel(){const track=$('.carousel-track');if(!track)return;const slides=track.querySelectorAll('.carousel-slide');if(!slides.length)return;const dots=$('.carousel-dots');const idx=((state.carouselIndex%slides.length)+slides.length)%slides.length;state.carouselIndex=idx;slides.forEach((s,i)=>{s.style.display=i===idx?'block':'none';});if(dots)dots.querySelectorAll('.carousel-dot').forEach((d,i)=>{d.classList.toggle('active',i===idx);});}
async function action(button){
  const id=button.dataset.id,kind=button.dataset.action;
  if(kind==='skip'){$('#main').focus();return;}
  if(kind==='open-info'){await openInfo(button.dataset.info);return;}
  if(kind==='close-info'){$('#infoDialog').close();infoCurrent=null;infoStack=[];return;}
  if(kind==='back-info'){await showInfoBack();return;}
  if(kind==='auth')return openAuth();
  if(kind==='staff-auth')return openAuth('staff');
  if(kind==='register')return openAuth('register');
  if(kind==='menu'){state.sidebarOpen=false;syncWorkspaceShell();const open=$('#primaryNavigation').classList.toggle('is-open');button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Close navigation':'Open navigation');return;}
  if(kind==='sidebar'){closeMenu();if(compactWorkspace())state.sidebarOpen=!state.sidebarOpen;else state.sidebarCollapsed=!state.sidebarCollapsed;syncWorkspaceShell();if(compactWorkspace()&&state.sidebarOpen)$('#navigation a:not([hidden])').focus();return;}
  if(kind==='sidebar-close'){state.sidebarOpen=false;syncWorkspaceShell();$('#sidebarToggle').focus();return;}
  if(kind==='notifications')return notificationDialog();
  if(kind==='price-map'){const el=$('#stationMap'),opening=el.hidden;el.hidden=!opening;button.textContent=opening?'Back to List':'Map View';button.setAttribute('aria-expanded',String(opening));if(!opening){map?.remove();map=null;return;}try{await loadLeaflet();if(el.isConnected&&!el.hidden)initMap();}catch(error){if(el.isConnected)el.innerHTML=empty(error.message);}return;}
  if(kind==='citizen-mode'){if(state.user?.role==='citizen'&&['private','boda','truck'].includes(button.dataset.mode)){state.citizenMode=button.dataset.mode;return navigate();}return;}
  if(kind==='find-nearby'){if(discovery){$('#fuelDiscovery').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});return discovery.locate();}state.locateOnArrival=true;location.hash='stations';return;}
  if(kind==='station-map'){const station=state.assigned.find(s=>s.id===Number(id));if(!station)return;state.discoveryPreferences={q:station.name,district:'',fuel:'petrol',sort:'name',freshness:'all',radius:'',verifiedOnly:false};state.discoveryPosition=null;state.mapStationOnArrival=station.id;location.hash='stations';return;}
  if(kind==='account'){location.hash=workspaceFor(state.user?.role).page;return;}
  if(kind==='close-auth'){ $('#authDialog').close();return;}
  if(kind==='close-detail'){ $('#detailDialog').close();return;}
  if(kind==='toggle-register'){state.authMode=state.authMode==='login'?'register':'login';renderAuth();return;}
  if(kind==='logout'){await api('/auth/logout',{method:'POST',body:{}});state.user=null;state.ticket=null;state.assigned=[];state.discoveryPosition=null;state.position=null;state.citizenMode='private';setCsrf(null);$('#detailDialog').close();updateAccount();if(location.hash==='#overview')return navigate();location.hash='overview';return;}
  if(kind==='refresh')return navigate();
  if(kind==='station')return stationDetail(Number(id));
  if(kind==='ticket'){if(authRequired())return ticketDetail(id);return;}
  if(kind==='report-station'){state.reportStation=id;$('#detailDialog').close();if(location.hash==='#report')return navigate();location.hash='report';return;}
  if(kind==='subscribe'){if(!authRequired())return;await api(`/stations/${id}/subscription`,{method:'PUT',body:{enabled:button.dataset.enabled==='true'}});toast('Price-change preference saved.');return stationDetail(Number(id));}
  if(kind==='locate'||kind==='report-gps'){
    if(!navigator.geolocation)throw new Error('Location is not supported on this device.');
    const pos=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,()=>reject(new Error('Location unavailable or permission denied. You can still search by area.')),{timeout:10000,maximumAge:60000}));
    const coords={latitude:pos.coords.latitude,longitude:pos.coords.longitude};
    if(kind==='locate'){state.position=coords;state.offset=0;return navigate();}
    $('#reportForm').dataset.latitude=coords.latitude;$('#reportForm').dataset.longitude=coords.longitude;$('#gpsStatus').textContent='GPS attached. Shared only with authorized reviewers.';return;
  }
  if(kind==='clear-location'){state.position=null;state.offset=0;return navigate();}
  if(kind==='stations-page'){state.offset=Number(button.dataset.offset);return navigate();}
  if(kind==='activity-page'){state.activityOffset=Number(button.dataset.offset);return navigate();}
  if(kind==='admin-page'){state.adminOffset=Number(button.dataset.offset);return navigate();}
  if(kind==='room'){state.room=Number(id);return navigate();}
  if(kind==='admin-tab'){state.adminTab=button.dataset.tab;if(button.dataset.assignment)state.caseAssignment=button.dataset.assignment;state.adminOffset=0;await rememberSetting('admin',{lastAdminTab:state.adminTab});return navigate();}
  if(kind==='carousel-prev'){state.carouselIndex=(state.carouselIndex||0)-1;renderCarousel();return;}
  if(kind==='carousel-next'){state.carouselIndex=(state.carouselIndex||0)+1;renderCarousel();return;}
  if(kind==='carousel-dot'){state.carouselIndex=Number(button.dataset.index);renderCarousel();return;}
  if(kind==='open-lightbox'){const media=(await api('/media')).items??[];const m=media.find(x=>x.id===button.dataset.media);if(!m)return;$('#lightboxTitle').textContent=m.title;$('#lightboxContent').innerHTML=imageCard({...m,thumbnail_url:null});const image=$('#lightboxContent img'),trigger=$('#lightboxContent .media-image-button');if(image)trigger.replaceWith(image);else trigger.remove();$('#mediaLightbox').showModal();return;}
  if(kind==='close-lightbox'){$('#mediaLightbox').close();return;}
  if(kind==='open-video'){const videos=(await api('/videos')).items??[];const v=videos.find(x=>x.id===button.dataset.video);if(!v)return;$('#lightboxTitle').textContent=v.title;$('#lightboxContent').innerHTML=videoPlayer(v.video_url,v.title,v.thumbnail_url)+`<p>${esc(v.description)}</p><p class="small">${esc(v.source||'Source not recorded')} · ${esc(v.license)} · ${esc(v.duration)}</p>`;$('#mediaLightbox').showModal();return;}
  if(kind==='read-notifications'){const shown=button.closest('#detailDialog')?state.notifications.slice(0,10):state.notifications;await api('/me/notifications/read',{method:'POST',body:{ids:shown.filter(n=>!n.read_at).map(n=>n.id)}});await refreshNotifications();if($('#detailDialog').open)$('#detailDialog').close();return navigate();}
  if(['vote','hide-message'].includes(kind)){if(!authRequired())return;await api(`/messages/${id}${kind==='vote'?'/vote':''}`,{method:kind==='vote'?'PUT':'DELETE',body:{}});return navigate();}
  if(kind==='revoke-token'){await api(`/tokens/${id}`,{method:'DELETE'});toast('Credential revoked.');return navigate();}
  if(kind==='revoke-assignment'){if(!confirm('Revoke this station assignment and its integration credentials?'))return;await api(`/admin/stations/${id}/staff/${button.dataset.user}`,{method:'DELETE'});toast('Station access revoked.');return navigate();}
  if(kind==='assign-role'){
    const select=button.parentElement.querySelector('select'),role=select?.value,name=button.dataset.name||'this account';
    if(!role||role===button.dataset.current)return;
    if(!confirm(`Assign the ${role} role to ${name}? Their active sessions and station integrations will be revoked.`))return;
    const reason=prompt(`Record the authorization and evidence for assigning the ${role} role to ${name}:`);if(!reason)return;
    await api(`/admin/users/${id}`,{method:'PATCH',body:{role,reason}});toast('Account role updated and recorded.');return navigate();
  }
  if(['review-report','review-application','answer-question','verify-user','disable-user','deactivate-station'].includes(kind)){
    const reason=prompt(kind==='answer-question'?'Enter the platform response:':'Record the evidence checked and reason for this decision:');if(!reason)return;
    if(kind==='review-report')await api(`/admin/reports/${id}`,{method:'PATCH',body:{status:button.dataset.status,reason}});
    if(kind==='review-application')await api(`/applications/${id}`,{method:'PATCH',body:{status:button.dataset.status,reason}});
    if(kind==='answer-question')await api(`/questions/${id}`,{method:'PATCH',body:{answer:reason}});
    if(kind==='verify-user'||kind==='disable-user')await api(`/admin/users/${id}`,{method:'PATCH',body:{[kind==='verify-user'?'identityVerified':'disabled']:button.dataset.value==='true',reason}});
    if(kind==='deactivate-station')await api(`/admin/stations/${id}`,{method:'PATCH',body:{active:button.dataset.active==='true',reason}});
    toast('Decision saved and recorded.');return navigate();
  }
  if(kind==='deletion-review'){
    const request=(await api(`/admin/deletion-requests/${id}`)).request;
    if(!request)return;
    $('#detailTitle').textContent='Deletion request review';
    $('#detailContent').innerHTML=`<p><strong>${esc(request.display_name)}</strong> · ${esc(request.email)} · ${badge(request.role)}</p><p class="small">Submitted ${date(request.created_at)} · ${badge(request.status.replaceAll('_',' '),request.status)}</p><p class="notice-text">${esc(request.reason)}</p>${request.user_response?`<p class="small"><strong>Account response:</strong> ${esc(request.user_response)}</p>`:''}${request.review_note?`<p class="small"><strong>Previous note:</strong> ${esc(request.review_note)}</p>`:''}<form id="deletionReviewForm"><p class="small">Every decision requires a recorded reason of at least 10 characters. Approving authorizes the separate, authorized deletion procedure; it never erases accounts or evidence. Investigation records, financial evidence and legally required data are retained under the approved retention policy.</p>${textarea('Recorded reason','note',{min:10,max:1000})}<div class="actions"><button class="small" data-action="deletion-decision" data-decision="request_info" data-id="${id}">Request information</button><button class="primary" data-action="deletion-decision" data-decision="approve" data-id="${id}">Approve</button><button class="danger" data-action="deletion-decision" data-decision="reject" data-id="${id}">Reject</button></div></form>`;
    if(!$('#detailDialog').open)$('#detailDialog').showModal();
    return;
  }
  if(kind==='deletion-decision'){
    const note=$('#deletionReviewForm [name=note]')?.value.trim()??'';
    if(note.length<10)throw new Error('Record a reason of at least 10 characters for this decision.');
    await api(`/admin/deletion-requests/${button.dataset.id}`,{method:'PATCH',body:{action:button.dataset.decision,note}});
    $('#detailDialog').close();toast('Decision recorded. The member was notified.');return navigate();
  }
  if(kind==='export-dashboard'){csv([await api('/admin/dashboard')],'operations-kpis');return;}
  if(kind==='export-audit'){csv((await api(`/admin/audit?limit=50&offset=${state.adminOffset}`)).items,'audit');return;}
  if(kind==='export-price-history'){const d=await api('/admin/dashboard');csv(d.trend.filter(r=>!state.analyticsFuel||state.analyticsFuel==='all'||r.fuel===state.analyticsFuel),'accepted-price-history');return;}
  if(kind==='profile-save'){
    const form=$('#profileForm');const data=Object.fromEntries(new FormData(form));
    await api('/me/profile',{method:'PATCH',body:{displayName:data.displayName??undefined,preferredName:data.preferredName??undefined,phone:data.phone??undefined,district:data.district??undefined}});
    $('#profileSaveStatus').textContent='Saved.';setTimeout(()=>$('#profileSaveStatus').textContent='',3000);return navigate();
  }
  if(kind==='profile-email-save'){
    const form=$('#profileEmailForm');const data=Object.fromEntries(new FormData(form));
    if(!data.email||!data.emailPassword)throw new Error('Enter your new email and current password.');
    const result=await api('/me/email/change-request',{method:'POST',body:{newEmail:data.email,currentPassword:data.emailPassword}});
    toast(result?.message||'A verification link was sent to the new address. Your current address stays active until you confirm.');
    return navigate();
  }
  if(kind==='profile-avatar'){
    const input=document.getElementById('avatarFile');const file=input?.files?.[0];if(!file)throw new Error('Choose an image first.');
    if(file.size>2097152)throw new Error('Image must be no larger than 2 MiB.');
    const ext=file.name.slice(file.name.lastIndexOf('.')).toLowerCase();if(!['.jpg','.jpeg','.png','.webp'].includes(ext))throw new Error('Only JPEG, PNG or WebP images are accepted.');
    const ab=await file.arrayBuffer();await api('/me/avatar',{method:'PUT',headers:{'x-file-name':file.name,'content-type':file.type},raw:ab});
    input.value='';document.getElementById('avatarPreview').style.display='none';
    $('#avatarStatus').textContent='Profile picture updated.';setTimeout(()=>$('#avatarStatus').textContent='',3000);return navigate();
  }
  if(kind==='profile-avatar-remove'){await api('/me/avatar',{method:'DELETE'});document.getElementById('avatarPreview').style.display='none';$('#avatarStatus').textContent='Profile picture removed.';setTimeout(()=>$('#avatarStatus').textContent='',3000);return navigate();}
  if(kind==='unsubscribe'){await api(`/stations/${id}/subscription`,{method:'PUT',body:{enabled:false}});toast('Station removed from saved stations.');return navigate();}
  if(kind==='preferences-save'){
    const form=$('#preferencesForm');const data=Object.fromEntries(new FormData(form));
    const notifications={priceChanges:!!form.priceChanges.checked,reportUpdates:!!form.reportUpdates.checked,complaintUpdates:!!form.complaintUpdates.checked,advisories:!!form.advisories.checked};
    const privacy={publicDisplayName:!!form.publicDisplayName.checked};
    await api('/me/preferences',{method:'PATCH',body:{fuelType:data.fuelType||undefined,vehicleType:data.vehicleType||undefined,preferredDistrict:data.preferredDistrict?.trim()||undefined,notifications,privacy}});
    await loadPreferences();toast('Preferences saved.');return navigate();
  }
  if(kind==='role-settings-save'){
    const roleSettings=Object.fromEntries([...$('#roleSettingsForm').querySelectorAll('input[type=checkbox]')].map(input=>[input.name,input.checked]));
    await api('/me/preferences',{method:'PATCH',body:{roleSettings}});
    await loadPreferences();$('#roleSettingsStatus').textContent='Saved.';return;
  }
  if(kind==='password-save'){
    const form=$('#profilePasswordForm');const data=Object.fromEntries(new FormData(form));
    if(!data.currentPassword||!data.newPassword)throw new Error('Enter your current and new password.');
    await api('/auth/password',{method:'POST',body:{currentPassword:data.currentPassword,newPassword:data.newPassword}});
    state.user=null;updateAccount();toast('Password changed. Sign in again.');location.hash='overview';return navigate();
  }
  if(kind==='deletion-request'){
    const form=$('#deletionForm');const data=Object.fromEntries(new FormData(form));
    if(!data.reason||!data.delPassword)throw new Error('Enter a reason and your current password.');
    await api('/me/deletion-request',{method:'POST',body:{reason:data.reason,password:data.delPassword}});
    toast('Deletion request submitted for administrator review.');return navigate();
  }
}
async function submit(form){
  const data=Object.fromEntries(new FormData(form));const number=name=>Number(data[name]);
  if(form.id==='authForm'){
    const body={email:data.email,password:data.password};if(state.authMode==='register'){body.displayName=data.displayName;body.consent=data.consent==='on';}
    const session=await api(`/auth/${state.authMode==='register'?'register':'login'}`,{method:'POST',body});state.user=session.user;setCsrf(session.csrfToken);await loadPreferences().catch(()=>{});updateAccount();applySavedWorkspacePreferences();refreshNotifications().catch(()=>{});$('#authDialog').close();form.reset();toast(`Welcome, ${state.user.display_name}.`);
    if(['pending','awaiting'].includes(state.emailVerify?.status)){const target=`#email-verify?token=${state.emailVerify.token}`;if(location.hash===target)return navigate();location.hash=target;return;}
    const destination=workspaceFor(state.user.role).page;if(location.hash===`#${destination}`)return navigate();location.hash=destination;return;
  }
  if(form.id==='homeSearch'){state.filters={...state.filters,q:data.q,district:data.district,fuel:data.fuel,sort:'price'};state.position=null;state.offset=0;location.hash='prices';return;}
  if(form.id==='stationFilter'){state.filters={q:data.q,district:data.district,fuel:data.fuel,sort:data.sort,radius:data.radius};state.offset=0;return navigate();}
  if(form.id==='intelligenceFilter'){state.analyticsFuel=data.fuelView;await rememberSetting('analyst',{lastFuelView:data.fuelView});return navigate();}
  if(form.id==='caseQueueFilter'){state.caseStatus=data.caseStatus;state.caseAssignment=data.caseAssignment;state.adminOffset=0;await rememberSetting('inspector',{lastCaseStatus:data.caseStatus,lastCaseAssignment:data.caseAssignment});return navigate();}
  if(form.id==='tripForm'){
    const result=await api('/trip',{method:'POST',body:{distanceKm:number('distanceKm'),kmPerLitre:number('kmPerLitre'),fuel:data.fuel}});
    $('#tripResult').innerHTML=`<div class="eyebrow">INDICATIVE TRIP COST</div><div class="result-value">${money(result.cost)}</div><p>${result.distanceKm.toFixed(1)} km · ${result.litres.toFixed(1)} litres of ${esc(data.fuel)}</p><p>Fresh average: ${money(result.averagePrice)} per litre</p><p class="small">${esc(result.method)}. ${result.cost==null?'No fresh operational prices are available for this fuel.':'Allow for traffic, detours and your actual consumption.'}</p>`;return;
  }
  if(!authRequired())return;
  if(form.id==='reportForm'){
    const body={stationId:number('stationId'),fuel:data.fuel,price:number('price'),note:data.note};if(form.dataset.latitude){body.latitude=Number(form.dataset.latitude);body.longitude=Number(form.dataset.longitude);}
    const report=await api('/reports',{method:'POST',headers:{'idempotency-key':form.dataset.key},body});toast(`Observation received: ${report.status}. Track it in My activity.`);form.reset();form.dataset.key=crypto.randomUUID();delete form.dataset.latitude;delete form.dataset.longitude;$('#gpsStatus').textContent='Location not shared';return;
  }
  if(form.id==='complaintForm'||form.id==='applicationForm'){
    const files=[...form.elements.evidence.files];validateFiles(files);const kind=form.id==='complaintForm'?'tickets':'applications';
    if(!form.dataset.createdId){const body=kind==='tickets'?{stationId:number('stationId'),category:data.category,vehicleType:data.vehicleType,incidentDate:data.incidentDate,description:data.description}:{stationId:number('stationId'),licenseReference:data.licenseReference};
      const result=await api(`/${kind}`,{method:'POST',headers:{'idempotency-key':form.dataset.key},body});form.dataset.createdId=result.id;toast(kind==='tickets'?`Case ${result.reference} created. Uploading any selected evidence…`:'Application created. Uploading any selected evidence…');}
    try{await uploadFiles(kind,form.dataset.createdId,files);}catch(error){throw new Error(`The ${kind==='tickets'?'case':'application'} is saved, but evidence upload was not completed: ${error.message} Open the saved record to check attachments before retrying.`,{cause:error});}
    form.reset();delete form.dataset.createdId;toast('Submission saved. You can track it below.');return navigate();
  }
  if(form.id==='ticketEvidence'||form.classList.contains('applicationEvidence')){const files=[...form.elements.evidence.files];if(!files.length)throw new Error('Choose at least one file.');validateFiles(files);const kind=form.id==='ticketEvidence'?'tickets':'applications';await uploadFiles(kind,form.dataset.id,files);toast('Evidence stored securely.');return kind==='tickets'?ticketDetail(form.dataset.id,{refresh:true}):navigate();}
  if(form.id==='reviewForm'){await api(`/stations/${form.dataset.id}/reviews`,{method:'POST',body:{rating:number('rating'),body:data.body}});toast('Review saved.');return stationDetail(Number(form.dataset.id));}
  if(form.id==='ticketMessage'){await api(`/tickets/${form.dataset.id}/messages`,{method:'POST',body:{body:data.body}});return ticketDetail(form.dataset.id,{refresh:true});}
  if(form.id==='ticketAction'){await api(`/tickets/${form.dataset.id}`,{method:'PATCH',body:{status:data.status,assignedTo:data.assignedTo,reason:data.reason,version:Number(form.dataset.version)}});toast('Case decision saved.');return ticketDetail(form.dataset.id,{refresh:true});}
  if(form.id==='operatorPrice'){
    const station=state.assigned.find(s=>s.id===number('stationId'));const current=station?.prices.find(p=>p.fuel===data.fuel);
    await api(`/stations/${number('stationId')}/prices`,{method:'PUT',body:{fuel:data.fuel,price:number('price'),expectedUpdatedAt:current?.updated_at??null}});toast('Pump price published and followers notified.');return navigate();
  }
  if(form.id==='tokenForm'){const result=await api('/tokens',{method:'POST',body:{stationId:number('stationId'),name:data.name}});$('#tokenOnce').innerHTML=`<div class="token-once"><strong>Copy this credential now. It will not be displayed again.</strong><br><code>${esc(result.token)}</code><p class="small">Scoped to station #${number('stationId')}. Send as Authorization: Bearer &lt;credential&gt; to PUT /api/v1/stations/${number('stationId')}/prices.</p></div>`;toast('Credential created. Copy it before navigating away.');return;}
  if(form.id==='messageForm'){await api(`/rooms/${state.room}/messages`,{method:'POST',body:{body:data.body}});return navigate();}
  if(form.classList.contains('questionForm')){await api(`/town-halls/${form.dataset.id}/questions`,{method:'POST',body:{body:data.body}});toast('Question submitted.');return navigate();}
  if(form.id==='deletionResponseForm'){
    if((data.response??'').trim().length<10)throw new Error('Provide at least 10 characters of additional information.');
    await api('/me/deletion-request',{method:'PATCH',body:{response:data.response}});
    toast('Additional information sent. Your request is back in the administrator review queue.');return navigate();
  }
  if(form.id==='passwordForm'){await api('/auth/password',{method:'POST',body:{currentPassword:data.currentPassword,newPassword:data.newPassword}});state.user=null;setCsrf(null);updateAccount();toast('Password updated. Sign in again; previous sessions and credentials are revoked.');return navigate();}
  if(form.id==='adminPasswordReset'){
    if(data.newPassword!==data.confirmPassword)throw new Error('The temporary passwords do not match.');
    await api(`/admin/users/${data.userId}/password`,{method:'POST',body:{newPassword:data.newPassword,administratorPassword:data.administratorPassword,reason:data.reason}});
    form.reset();toast('Password reset. Existing sessions and credentials were revoked; deliver the temporary password securely.');return navigate();
  }
  if(form.id==='staffProvision'){
    if(data.password!==data.confirmPassword)throw new Error('The temporary passwords do not match.');
    if(data.identityVerified!=='on')throw new Error('Confirm that identity and appointment were verified.');
    const body={...data};delete body.confirmPassword;body.identityVerified=true;
    await api('/admin/staff',{method:'POST',body});form.reset();toast('Staff account created. No email was sent; deliver the temporary password through a secure channel.');return navigate();
  }
  if(form.id==='stationAssign'){await api(`/admin/stations/${number('stationId')}/staff`,{method:'POST',body:{userId:data.userId,reason:data.reason}});toast('Station assignment saved and audited.');return navigate();}
  const routes={operatorBrand:['/admin/operators','POST'],roomCreate:['/admin/rooms','POST'],stationCreate:['/admin/stations','POST'],advisoryForm:['/advisories','POST'],hallForm:['/town-halls','POST'],capForm:['/admin/caps','PUT']};
  if(routes[form.id]){
    if(form.id==='stationCreate')for(const name of ['operatorId','latitude','longitude'])data[name]=number(name);
    if(form.id==='capForm'){data.price=number('price');data.effectiveFrom=new Date(data.effectiveFrom).toISOString();data.effectiveUntil=new Date(data.effectiveUntil).toISOString();}
    if(form.id==='hallForm')data.startsAt=new Date(data.startsAt).toISOString();
    const [path,method]=routes[form.id];await api(path,{method,body:data});toast('Record saved and audited.');return navigate();
  }
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  if(button.tagName==='BUTTON'||button.dataset.action==='skip'||button.dataset.action==='open-info')event.preventDefault();
  button.disabled=true;try{await action(button);}catch(error){showError(error);toast(error.message);}finally{button.disabled=false;}
});
document.addEventListener('click',async event=>{
  const link=event.target.closest('#infoContent a[href^="#"]');if(!link)return;
  event.preventDefault();const kind=link.getAttribute('href').slice(1);
  if(infoPages.has(kind)){await openInfo(kind);return;}
  $('#infoDialog').close();infoCurrent=null;infoStack=[];location.hash=kind;
});
document.addEventListener('submit',async event=>{
  const form=event.target;event.preventDefault();if(form.dataset.busy)return;form.dataset.busy='true';
  const errorElement=form.id==='authForm'?$('#authError'):form.querySelector('.form-error');if(errorElement)errorElement.textContent='';
  const button=form.querySelector('button[type=submit]');const text=button?.textContent;if(button){button.disabled=true;button.textContent='Saving…';}
  try{await submit(form);}catch(error){if(errorElement)errorElement.textContent=error.message;else showError(error);if(error.status===401&&!$('#authDialog').open){state.user=null;updateAccount();}}
  finally{delete form.dataset.busy;if(button){button.disabled=false;button.textContent=text;}}
});
document.addEventListener('change',event=>{
  if(event.target.id==='avatarFile')avatarPreview(event.target);
  if(event.target.matches('#operatorPrice [name=stationId]'))rememberSetting('operator',{lastStationId:Number(event.target.value)}).catch(showError);
  if(event.target.closest('#operatorPrice')){const form=$('#operatorPrice');const station=state.assigned.find(s=>s.id===Number(form.elements.stationId.value));state.operatorStationId=station?.id;const p=station?.prices.find(p=>p.fuel===form.elements.fuel.value);$('#currentPrice').textContent=p?`Current ${p.fuel}: ${money(p.price)} · ${p.source} · ${date(p.updated_at)}`:'No current published price for this fuel.';if($('#operatorStationOverview'))$('#operatorStationOverview').innerHTML=operatorProfile(station);}
});
window.addEventListener('hashchange',()=>{if($('#authDialog').open)$('#authDialog').close();if($('#detailDialog').open)$('#detailDialog').close();navigate();});
document.addEventListener('click',event=>{const link=event.target.closest('#navigation a[href^="#"]');if(!link)return;state.sidebarOpen=false;syncWorkspaceShell();if(location.hash===link.getAttribute('href'))navigate();});
window.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if($('#primaryNavigation').classList.contains('is-open')){closeMenu();$('#menuToggle').focus();}if(state.sidebarOpen){state.sidebarOpen=false;syncWorkspaceShell();$('#sidebarToggle').focus();}});
matchMedia('(max-width: 900px)').addEventListener('change',()=>{state.sidebarOpen=false;syncWorkspaceShell();});
window.addEventListener('offline',()=>{$('#connection').textContent='Offline';showError(new Error('You are offline. Current records and submissions need a connection. Existing form entries are kept on this screen.'));});
window.addEventListener('online',()=>{$('#connection').textContent='Connected · refresh for current records';toast('Connection restored. Refresh data or retry your submission.');});
const contentChannel=typeof BroadcastChannel==='function'?new BroadcastChannel('mafutawatch-public-content'):null;
let refreshingContent=false;
function announceContentUpdate(){contentChannel?.postMessage('updated');}
async function refreshPublicContent(){
  if(refreshingContent||document.hidden||!['overview','news','gallery','videos'].includes(state.page)||$('#view').getAttribute('aria-busy')==='true')return;
  const version=routeVersion,page=state.page;refreshingContent=true;
  try{
    if(page==='overview'){
      const [media,news,videos]=await Promise.all([api('/media'),api('/news'),api('/videos')]);
      if(version!==routeVersion)return;
      const carousel=$('.photo-carousel');if(carousel){carousel.outerHTML=photoCarousel(media.items);renderCarousel();}
      if($('#homePublishing'))$('#homePublishing').outerHTML=homepagePublishing(news.items,videos.items);
    }else{
      const [endpoint,render,emptyText]={news:['/news',newsCard,'No news articles published yet.'],gallery:['/media',imageCard,'No media gallery entries yet.'],videos:['/videos',videoCard,'No videos published yet.']}[page];
      const result=await api(endpoint);if(version!==routeVersion)return;
      if($('#publicMediaContent'))$('#publicMediaContent').innerHTML=result.items.map(render).join('')||empty(emptyText);
    }
  }catch(_error){/* Keep the last confirmed content when a background refresh fails. */}
  finally{refreshingContent=false;}
}
contentChannel?.addEventListener('message',refreshPublicContent);
setInterval(refreshPublicContent,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshPublicContent();});
document.addEventListener('error',event=>{
  const target=event.target;
  if(!(target instanceof HTMLElement)||target.closest('#mediaEditor'))return;
  if(target instanceof HTMLImageElement&&target.isConnected&&target.getAttribute('src')){
    const avatar=target.classList.contains('avatar');
    const fallback=document.createElement('span');
    fallback.className=avatar?'avatar placeholder':'media-fallback';
    fallback.setAttribute('role','img');
    fallback.setAttribute('aria-label',avatar?'Profile picture unavailable':target.alt||'Image unavailable');
    fallback.textContent=avatar?'?':'Image unavailable';
    target.replaceWith(fallback);
  }else if(target instanceof HTMLVideoElement&&target.isConnected){
    const fallback=document.createElement('span');
    fallback.className='media-fallback media-fallback-video';fallback.setAttribute('role','img');fallback.setAttribute('aria-label','Video unavailable');fallback.textContent='This video could not be loaded.';
    target.replaceWith(fallback);
  }
},true);
$('#mediaLightbox').addEventListener('close',()=>{$('#lightboxContent').replaceChildren();});
async function initialize(){
  $('#copyrightYear').textContent=new Date().getFullYear();
  const sessionReady=api('/auth/session').then(session=>{state.user=session.user;setCsrf(session.csrfToken);}).catch(error=>{state.bootError=error;showError(error);});
  decorateWorkspaceNav();
  const deferred=location.hash===''||location.hash==='#overview';
  if(deferred){
    const firstPaint=navigate();
    await sessionReady;await loadPreferences().catch(()=>{});updateAccount();
    await firstPaint;
    if(state.page!=='overview')await navigate();
  }else{
    await sessionReady;await loadPreferences().catch(()=>{});updateAccount();
    await navigate();
  }
  refreshNotifications().catch(()=>{});
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
}
initialize();

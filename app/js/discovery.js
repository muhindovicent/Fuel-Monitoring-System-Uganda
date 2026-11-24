import {api,escapeHtml as esc,money,date} from './api.js';
import {icon} from './ui.js';
import {loadLeaflet} from './leaflet.js';

const sources=new Set(['operator','moderator','consensus']);
const defaults={q:'',district:'',fuel:'petrol',sort:'price',freshness:'all',radius:'',verifiedOnly:false};
const hoursOld=(price,now)=>(now-new Date(price.updated_at).getTime())/3600000;

export function publishedPrice(station,fuel){
  return station.prices.find(p=>p.fuel===fuel&&!station.demo&&sources.has(p.source)&&Number.isFinite(p.price)&&Number.isFinite(new Date(p.updated_at).getTime()));
}
export function freshPrice(station,fuel,now=Date.now()){
  const p=publishedPrice(station,fuel);
  return p&&!p.stale&&hoursOld(p,now)<=48?p:null;
}
export function distanceKm(a,b){
  const rad=n=>n*Math.PI/180;
  const h=Math.sin(rad(b.latitude-a.latitude)/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(rad(b.longitude-a.longitude)/2)**2;
  return 6371*2*Math.asin(Math.sqrt(Math.min(1,h)));
}
export function filterStations(stations,input={},position=null,now=Date.now()){
  const f={...defaults,...input},query=f.q.trim().toLowerCase(),district=f.district.trim().toLowerCase();
  const exactDistrict=Boolean(district)&&stations.some(s=>String(s.district||'').toLowerCase()===district);
  const exactArea=!exactDistrict&&Boolean(district)&&stations.some(s=>String(s.area||'').toLowerCase()===district);
  const matches=stations.filter(s=>{
    if(query&&![s.name,s.area,s.district,s.operator_name].some(v=>String(v||'').toLowerCase().includes(query)))return false;
    if(exactDistrict&&String(s.district||'').toLowerCase()!==district)return false;
    if(exactArea&&String(s.area||'').toLowerCase()!==district)return false;
    if(district&&!exactDistrict&&!exactArea&&![s.area,s.district].some(v=>String(v||'').toLowerCase().includes(district)))return false;
    const p=publishedPrice(s,f.fuel);
    if(f.verifiedOnly&&!freshPrice(s,f.fuel,now))return false;
    if(f.freshness!=='all'&&(!p||p.stale||hoursOld(p,now)>Number(f.freshness)))return false;
    return true;
  }).map(s=>({...s,distance:position?distanceKm(position,s):null})).filter(s=>!position||!f.radius||s.distance<=Number(f.radius));
  return matches.sort((a,b)=>{
    if(f.sort==='distance'&&position)return a.distance-b.distance||a.name.localeCompare(b.name);
    if(f.sort==='price'){
      const difference=(freshPrice(a,f.fuel,now)?.price??Infinity)-(freshPrice(b,f.fuel,now)?.price??Infinity);
      if(Number.isFinite(difference)&&difference!==0)return difference;
      if(freshPrice(a,f.fuel,now)&&!freshPrice(b,f.fuel,now))return -1;
      if(!freshPrice(a,f.fuel,now)&&freshPrice(b,f.fuel,now))return 1;
    }
    return a.name.localeCompare(b.name);
  });
}
const option=(value,label,selected)=>`<option value="${value}"${String(value)===String(selected)?' selected':''}>${label}</option>`;
const selector=(label,name,values,selected)=>`<label>${label}<select name="${name}" aria-label="${label}">${values.map(([v,l])=>option(v,l,selected)).join('')}</select></label>`;

export function discoveryMarkup(initial={}){
  const f={...defaults,...initial};
  return `<section class="fuel-discovery" id="fuelDiscovery" data-view="list" aria-label="Fuel discovery">
    <div class="discovery-view-controls" role="group" aria-label="Station view"><button data-discovery="list" aria-pressed="true" aria-controls="discoveryRail">List View</button><button data-discovery="map" aria-pressed="false" aria-controls="discoveryMapStage">Map View</button><button data-discovery="back" class="quiet" hidden>Back to List</button></div>
    <p id="homeMapStatus" class="discovery-map-status" role="status">Search stations and compare prices. Open Map View to explore locations.</p>
    <aside class="discovery-rail" id="discoveryRail"><div class="discovery-rail-heading"><div><span class="eyebrow">YOUR NEXT FUEL STOP</span><h3>Search & discover</h3></div><button class="discovery-sheet-toggle quiet" data-discovery="sheet" aria-expanded="true" aria-controls="discoveryResults" aria-label="Collapse station results">${icon('menu')}</button></div>
      <form id="homeMapFilter" class="discovery-controls">
        <label>Station name or area<input name="q" maxlength="100" value="${esc(f.q)}" placeholder="Station, operator or area"></label>
        <label>District or city<input name="district" maxlength="100" list="discoveryPlaces" value="${esc(f.district)}" placeholder="e.g. Kampala or Entebbe"></label>
        <datalist id="discoveryPlaces"></datalist>
        <div class="discovery-filter-pair">${selector('Fuel type','fuel',[['petrol','Petrol'],['diesel','Diesel'],['kerosene','Kerosene']],f.fuel)}${selector('Sort results','sort',[['price','Lowest fresh price'],['name','Station name'],['distance','Nearest first']],f.sort)}</div>
        <div class="discovery-filter-pair">${selector('Price freshness','freshness',[['all','All directory entries'],['48','Published within 48h'],['24','Published within 24h'],['6','Published within 6h']],f.freshness)}${selector('Distance radius','radius',[['','Any distance'],['3','Within 3 km'],['10','Within 10 km'],['25','Within 25 km'],['100','Within 100 km']],f.radius)}</div>
        <label class="check discovery-verified"><input name="verifiedOnly" type="checkbox" ${f.verifiedOnly?'checked':''}>Only fresh verified records</label>
        <div class="discovery-filter-pair"><button type="submit" class="primary">${icon('search')} Apply filters</button><button type="button" data-discovery="locate">${icon('pin')} Near me</button></div>
        <div class="discovery-filter-links"><button type="button" class="quiet" data-discovery="reset">Reset filters</button><button type="button" class="quiet" data-discovery="clear-location" disabled>Clear location</button></div>
      </form>
      <div class="discovery-results-heading"><span id="discoveryCount" role="status">Loading stations…</span><span>UGX / litre</span></div>
      <div class="discovery-results" id="discoveryResults" tabindex="0" aria-label="Matching station cards"></div>
    </aside>
    <div class="discovery-map-stage" id="discoveryMapStage" hidden><div id="stationMap" class="map discovery-map" aria-label="Interactive Uganda station map"></div>
      <div class="discovery-floating"><button class="discovery-mobile-filter" data-discovery="filters" aria-expanded="false" aria-controls="homeMapFilter">${icon('search')} Search & filters</button><button data-discovery="locate" aria-label="Find fuel near my location">${icon('pin')} Near me</button></div>
      <div class="discovery-map-caption"><span><i class="legend-dot published"></i>Fresh published price</span><span><i class="legend-dot sample"></i>Demo / no fresh price</span></div>
    </div>
  </section>`;
}

function priceStatus(station,fuel,now){
  const raw=station.prices.find(p=>p.fuel===fuel),fresh=freshPrice(station,fuel,now);
  if(station.demo||raw?.source==='demo')return {text:'Demonstration entry · sample prices',kind:'demo'};
  if(fresh)return {text:`Verified record · ${fresh.source}`,kind:'verified'};
  if(raw)return {text:'Outdated published observation',kind:'stale'};
  return {text:'No published price for this fuel',kind:'pending'};
}
function stationCard(station,fuel,now,selected){
  const status=priceStatus(station,fuel,now),p=station.prices.find(p=>p.fuel===fuel);
  return `<article class="discovery-card${selected?' selected':''}" data-station-card="${station.id}">
    <button class="station-select" data-discovery="select" data-id="${station.id}" aria-pressed="${selected}" aria-label="Show ${esc(station.name)} on map"><span class="station-brand-icon">${icon('pump')}</span><span><strong>${esc(station.name)}</strong><small>${esc(station.operator_name)} · ${esc(station.district)}</small></span></button>
    <div class="station-price-line"><div><small>${esc(fuel)} ${status.kind==='demo'?'sample price':'published price'}</small><strong>${p?money(p.price):'Not yet published'}</strong></div><span class="badge ${status.kind}">${status.kind==='verified'?'Verified':status.kind==='demo'?'Demo':status.kind==='stale'?'Stale':'No price'}</span></div>
    <p class="station-source">${esc(status.text)}</p><div class="station-card-meta"><span>${icon('clock')}${p?date(p.updated_at):'Awaiting an observation'}</span><span>${icon('pin')}${station.distance==null?esc(`${station.area}, ${station.district}`):`${station.distance.toFixed(1)} km away · straight line`}</span></div>
    <div class="station-card-actions"><button class="small quiet" data-discovery="select" data-id="${station.id}">${icon('pin')} Show on map</button><button class="small" data-discovery="details" data-id="${station.id}">View station ${icon('arrow')}</button></div>
  </article>`;
}

export function mountDiscovery(root,{initial={},position:initialPosition=null,asOf,onDetails,onChange,embeddedMap=false}={}){
  let map=null,locationMarker=null,position=initialPosition,filters={...defaults,...initial},matches=[],selected=null,limit=50,total=0,places=[];
  let disposed=false,geoRequest=0,loadToken=0,refreshPromise=null,pendingSelect=null,moreLoading=false,loadError=false,lastError=null;
  let sheetExpanded=false,filtersOpen=false,view='list',returnFocus=null,leafletReady=false;
  const markers=new Map(),media=matchMedia('(max-width: 900px)'),now=Number.isFinite(Date.parse(asOf))?Date.parse(asOf):Date.now();
  const find=selector=>root.querySelector(selector),form=find('#homeMapFilter'),results=find('#discoveryResults');
  const placeholder=document.createComment('Fuel discovery list position'),dialog=document.createElement('dialog');
  dialog.className='discovery-map-dialog';dialog.setAttribute('aria-label','Fuel discovery map');
  root.dataset.embedded=String(embeddedMap);find('.discovery-view-controls').hidden=embeddedMap;
  const status=text=>{find('#homeMapStatus').textContent=text;};
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>{if(map&&!disposed)map.invalidateSize({pan:false});}):null;
  observer?.observe(root);

  function discoveryQuery(offset){
    const query=new URLSearchParams({limit:'50',offset:String(offset)});
    const q=filters.q.trim();if(q)query.set('q',q);
    const district=filters.district.trim();if(district)query.set('district',district);
    if(filters.fuel)query.set('fuel',filters.fuel);
    query.set('sort',filters.sort==='distance'&&position?'distance':filters.sort==='price'?'price':'name');
    const freshHours=filters.verifiedOnly?Math.min(48,Number(filters.freshness)||48):filters.freshness!=='all'?Number(filters.freshness):NaN;
    if(Number.isFinite(freshHours))query.set('freshness',String(freshHours));
    if(position){query.set('lat',String(position.latitude));query.set('lng',String(position.longitude));if(filters.radius)query.set('radius',String(filters.radius));}
    return query;
  }
  const fetchPage=offset=>api(`/stations?${discoveryQuery(offset)}`);
  function fillPlaces(){
    const datalist=find('#discoveryPlaces');if(!datalist)return;
    datalist.innerHTML=places.map(p=>`<option value="${esc(p)}"></option>`).join('');
  }
  async function ensureLoaded(upto){
    const token=loadToken;
    while(!disposed&&token===loadToken&&matches.length<upto&&matches.length<total){
      const page=await fetchPage(matches.length);
      if(disposed||token!==loadToken)return false;
      if(!page.items.length)break;
      matches.push(...page.items.map(s=>position?{...s,distance:distanceKm(position,s)}:s));
    }
    return token===loadToken;
  }
  function errorResults(){return `<div class="empty discovery-error" role="alert">Station results are unavailable right now. ${esc(lastError?.message||'')} Use Refresh data to try again.</div>`;}
  async function refresh(){
    const token=++loadToken;root.setAttribute('aria-busy','true');
    try{
      const page=await fetchPage(0);
      if(disposed||token!==loadToken)return false;
      matches=page.items.map(s=>position?{...s,distance:distanceKm(position,s)}:s);
      total=Number.isFinite(page.total)?page.total:matches.length;
      loadError=false;lastError=null;
      if(page.places){places=[...new Set(page.places)].sort();fillPlaces();}
      if(!matches.some(s=>s.id===selected))selected=null;
      renderCards();panels();
      root.querySelector('[data-discovery="clear-location"]').disabled=!position;
      status(`${total.toLocaleString()} matching locations loaded${position?` · ${filters.radius?`within ${filters.radius} km · `:''}straight-line distance estimates`:''}. ${total>250?'Map shows the first 250 matches; narrow filters for more precision.':'Select a card or pin to explore a station.'}`);
      if(pendingSelect!==null){
        if(!matches.some(s=>s.id===pendingSelect)&&total>matches.length)await ensureLoaded(Math.min(total,250));
        const id=pendingSelect;pendingSelect=null;
        if(!disposed&&token===loadToken&&matches.some(s=>s.id===id))selectStation(id);
      }
      if(view==='map'){
        try{await ensureLoaded(Math.min(total,250));}catch{/* Keep the already-loaded markers if a follow-up page fails. */}
        if(!disposed&&token===loadToken)renderMap();
      }else renderMap();
      return true;
    }catch(error){
      if(disposed||token!==loadToken)return false;
      matches=[];total=0;loadError=true;lastError=error;selected=null;pendingSelect=null;
      renderCards();renderMap();panels();
      status('Station results are unavailable right now. Your filters are kept; use Refresh data to try again.');
      return false;
    }finally{if(!disposed&&token===loadToken)root.setAttribute('aria-busy','false');}
  }
  async function update(){
    limit=50;
    onChange?.({...filters},position);
    root.querySelector('[data-discovery="clear-location"]').disabled=!position;
    const promise=refresh().finally(()=>{if(refreshPromise===promise)refreshPromise=null;});
    refreshPromise=promise;
    return promise;
  }

  function fullscreen(){
    if(view==='map'&&media.matches&&!embeddedMap){
      if(!dialog.open){root.before(placeholder);document.body.append(dialog);dialog.append(root);dialog.showModal();document.body.classList.add('discovery-map-open');}
    }else if(dialog.open){
      dialog.close();placeholder.replaceWith(root);dialog.remove();document.body.classList.remove('discovery-map-open');
    }
  }
  function panels(){
    const mobileMap=view==='map'&&media.matches;
    root.dataset.view=view;find('#discoveryMapStage').hidden=view!=='map';
    find('[data-discovery="list"]').setAttribute('aria-pressed',String(view==='list'));
    find('[data-discovery="map"]').setAttribute('aria-pressed',String(view==='map'));
    find('[data-discovery="back"]').hidden=view!=='map';
    find('[data-discovery="sheet"]').hidden=!mobileMap;
    root.classList.toggle('sheet-expanded',sheetExpanded);root.classList.toggle('filters-open',filtersOpen);
    form.hidden=mobileMap&&!filtersOpen;results.hidden=mobileMap&&(!sheetExpanded||filtersOpen);
    find('[data-discovery="sheet"]').setAttribute('aria-expanded',String(sheetExpanded));
    find('[data-discovery="sheet"]').setAttribute('aria-label',sheetExpanded?'Collapse station results':'Expand station results');
    find('[data-discovery="filters"]').setAttribute('aria-expanded',String(filtersOpen));
    fullscreen();
    if(map)setTimeout(()=>{if(map&&!disposed)map.invalidateSize();},0);
  }
  async function showMap(id){
    if(disposed)return;
    if(view==='list'&&!embeddedMap)returnFocus=document.activeElement;
    if(id!==undefined){pendingSelect=id;sheetExpanded=true;}
    view='map';filtersOpen=false;panels();if(!embeddedMap)find('[data-discovery="back"]').focus();
    status('Loading map…');
    try{
      if(refreshPromise)await refreshPromise;
      if(disposed||view!=='map')return;
      status('Loading map…');
      if(loadError)throw lastError??new Error('Station results are unavailable right now.');
      if(pendingSelect!==null&&!matches.some(s=>s.id===pendingSelect))await ensureLoaded(Math.min(total,250));
      if(pendingSelect!==null){const pid=pendingSelect;pendingSelect=null;if(matches.some(s=>s.id===pid))selectStation(pid);}
      await ensureLoaded(Math.min(total,250));
      if(disposed||view!=='map')return;
      await loadLeaflet();
      if(disposed||view!=='map')return;
      leafletReady=true;
      renderMap();map.invalidateSize({pan:false});
      if(selected!==null)selectStation(selected);else status(`${matches.length} matching locations loaded. Select a station marker to check its price.`);
    }catch(error){
      if(disposed||view!=='map')return;
      find('#stationMap').textContent=error.message;status(error.message);
    }
  }
  function showList(){
    view='list';filtersOpen=false;map?.remove();map=null;markers.clear();locationMarker=null;find('#stationMap').replaceChildren();panels();
    status(`${matches.length} matching stations. Search and filter the list or open Map View.`);
    const target=returnFocus?.isConnected&&root.contains(returnFocus)?returnFocus:find('[data-discovery="map"]');target.focus();
  }
  function cardSelection(){root.querySelectorAll('[data-station-card]').forEach(card=>{
    const active=Number(card.dataset.stationCard)===selected;card.classList.toggle('selected',active);
    card.querySelector('.station-select').setAttribute('aria-pressed',String(active));
  });}
  function selectStation(id,fromMap=false){
    const station=matches.find(s=>s.id===id);if(!station)return;
    selected=id;
    if(fromMap){sheetExpanded=true;filtersOpen=false;panels();if(matches.indexOf(station)>=limit){limit=Math.ceil((matches.indexOf(station)+1)/50)*50;renderCards();}}
    for(const [markerId,marker] of markers)marker.setStyle({radius:markerId===id?12:8,color:markerId===id?'#0F2D52':freshPrice(matches.find(s=>s.id===markerId),filters.fuel,now)?'#008751':'#a87917',weight:markerId===id?4:2});
    cardSelection();
    const card=find(`[data-station-card="${id}"]`);
    if(fromMap&&card){const top=card.offsetTop-results.offsetTop;results.scrollTo({top,behavior:reduced()?'auto':'smooth'});}
    if(map){if(!markers.has(id))addMarker(station);const center=map.project([station.latitude,station.longitude],map.getZoom());if(media.matches&&sheetExpanded)center.y+=Math.min(160,map.getSize().y/4);map.panTo(map.unproject(center,map.getZoom()),{animate:!reduced()});markers.get(id)?.openPopup();}
    status(`${station.name} selected. ${priceStatus(station,filters.fuel,now).text}.`);
  }
  function addMarker(station){
    const L=window.L,marker=L.circleMarker([station.latitude,station.longitude],{radius:station.id===selected?12:8,color:freshPrice(station,filters.fuel,now)?'#008751':'#a87917',fillOpacity:.85,weight:2}).addTo(map);
    const popup=document.createElement('div'),title=document.createElement('strong'),info=document.createElement('p'),button=document.createElement('button');
    title.textContent=station.name;const price=station.prices.find(p=>p.fuel===filters.fuel);info.textContent=`${station.district} · ${filters.fuel}: ${price?money(price.price)+' / litre':'Not yet published'} · ${priceStatus(station,filters.fuel,now).text}`;button.textContent='View station';button.type='button';
    button.addEventListener('click',()=>Promise.resolve(onDetails?.(station.id)).catch(error=>status(error.message)));
    popup.append(title,info,button);marker.bindPopup(popup);marker.on('click',()=>selectStation(station.id,true));
    const element=marker.getElement();if(element){element.setAttribute('tabindex','0');element.setAttribute('role','button');element.setAttribute('aria-label',`Select ${station.name} on map`);element.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();selectStation(station.id,true);}});}
    markers.set(station.id,marker);return marker;
  }
  function renderMap(){
    if(view!=='map'||!leafletReady)return;
    const L=window.L,el=find('#stationMap');
    if(!L)return;
    if(!map){
      el.replaceChildren();
      map=L.map(el).setView([1.1,32.3],7);
      const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,referrerPolicy:'strict-origin-when-cross-origin',attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'});
      tiles.on('tileerror',()=>{if(!el.querySelector('.map-feedback')){const message=document.createElement('div');message.className='map-feedback';message.setAttribute('role','status');message.textContent='Basemap tiles unavailable. Station pins and linked results are still usable.';el.append(message);}});tiles.addTo(map);
    }
    for(const marker of markers.values())marker.remove();markers.clear();locationMarker?.remove();locationMarker=null;
    const points=matches.slice(0,250).map(s=>{addMarker(s);return [s.latitude,s.longitude];});
    if(position){locationMarker=L.circleMarker([position.latitude,position.longitude],{radius:7,color:'#2b64be',fillOpacity:1}).addTo(map);points.push([position.latitude,position.longitude]);}
    if(points.length)map.fitBounds(points,{paddingTopLeft:[35,media.matches?80:35],paddingBottomRight:[35,media.matches?Math.min(sheetExpanded?330:110,map.getSize().y/2):35],maxZoom:14,animate:false});
  }
  function renderCards(){
    results.innerHTML=loadError?errorResults():matches.length?matches.slice(0,limit).map(s=>stationCard(s,filters.fuel,now,s.id===selected)).join('')+(matches.length<total?'<button class="discovery-more" data-discovery="more">Show more matching stations</button>':''):'<div class="empty discovery-empty">No stations match these filters. Try widening the district, freshness or verified-price criteria. Demonstration prices never qualify as verified records.</div>';
    find('#discoveryCount').textContent=loadError?'Station results unavailable':`${total.toLocaleString()} matching stations`;
  }
  function readFilters(){return {...Object.fromEntries(new FormData(form)),verifiedOnly:form.elements.verifiedOnly.checked};}
  async function locate(){
    if(!navigator.geolocation){status('Location is not supported by this browser. Search by station or district instead.');return;}
    const request=++geoRequest;status('Requesting your location…');root.setAttribute('aria-busy','true');
    try{
      const found=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,()=>reject(new Error('Location unavailable or permission denied. No distance filter was applied; search by district or try sharing your location again.')),{timeout:10000,maximumAge:60000}));
      if(disposed||request!==geoRequest)return;
      position={latitude:found.coords.latitude,longitude:found.coords.longitude};form.elements.sort.value='distance';if(!form.elements.radius.value)form.elements.radius.value='10';
      filters=readFilters();filtersOpen=false;sheetExpanded=true;await update();
    }catch(error){if(!disposed&&request===geoRequest)status(error.message);}
    finally{if(!disposed&&request===geoRequest)root.setAttribute('aria-busy','false');}
  }
  async function apply(event){
    event.preventDefault();event.stopPropagation();filters=readFilters();
    if((filters.sort==='distance'||filters.radius)&&!position){await locate();return;}
    filtersOpen=false;sheetExpanded=true;
    const pending=update();
    if(media.matches&&view==='map')find('[data-discovery="sheet"]').focus();
    await pending;
  }
  async function click(event){
    const button=event.target.closest('[data-discovery]');if(!button)return;event.preventDefault();event.stopPropagation();
    const action=button.dataset.discovery,id=Number(button.dataset.id);
    if(action==='select')await showMap(id);
    if(action==='map')await showMap();
    if(action==='list'||action==='back')showList();
    if(action==='details'){selectStation(id);try{await onDetails?.(id);}catch(error){status(error.message);}}
    if(action==='locate')await locate();
    if(action==='more'&&!moreLoading&&!loadError&&matches.length<total){
      moreLoading=true;status('Loading more matching stations…');
      try{
        const token=loadToken,ok=await ensureLoaded(matches.length+50);
        if(!ok||disposed||token!==loadToken)return;
        limit+=50;renderCards();
        status(`${total.toLocaleString()} matching stations loaded. Select a card or pin to explore a station.`);
      }catch(error){if(!disposed)status(`Unable to load more stations right now. ${error.message}`);}
      finally{moreLoading=false;}
    }
    if(action==='sheet'){sheetExpanded=!sheetExpanded;filtersOpen=false;panels();}
    if(action==='filters'){filtersOpen=!filtersOpen;sheetExpanded=true;panels();if(filtersOpen)form.elements.q.focus();}
    if(action==='reset'){geoRequest++;root.setAttribute('aria-busy','false');position=null;filters={...defaults};form.reset();for(const [key,value]of Object.entries(filters)){if(key==='verifiedOnly')form.elements[key].checked=value;else form.elements[key].value=value;}await update();}
    if(action==='clear-location'){geoRequest++;root.setAttribute('aria-busy','false');position=null;form.elements.radius.value='';if(form.elements.sort.value==='distance')form.elements.sort.value='name';filters=readFilters();await update();}
  }
  function resize(){filtersOpen=false;panels();if(view==='map'&&!embeddedMap)find('[data-discovery="back"]').focus();}
  function keydown(event){if(event.key!=='Escape'||view!=='map')return;event.preventDefault();event.stopPropagation();if(filtersOpen){filtersOpen=false;panels();find('[data-discovery="filters"]').focus();}else if(!embeddedMap)showList();}
  function cancel(event){event.preventDefault();if(filtersOpen){filtersOpen=false;panels();find('[data-discovery="filters"]').focus();}else showList();}
  dialog.addEventListener('cancel',cancel);
  root.addEventListener('click',click);form.addEventListener('submit',apply);root.addEventListener('keydown',keydown);media.addEventListener('change',resize);
  update();
  if(embeddedMap)showMap();
  return {locate,select:id=>showMap(id),destroy(){disposed=true;geoRequest++;view='list';fullscreen();dialog.removeEventListener('cancel',cancel);observer?.disconnect();root.removeEventListener('click',click);form.removeEventListener('submit',apply);root.removeEventListener('keydown',keydown);media.removeEventListener('change',resize);map?.remove();map=null;markers.clear();}};
}

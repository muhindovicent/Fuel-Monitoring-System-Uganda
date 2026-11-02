import {escapeHtml as esc,money,date} from './api.js';
import {icon} from './ui.js';

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

export function discoveryMarkup(stations,initial={}){
  const f={...defaults,...initial};
  const places=[...new Set(stations.flatMap(s=>[s.district,s.area]))].sort();
  return `<section class="fuel-discovery" id="fuelDiscovery" aria-label="Fuel discovery map and station results">
    <aside class="discovery-rail" id="discoveryRail"><div class="discovery-rail-heading"><div><span class="eyebrow">YOUR NEXT FUEL STOP</span><h3>Search & discover</h3></div><button class="discovery-sheet-toggle quiet" data-discovery="sheet" aria-expanded="true" aria-controls="discoveryResults" aria-label="Collapse station results">${icon('menu')}</button></div>
      <form id="homeMapFilter" class="discovery-controls">
        <label>Station name or area<input name="q" maxlength="100" value="${esc(f.q)}" placeholder="Station, operator or area"></label>
        <label>District or city<input name="district" maxlength="100" list="discoveryPlaces" value="${esc(f.district)}" placeholder="e.g. Kampala or Entebbe"></label>
        <datalist id="discoveryPlaces">${places.map(p=>`<option value="${esc(p)}"></option>`).join('')}</datalist>
        <div class="discovery-filter-pair">${selector('Fuel type','fuel',[['petrol','Petrol'],['diesel','Diesel'],['kerosene','Kerosene']],f.fuel)}${selector('Sort results','sort',[['price','Lowest fresh price'],['name','Station name'],['distance','Nearest first']],f.sort)}</div>
        <div class="discovery-filter-pair">${selector('Price freshness','freshness',[['all','All directory entries'],['48','Published within 48h'],['24','Published within 24h'],['6','Published within 6h']],f.freshness)}${selector('Distance radius','radius',[['','Any distance'],['3','Within 3 km'],['10','Within 10 km'],['25','Within 25 km'],['100','Within 100 km']],f.radius)}</div>
        <label class="check discovery-verified"><input name="verifiedOnly" type="checkbox" ${f.verifiedOnly?'checked':''}>Only fresh verified records</label>
        <div class="discovery-filter-pair"><button type="submit" class="primary">${icon('search')} Apply filters</button><button type="button" data-discovery="locate">${icon('pin')} Near me</button></div>
        <div class="discovery-filter-links"><button type="button" class="quiet" data-discovery="reset">Reset filters</button><button type="button" class="quiet" data-discovery="clear-location" disabled>Clear location</button></div>
      </form>
      <div class="discovery-results-heading"><span id="discoveryCount" role="status">Loading stations…</span><span>UGX / litre</span></div>
      <div class="discovery-results" id="discoveryResults" tabindex="0" aria-label="Matching station cards"></div>
    </aside>
    <div class="discovery-map-stage"><div id="stationMap" class="map discovery-map" aria-label="Interactive Uganda station map"></div>
      <div class="discovery-floating"><button class="discovery-mobile-filter" data-discovery="filters" aria-expanded="false" aria-controls="homeMapFilter">${icon('search')} Search & filters</button><button data-discovery="locate" aria-label="Find fuel near my location">${icon('pin')} Near me</button></div>
      <div class="discovery-map-caption"><span><i class="legend-dot published"></i>Fresh published price</span><span><i class="legend-dot sample"></i>Demo / no fresh price</span></div>
      <p id="homeMapStatus" class="discovery-map-status" role="status">Directory locations, with source and freshness.</p>
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

export function mountDiscovery(root,stations,{initial={},position:initialPosition=null,asOf,onDetails,onChange}={}){
  let map=null,locationMarker=null,position=initialPosition,filters={...defaults,...initial},matches=[],selected=null,limit=50,disposed=false,geoRequest=0;
  let sheetExpanded=!matchMedia('(max-width: 900px)').matches,filtersOpen=false;
  const markers=new Map(),media=matchMedia('(max-width: 900px)'),now=Number.isFinite(Date.parse(asOf))?Date.parse(asOf):Date.now();
  const find=selector=>root.querySelector(selector),form=find('#homeMapFilter'),results=find('#discoveryResults');
  const status=text=>{find('#homeMapStatus').textContent=text;};
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>{if(map&&!disposed)map.invalidateSize({pan:false});}):null;
  observer?.observe(root);

  function panels(){
    root.classList.toggle('sheet-expanded',sheetExpanded);root.classList.toggle('filters-open',filtersOpen);
    form.hidden=media.matches&&!filtersOpen;results.hidden=media.matches&&(!sheetExpanded||filtersOpen);
    find('[data-discovery="sheet"]').setAttribute('aria-expanded',String(sheetExpanded));
    find('[data-discovery="sheet"]').setAttribute('aria-label',sheetExpanded?'Collapse station results':'Expand station results');
    find('[data-discovery="filters"]').setAttribute('aria-expanded',String(filtersOpen));
    if(map)setTimeout(()=>{if(!disposed)map.invalidateSize();},0);
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
    title.textContent=station.name;info.textContent=`${station.district} · ${priceStatus(station,filters.fuel,now).text}`;button.textContent='View station';button.type='button';
    button.addEventListener('click',()=>Promise.resolve(onDetails?.(station.id)).catch(error=>status(error.message)));
    popup.append(title,info,button);marker.bindPopup(popup);marker.on('click',()=>selectStation(station.id,true));
    const element=marker.getElement();if(element){element.setAttribute('tabindex','0');element.setAttribute('role','button');element.setAttribute('aria-label',`Select ${station.name} on map`);element.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();selectStation(station.id,true);}});}
    markers.set(station.id,marker);return marker;
  }
  function renderMap(){
    const L=window.L,el=find('#stationMap');
    if(!L){el.innerHTML='<div class="map-feedback">Map library unavailable. Search and station details remain available in the linked results.</div>';return;}
    if(!map){
      map=L.map(el).setView([1.1,32.3],7);
      const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,referrerPolicy:'strict-origin-when-cross-origin',attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'});
      tiles.on('tileerror',()=>{if(!el.querySelector('.map-feedback')){const message=document.createElement('div');message.className='map-feedback';message.setAttribute('role','status');message.textContent='Basemap tiles unavailable. Station pins and linked results are still usable.';el.append(message);}});tiles.addTo(map);
    }
    for(const marker of markers.values())marker.remove();markers.clear();locationMarker?.remove();locationMarker=null;
    const points=matches.slice(0,250).map(s=>{addMarker(s);return [s.latitude,s.longitude];});
    if(position){locationMarker=L.circleMarker([position.latitude,position.longitude],{radius:7,color:'#2b64be',fillOpacity:1}).addTo(map);points.push([position.latitude,position.longitude]);}
    if(points.length)map.fitBounds(points,{paddingTopLeft:[35,media.matches?155:65],paddingBottomRight:[35,media.matches?(sheetExpanded?350:100):35],maxZoom:14,animate:false});
  }
  function renderCards(){
    results.innerHTML=matches.length?matches.slice(0,limit).map(s=>stationCard(s,filters.fuel,now,s.id===selected)).join('')+(matches.length>limit?'<button class="discovery-more" data-discovery="more">Show more matching stations</button>':''):'<div class="empty discovery-empty">No stations match these filters. Try widening the district, freshness or verified-price criteria. Demonstration prices never qualify as verified records.</div>';
    find('#discoveryCount').textContent=`${matches.length.toLocaleString()} matching stations`;
  }
  function update(){
    matches=filterStations(stations,filters,position,now);selected=null;limit=50;renderCards();renderMap();panels();
    root.querySelector('[data-discovery="clear-location"]').disabled=!position;
    status(`${matches.length} matching locations loaded${position?` · ${filters.radius?`within ${filters.radius} km · `:''}straight-line distance estimates`:''}. ${matches.length>250?'Map shows the first 250 matches; narrow filters for more precision.':'Select a card or pin to explore a station.'}`);
    onChange?.({...filters},position);
  }
  function readFilters(){return {...Object.fromEntries(new FormData(form)),verifiedOnly:form.elements.verifiedOnly.checked};}
  async function locate(){
    if(!navigator.geolocation){status('Location is not supported by this browser. Search by station or district instead.');return;}
    const request=++geoRequest;status('Requesting your location…');root.setAttribute('aria-busy','true');
    try{
      const found=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,()=>reject(new Error('Location unavailable or permission denied. No distance filter was applied; search by district or try sharing your location again.')),{timeout:10000,maximumAge:60000}));
      if(disposed||request!==geoRequest)return;
      position={latitude:found.coords.latitude,longitude:found.coords.longitude};form.elements.sort.value='distance';if(!form.elements.radius.value)form.elements.radius.value='10';
      filters=readFilters();filtersOpen=false;sheetExpanded=true;update();
    }catch(error){if(!disposed&&request===geoRequest)status(error.message);}
    finally{if(!disposed&&request===geoRequest)root.setAttribute('aria-busy','false');}
  }
  async function apply(event){
    event.preventDefault();event.stopPropagation();filters=readFilters();
    if((filters.sort==='distance'||filters.radius)&&!position){await locate();return;}
    filtersOpen=false;sheetExpanded=true;update();
    if(media.matches)find('[data-discovery="sheet"]').focus();
  }
  async function click(event){
    const button=event.target.closest('[data-discovery]');if(!button)return;event.preventDefault();event.stopPropagation();
    const action=button.dataset.discovery,id=Number(button.dataset.id);
    if(action==='select')selectStation(id);
    if(action==='details'){selectStation(id);try{await onDetails?.(id);}catch(error){status(error.message);}}
    if(action==='locate')await locate();
    if(action==='more'){limit+=50;renderCards();}
    if(action==='sheet'){sheetExpanded=!sheetExpanded;filtersOpen=false;panels();}
    if(action==='filters'){filtersOpen=!filtersOpen;sheetExpanded=true;panels();if(filtersOpen)form.elements.q.focus();}
    if(action==='reset'){geoRequest++;root.setAttribute('aria-busy','false');position=null;filters={...defaults};form.reset();for(const [key,value]of Object.entries(filters)){if(key==='verifiedOnly')form.elements[key].checked=value;else form.elements[key].value=value;}update();}
    if(action==='clear-location'){geoRequest++;root.setAttribute('aria-busy','false');position=null;form.elements.radius.value='';if(form.elements.sort.value==='distance')form.elements.sort.value='name';filters=readFilters();update();}
  }
  function resize(){filtersOpen=false;panels();}
  function keydown(event){if(event.key==='Escape'&&filtersOpen){filtersOpen=false;panels();find('[data-discovery="filters"]').focus();}}
  root.addEventListener('click',click);form.addEventListener('submit',apply);root.addEventListener('keydown',keydown);media.addEventListener('change',resize);
  update();
  return {locate,select:id=>selectStation(id),destroy(){disposed=true;geoRequest++;observer?.disconnect();root.removeEventListener('click',click);form.removeEventListener('submit',apply);root.removeEventListener('keydown',keydown);media.removeEventListener('change',resize);map?.remove();markers.clear();}};
}

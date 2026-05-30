// MafutaWatch Uganda — Application Logic

/* ─── DATABASE ─── */
const DB_KEY = 'mafuta_watch_v2';
function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (!d.reports) d.reports = [];
      if (!d.reviews) d.reviews = [];
      if (!d.notifications) d.notifications = [];
      if (!d.subscriptions) d.subscriptions = [];
      if (!d.priceHistory) d.priceHistory = [];
      if (d.trustScore === undefined) d.trustScore = 0;
      if (d.totalReports === undefined) d.totalReports = 0;
      if (d.verifiedCount === undefined) d.verifiedCount = 0;
      if (d.authToken === undefined) d.authToken = null;
      if (!d.broadcasts) d.broadcasts = [];
      if (!d.p2pRooms) d.p2pRooms = [];
      if (!d.p2pMessages) d.p2pMessages = {};
      if (!d.c2gTickets) d.c2gTickets = [];
      if (!d.g2cPosts) d.g2cPosts = [];
      if (!d.g2cAma) d.g2cAma = [];
      if (d.peerScore === undefined) d.peerScore = 0;
      return d;
    }
  } catch(e) {}
  return { reports:[], reviews:[], notifications:[], subscriptions:[], priceHistory:[],
           trustScore:0, totalReports:0, verifiedCount:0, authToken:null, broadcasts:[],
           p2pRooms:[], p2pMessages:{}, c2gTickets:[], g2cPosts:[], g2cAma:[], peerScore:0 };
}
let DB = loadDB();
function saveDB() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(DB)); } catch(e) {}
}

/* ─── HELPERS ─── */
function getOp(id) { return OPERATORS.find(o=>o.id===id)||{name:'Unknown',short:'??'}; }
function getStations() { return STATIONS_DATA; }
function getStation(id) { return STATIONS_DATA.find(s=>s.id===id); }

function haversineKm(lat1,lng1,lat2,lng2) {
  const R=6371; const dLat=(lat2-lat1)*Math.PI/180; const dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function getPriceColor(price, fuel) {
  const all = STATIONS_DATA.map(s=>s[fuel]||9999).filter(p=>p>0);
  const min=Math.min(...all), max=Math.max(...all), range=max-min||1;
  const r=(price-min)/range;
  return r<0.33?'var(--green)':r<0.66?'var(--yellow)':'var(--red)';
}

function getPriceRange(price) { return price<=5300?'low':price<=5450?'med':'high'; }

/* ─── PRICE REGULATION ─── */
const DISTRICT_PRICE_CAPS = {
  'Kampala': { petrol:5400, diesel:5480 },
  'Wakiso': { petrol:5400, diesel:5480 },
  'Mukono': { petrol:5400, diesel:5480 },
  'Masaka': { petrol:5450, diesel:5520 },
  'Mbarara': { petrol:5550, diesel:5620 },
  'Kabarole': { petrol:5550, diesel:5620 },
  'Hoima': { petrol:5550, diesel:5620 },
  'Kasese': { petrol:5580, diesel:5650 },
  'Gulu': { petrol:5600, diesel:5680 },
  'Lira': { petrol:5630, diesel:5700 },
  'Arua': { petrol:5650, diesel:5720 },
  'Jinja': { petrol:5430, diesel:5500 },
  'Mbale': { petrol:5480, diesel:5550 },
  'Soroti': { petrol:5510, diesel:5580 },
  'Tororo': { petrol:5470, diesel:5540 },
};

function checkPriceCap(stationId, fuel, price) {
  const s = getStation(stationId);
  if (!s) return { withinCap: true, cap: null, excess: 0 };
  const district = s.district;
  const caps = DISTRICT_PRICE_CAPS[district];
  if (!caps) return { withinCap: true, cap: null, excess: 0 };
  const cap = caps[fuel];
  if (!cap) return { withinCap: true, cap: null, excess: 0 };
  const withinCap = price <= cap;
  if (!withinCap) {
    if (!DB.notifications) DB.notifications = [];
    DB.notifications.push({
      id: Date.now(),
      type: 'price_cap_violation',
      message: `🚨 Price cap violation at ${s.name}: ${fuel} at UGX ${price.toLocaleString()} (cap: UGX ${cap.toLocaleString()}, excess: UGX ${(price-cap).toLocaleString()})`,
      stationId, stationName: s.name, read: false, date: new Date().toISOString(),
    });
  }
  return { withinCap, cap, excess: withinCap ? 0 : price - cap };
}

/* ─── TOAST ─── */
function showToast(msg, duration) {
  const t=document.getElementById('toast'); if(!t) return;
  t.textContent=msg; t.classList.add('show');
  clearTimeout(t._timer); t._timer=setTimeout(()=>t.classList.remove('show'), duration||3000);
}

/* ─── NAVIGATION ─── */
let activePane='map';
function switchPage(pane) {
  activePane=pane;
  document.querySelectorAll('.tools-pane').forEach(p=>p.classList.remove('active'));
  const el=document.getElementById(`page-${pane}`);
  if(el) el.classList.add('active');
  document.querySelectorAll('.tools-tab').forEach(n=>n.classList.toggle('active',n.dataset.pane===pane));
  const main=document.getElementById('mainContent');
  if(main) main.scrollTop=0;
  // Refresh on show
  if(pane==='stations') renderStationList();
  if(pane==='map') setTimeout(()=>{if(map)map.invalidateSize();},100);
  if(pane==='activity') renderActivity();
  if(pane==='operator') renderOperatorDash();
  if(pane==='admin') renderAdminDash();
  if(pane==='p2p') { renderP2PRooms(); updateHubCounts(); }
  if(pane==='c2g') { renderC2GTickets(); initC2GForm(); updateHubCounts(); }
  if(pane==='g2c') { renderG2CPosts(); renderG2CAMA(); updateHubCounts(); }
}
document.addEventListener('click', e=>{
  const item=e.target.closest('.tools-tab');
  if(item) switchPage(item.dataset.pane);
});
document.addEventListener('click', e=>{
  if(e.target.id==='breadcrumbHome') { e.preventDefault(); switchPage('map'); }
  if(e.target.id==='breadcrumbGov') { e.preventDefault(); document.querySelector('.gov-institutional')?.scrollIntoView({behavior:'smooth'}); }
  if(e.target.id==='breadcrumbDirs') { e.preventDefault(); document.querySelector('.directory-block')?.scrollIntoView({behavior:'smooth'}); }
});

/* ─── MAP ─── */
let map, markers=[], currentStationId=null;
function initMap() {
  map=L.map('map',{center:[0.315,32.58],zoom:12,zoomControl:true,attributionControl:true});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom:19,
  }).addTo(map);
  renderMapMarkers();
}

function renderMapMarkers(fuelFilter, radiusKm) {
  markers.forEach(m=>map.removeLayer(m)); markers=[];
  const fuel=fuelFilter||document.getElementById('mapFuel')?.value||'all';
  const radius=radiusKm||parseInt(document.getElementById('mapRadius')?.value)||0;
  const search=(document.getElementById('mapSearch')?.value||'').toLowerCase();

  // Get user location for radius filtering
  let userPos=null;
  if (radius>0 && window._userLat!=null) userPos={lat:window._userLat,lng:window._userLng};

  let stations=getStations().filter(s=>{
    if(search&&!s.name.toLowerCase().includes(search)&&!s.area.toLowerCase().includes(search)
       &&!s.district.toLowerCase().includes(search)) return false;
    if(fuel!=='all'&&!s[fuel]) return false;
    if(userPos&&radius>0){
      const d=haversineKm(userPos.lat,userPos.lng,s.lat,s.lng);
      if(d>radius) return false;
    }
    return true;
  });

  if(stations.length===0){
    document.getElementById('mapResultCount').textContent='No stations found';
    return;
  }
  document.getElementById('mapResultCount').textContent=`${stations.length} station${stations.length>1?'s':''}`;

  stations.forEach(s=>{
    const displayFuel=fuel==='all'?'petrol':fuel;
    const price=s[displayFuel]||s.petrol||0;
    const color=getPriceColor(price,displayFuel||'petrol');
    const op=getOp(s.op);
    const rank=getPriceRange(price);

    const icon=L.divIcon({
      className:'',
      html:`<div style="background:${color};color:#fff;width:30px;height:30px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;
        border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.2);">UGX</div>`,
      iconSize:[30,30],iconAnchor:[15,15],popupAnchor:[0,-16],
    });

    const m=L.marker([s.lat,s.lng],{icon}).addTo(map);
    const pricesHtml=[
      s.petrol?`<div><span class="price-dot ${getPriceRange(s.petrol)}"></span>Petrol: UGX ${s.petrol.toLocaleString()}/L</div>`:'',
      s.diesel?`<div><span class="price-dot ${getPriceRange(s.diesel)}"></span>Diesel: UGX ${s.diesel.toLocaleString()}/L</div>`:'',
      s.kerosene?`<div>Kerosene: UGX ${s.kerosene.toLocaleString()}/L</div>`:'',
    ].filter(Boolean).join('');
    m.bindPopup(`
      <div class="popup-station">${s.name}</div>
      <div class="popup-operator">${op.name} · ${s.area}, ${s.district}</div>
      <div style="margin:6px 0;">${pricesHtml}</div>
      <button class="popup-action" onclick="openStationModal(${s.id})">View Details + Report</button>
    `);
    markers.push(m);
  });

  if(markers.length>0){
    const g=L.featureGroup(markers);
    map.fitBounds(g.getBounds().pad(0.15));
  }
}

// Map filter events
document.addEventListener('change',e=>{
  if(e.target.id==='mapFuel'||e.target.id==='mapRadius') renderMapMarkers();
});
document.addEventListener('input',e=>{
  if(e.target.id==='mapSearch') renderMapMarkers();
});

// GPS Locate
document.addEventListener('click',e=>{
  if(e.target.id==='mapLocateBtn'&&navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      window._userLat=pos.coords.latitude; window._userLng=pos.coords.longitude;
      map.setView([window._userLat,window._userLng],14);
      L.circleMarker([window._userLat,window._userLng],{
        radius:8,color:'var(--primary)',fillColor:'var(--accent)',fillOpacity:0.8,weight:2,
      }).addTo(map);
      showToast('📍 Location found!');
    },()=>showToast('Could not get location.'),{enableHighAccuracy:true,timeout:10000});
  }
});

// Radius clear
document.addEventListener('click',e=>{
  if(e.target.id==='mapRadiusClear'){
    document.getElementById('mapRadius').value='0';
    window._userLat=null; window._userLng=null;
    renderMapMarkers();
  }
});

/* ─── STATION MODAL ─── */
function openStationModal(id) {
  const s=getStation(id); if(!s) return;
  currentStationId = id;
  const op=getOp(s.op);
  document.getElementById('modalTitle').textContent=s.name;
  document.getElementById('modalSub').innerHTML=`${op.name} · ${s.area}, ${s.district} ${s.phone?'· 📞'+s.phone:''}`;

  let pHtml='';
  if(s.petrol) pHtml+=`<div class="modal-price-row"><span><span class="price-dot ${getPriceRange(s.petrol)}"></span>Petrol</span><span class="price" style="font-weight:700;font-size:1.1rem;color:${getPriceColor(s.petrol,'petrol')}">UGX ${s.petrol.toLocaleString()}</span></div>`;
  if(s.diesel) pHtml+=`<div class="modal-price-row"><span><span class="price-dot ${getPriceRange(s.diesel)}"></span>Diesel</span><span class="price" style="font-weight:700;font-size:1.1rem;color:${getPriceColor(s.diesel,'diesel')}">UGX ${s.diesel.toLocaleString()}</span></div>`;
  document.getElementById('modalPrices').innerHTML=pHtml||'<div style="color:var(--text-muted)">No prices available</div>';

  // Reviews
  const reviews=(DB.reviews||[]).filter(r=>r.stationId===id);
  const rContainer=document.getElementById('modalReviews');
  if(reviews.length===0){
    rContainer.innerHTML='<div style="color:var(--text-muted);font-size:0.78rem;">No reviews yet. Be the first!</div>';
  } else {
    rContainer.innerHTML=reviews.slice(-3).reverse().map(r=>`
      <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:0.8rem;">
        <div>${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)} <span style="color:var(--text-muted);font-size:0.7rem;">${new Date(r.date).toLocaleDateString()}</span></div>
        <div style="color:var(--text-muted);font-size:0.75rem;">${r.text||''} ${r.issues?r.issues.map(i=>'<span class="tag tag-red">'+i+'</span>').join(' '):''}</div>
      </div>
    `).join('');
  }

  document.getElementById('modalReportBtn').onclick=()=>{
    closeModal();
    document.getElementById('reportStation').value=id;
    switchPage('report');
    setTimeout(()=>document.getElementById('reportStation').scrollIntoView({behavior:'smooth'}),200);
  };
  document.getElementById('modalReviewBtn').onclick=()=>{
    closeModal();
    document.getElementById('reviewStation').value=id;
    switchPage('stations');
    document.getElementById('reviewSection')?.scrollIntoView({behavior:'smooth'});
  };
  document.getElementById('modalSubBtn').onclick=()=>{
    const sub=DB.subscriptions||[];
    const idx=sub.findIndex(s=>s.stationId===id);
    if(idx>=0){ sub.splice(idx,1); showToast('Unsubscribed from alerts.'); }
    else{ sub.push({stationId:id,stationName:s.name,createdAt:new Date().toISOString()}); showToast('✅ Subscribed to price alerts!'); }
    DB.subscriptions=sub; saveDB();
  };

  document.getElementById('stationModal').classList.add('show');
}
function closeModal(){
  document.getElementById('stationModal').classList.remove('show');
}
document.addEventListener('click',e=>{
  const overlay=document.getElementById('stationModal');
  if(e.target===overlay) closeModal();
});

/* ─── DIRECTIONS ─── */
document.addEventListener('click', e => {
  if (e.target.id === 'modalDirectionsBtn') {
    const s = getStation(currentStationId);
    if (!s) return showToast('Station location not available.');
    if (!navigator.geolocation) return showToast('Geolocation not supported by your browser.');
    navigator.geolocation.getCurrentPosition(pos => {
      const url = `https://www.google.com/maps/dir/?api=1&origin=${pos.coords.latitude},${pos.coords.longitude}&destination=${s.lat},${s.lng}&travelmode=driving`;
      window.open(url, '_blank');
      if (map) {
        L.polyline([[pos.coords.latitude, pos.coords.longitude], [s.lat, s.lng]], {
          color: '#76FF03', weight: 3, dashArray: '10,10',
        }).addTo(map);
        map.setView([(pos.coords.latitude + s.lat) / 2, (pos.coords.longitude + s.lng) / 2], 12);
      }
      showToast('🗺️ Directions opened in Google Maps.');
    }, () => showToast('Could not get your location.'), { enableHighAccuracy: true, timeout: 10000 });
  }
});

/* ─── STATIONS LIST ─── */
function renderStationList() {
  const container=document.getElementById('stationList');
  if(!container) return;
  const search=(document.getElementById('listSearch')?.value||'').toLowerCase();
  const fuel=document.getElementById('listFuel')?.value||'all';

  let stations=getStations().filter(s=>{
    if(search&&!s.name.toLowerCase().includes(search)&&!s.area.toLowerCase().includes(search)) return false;
    if(fuel==='petrol'&&!s.petrol) return false;
    if(fuel==='diesel'&&!s.diesel) return false;
    return true;
  });
  stations.sort((a,b)=>(a.petrol||9999)-(b.petrol||9999));

  if(stations.length===0){
    container.innerHTML='<div class="empty-state"><div class="icon">🔍</div><p>No stations found</p></div>';
    return;
  }
  container.innerHTML=stations.map((s,i)=>{
    const op=getOp(s.op);
    const rc=i===0?'gold':i===1?'silver':i===2?'silver':'normal';
    return `<div class="station-card" onclick="openStationModal(${s.id})">
      <div class="rank ${rc}">${i+1}</div>
      <div class="info">
        <div class="name">${s.name}</div>
        <div class="meta">${op.short} · ${s.area}, ${s.district}</div>
      </div>
      <div class="prices">
        ${s.petrol?`<div class="amt" style="color:${getPriceColor(s.petrol,'petrol')}">UGX ${s.petrol.toLocaleString()}</div>`:'<div class="amt">—</div>'}
        <div class="sub" style="font-size:0.65rem">${s.diesel?'D: UGX '+s.diesel.toLocaleString():''}</div>
      </div>
    </div>`;
  }).join('');
}

document.addEventListener('input',e=>{if(e.target.id==='listSearch') renderStationList();});
document.addEventListener('change',e=>{if(e.target.id==='listFuel') renderStationList();});

/* ─── REVIEWS ─── */
function submitReview() {
  const stationId=parseInt(document.getElementById('reviewStation')?.value);
  const ratingEl=document.querySelector('.star-rating');
  const rating=parseInt(ratingEl?.dataset?.rating)||0;
  const text=document.getElementById('reviewText')?.value?.trim()||'';
  const issues=[];
  if(document.getElementById('issueLines')?.checked) issues.push('long_lines');
  if(document.getElementById('issuePumps')?.checked) issues.push('bad_pumps');
  if(document.getElementById('issueFuel')?.checked) issues.push('adulterated_fuel');

  if(!stationId) return showToast('Please select a station.');
  if(!rating) return showToast('Please give a star rating.');

  if(!DB.reviews) DB.reviews=[];
  DB.reviews.push({stationId,rating,text,issues,date:new Date().toISOString()});
  saveDB();
  showToast('✅ Review submitted! Thank you.');
  document.getElementById('reviewText').value='';
  renderStationList();
  renderReviews();
}

function renderReviews() {
  const container=document.getElementById('recentReviews');
  if(!container) return;
  const all=DB.reviews||[];
  if(all.length===0){
    container.innerHTML='<div style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:20px;">No reviews yet. Report a station issue above.</div>';
    return;
  }
  container.innerHTML=all.slice(-10).reverse().map(r=>{
    const s=getStation(r.stationId);
    const issues=r.issues||[];
    return `<div style="padding:10px 0;border-bottom:1px solid var(--border);font-size:0.82rem;">
      <div style="display:flex;justify-content:space-between;">
        <strong>${s?s.name:'Unknown'}</strong>
        <span>${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span>
      </div>
      ${r.text?`<div style="color:var(--text-muted);margin-top:2px;">${r.text}</div>`:''}
      <div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;">
        ${issues.includes('long_lines')?'<span class="tag tag-red">Long lines</span>':''}
        ${issues.includes('bad_pumps')?'<span class="tag tag-yellow">Bad pumps</span>':''}
        ${issues.includes('adulterated_fuel')?'<span class="tag tag-red">⚠ Adulterated fuel</span>':''}
      </div>
      <div style="font-size:0.65rem;color:var(--text-muted);margin-top:2px;">${new Date(r.date).toLocaleDateString()}</div>
    </div>`;
  }).join('');
}

/* ─── REPORT PRICE ─── */
function populateReportForm() {
  const sel=document.getElementById('reportStation');
  if(!sel) return;
  sel.innerHTML='<option value="">Select a station...</option>';
  getStations().forEach(s=>{
    const op=getOp(s.op);
    sel.innerHTML+=`<option value="${s.id}">${s.name} — ${op.short}, ${s.area}</option>`;
  });
}

document.addEventListener('click',e=>{
  if(e.target.id==='submitReportBtn') submitReport();
});
function submitReport() {
  const stationId=parseInt(document.getElementById('reportStation')?.value);
  const fuel=document.getElementById('reportFuel')?.value;
  const price=parseFloat(document.getElementById('reportPrice')?.value);
  const loc=document.getElementById('reportLocation')?.value?.trim()||'';

  if(!stationId) return showToast('Please select a station.');
  if(!price||price<2000||price>10000) return showToast('Enter valid price (UGX 2,000–10,000).');

  const s=getStation(stationId); if(!s) return;
  const current=s[fuel]||0;

  // Price cap cross-reference
  const capResult = checkPriceCap(stationId, fuel, price);
  if (!capResult.withinCap) {
    showToast('⚠️ Price UGX ' + price.toLocaleString() + ' exceeds district cap of UGX ' + capResult.cap.toLocaleString() + '! Flagged for review.', 4000);
  }

  // Deviation check
  if(current>0){
    const dev=Math.abs(price-current)/current*100;
    if(dev>25&&!confirm(`⚠️ This price (UGX ${price.toLocaleString()}) is ${dev.toFixed(0)}% off current (UGX ${current.toLocaleString()}). Still submit?`))
      return;
  }

  // Anti-fraud: check against median
  const allPrices=(DB.reports||[]).filter(r=>r.stationId===stationId&&r.fuel===fuel&&r.status==='verified').map(r=>r.price);
  if(allPrices.length>=3){
    const sorted=[...allPrices,price].sort((a,b)=>a-b);
    const median=sorted[Math.floor(sorted.length/2)];
    const dev=Math.abs(price-median)/median*100;
    if(dev>25){
      showToast('⚠️ Price flagged — deviates from local median. Will require verification.',4000);
    }
  }

  const report={id:Date.now(),stationId,stationName:s.name,fuel,price,location:loc,
    timestamp:new Date().toISOString(),status:'pending',userTrust:DB.trustScore||0,
    criticalCompliance: !capResult.withinCap || undefined};
  DB.reports.push(report);
  DB.totalReports=(DB.totalReports||0)+1;
  saveDB();

  // Track price history
  if(!DB.priceHistory) DB.priceHistory=[];
  DB.priceHistory.push({stationId,fuel,price,date:new Date().toISOString()});

  // If trusted user (>=50), publish immediately
  if((DB.trustScore||0)>=50){
    report.status='verified';
    report.verifiedAt=new Date().toISOString();
    s[fuel]=price;
    s.lastUpdated=new Date().toISOString();
    DB.verifiedCount=(DB.verifiedCount||0)+1;
    saveDB();
    renderMapMarkers();
    renderStationList();
    showToast('✅ Price published! (Trusted reporter)');
  } else {
    showToast('📝 Price submitted! Awaiting verification (3 reports needed).');
  }

  document.getElementById('reportStation').value='';
  document.getElementById('reportPrice').value='';
  document.getElementById('reportLocation').value='';
  switchPage('activity');
}

document.addEventListener('click',e=>{
  if(e.target.id==='reportGpsBtn'&&navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      document.getElementById('reportLocation').value=`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
      showToast('📍 Location captured!');
    },()=>showToast('GPS unavailable.'),{enableHighAccuracy:true,timeout:10000});
  }
});

/* ─── TRIP PLANNER ─── */
function findLocation(query) {
  query=query.toLowerCase().trim();
  const locs=LOCATIONS.filter(l=>l.name.toLowerCase().includes(query)||l.district.toLowerCase().includes(query)||l.area.toLowerCase().includes(query));
  return locs.length>0?locs[0]:null;
}

document.addEventListener('click',e=>{
  if(e.target.id==='calcTripBtn'){
    const from=document.getElementById('tripFrom')?.value?.trim();
    const to=document.getElementById('tripTo')?.value?.trim();
    const vehicle=document.getElementById('tripVehicle')?.value;
    if(!from||!to) return showToast('Please enter both start and destination.');
    if(!vehicle) return showToast('Please select a vehicle type.');

    const fromLoc=findLocation(from);
    const toLoc=findLocation(to);
    if(!fromLoc) return showToast('Start location not found. Try "Kampala Post Office".');
    if(!toLoc) return showToast('Destination not found. Try "Mukono Town".');

    const distKm=haversineKm(fromLoc.lat,fromLoc.lng,toLoc.lat,toLoc.lng);
    const veh=VEHICLES.find(v=>v.id===vehicle);
    if(!veh) return;
    const fuelL=distKm/veh.consumption;
    const avgPetrolPrice=STATIONS_DATA.reduce((s,st)=>s+(st.petrol||0),0)/STATIONS_DATA.filter(s=>s.petrol).length;
    const cost=fuelL*avgPetrolPrice;

    const resultDiv=document.getElementById('tripResult');
    resultDiv.style.display='block';
    resultDiv.innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div>
          <div style="font-weight:600;font-size:0.9rem;">${fromLoc.name} → ${toLoc.name}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">${veh.name}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:1.6rem;font-weight:800;color:var(--primary);">UGX ${Math.round(cost).toLocaleString()}</div>
          <div style="font-size:0.7rem;color:var(--text-muted);">estimated cost</div>
        </div>
      </div>
      <div class="route-detail">
        <div><div class="val">${distKm.toFixed(1)} km</div><div class="lbl">Distance</div></div>
        <div><div class="val">${fuelL.toFixed(1)} L</div><div class="lbl">Fuel needed</div></div>
        <div><div class="val">UGX ${Math.round(avgPetrolPrice).toLocaleString()}</div><div class="lbl">Avg price/L</div></div>
      </div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
        <div style="font-weight:600;font-size:0.8rem;margin-bottom:6px;">🛢️ Cheapest stations on your route:</div>
        ${getStations().filter(s=>{
          const d1=haversineKm(fromLoc.lat,fromLoc.lng,s.lat,s.lng);
          const d2=haversineKm(toLoc.lat,toLoc.lng,s.lat,s.lng);
          return d1<10||d2<10;
        }).sort((a,b)=>(a.petrol||9999)-(b.petrol||9999)).slice(0,3).map(s=>{
          const dFrom=haversineKm(fromLoc.lat,fromLoc.lng,s.lat,s.lng).toFixed(1);
          return `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:0.8rem;border-bottom:1px solid var(--border);">
            <span>${s.name} <span style="color:var(--text-muted);font-size:0.7rem;">(${dFrom} km)</span></span>
            <span style="font-weight:700;color:${getPriceColor(s.petrol,'petrol')};">UGX ${s.petrol.toLocaleString()}</span>
          </div>`;
        }).join('')}
      </div>
    `;

    // Show on map
    if(map){
      map.setView([(fromLoc.lat+toLoc.lat)/2,(fromLoc.lng+toLoc.lng)/2],10);
      L.marker([fromLoc.lat,fromLoc.lng]).addTo(map).bindPopup(`<b>${fromLoc.name}</b>`).openPopup();
      L.marker([toLoc.lat,toLoc.lng]).addTo(map).bindPopup(`<b>${toLoc.name}</b>`);
      L.polyline([[fromLoc.lat,fromLoc.lng],[toLoc.lat,toLoc.lng]],{color:'var(--accent)',weight:3,dashArray:'8,8'}).addTo(map);
    }
  }
});

// Quick planner from map via GPS
document.addEventListener('click',e=>{
  if(e.target.id==='useGpsTripFrom'&&navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      // Find nearest location
      let nearest=null, minDist=Infinity;
      LOCATIONS.forEach(l=>{
        const d=haversineKm(pos.coords.latitude,pos.coords.longitude,l.lat,l.lng);
        if(d<minDist){minDist=d;nearest=l;}
      });
      document.getElementById('tripFrom').value=nearest?nearest.name:'';
    },()=>showToast('GPS unavailable.'));
  }
});

/* ─── ACTIVITY ─── */
function renderActivity() {
  const container=document.getElementById('activityList');
  if(!container) return;
  document.getElementById('statTotal').textContent=DB.totalReports||0;
  document.getElementById('statVerified').textContent=DB.verifiedCount||0;
  const trust=DB.trustScore||0;
  document.getElementById('statTrust').textContent=trust;
  document.getElementById('trustBadge').textContent=`Trust: ${trust}`;
  document.getElementById('trustBadge').classList.toggle('show',true);
  document.getElementById('trustBadge').style.background=trust>=50?'var(--green)':trust>=20?'var(--yellow)':'var(--accent)';

  const reports=DB.reports||[];
  if(reports.length===0){
    container.innerHTML='<div class="empty-state"><div class="icon">📝</div><p>No reports yet</p></div>';
    return;
  }
  container.innerHTML=reports.slice(-20).reverse().map(r=>{
    const sc=r.status==='verified'?'green':r.status==='rejected'?'red':'yellow';
    const sl=r.status==='verified'?'✅ Verified':r.status==='rejected'?'❌ Rejected':'⏳ Pending';
    return `<div class="station-card" style="cursor:default;">
      <div class="info">
        <div class="name">${r.stationName}</div>
        <div class="meta">${r.fuel.charAt(0).toUpperCase()+r.fuel.slice(1)} · UGX ${r.price.toLocaleString()} · ${new Date(r.timestamp).toLocaleDateString()}</div>
      </div>
      <span class="badge badge-${sc}">${sl}</span>
    </div>`;
  }).join('');
}

/* ─── NOTIFICATIONS ─── */
function checkPriceChanges() {
  // Simulate price changes and check subscriptions
  const subs=DB.subscriptions||[];
  if(subs.length===0) return;
  subs.forEach(sub=>{
    const s=getStation(sub.stationId);
    if(!s) return;
    const change=Math.floor(Math.random()*60)-30; // -30 to +30 UGX
    if(Math.abs(change)>=100){
      if(!DB.notifications) DB.notifications=[];
      DB.notifications.push({
        id:Date.now()+Math.random(),
        type:'price_hike',
        stationId:sub.stationId,
        stationName:s.name,
        message:`${change>0?'📈 Price Up':'📉 Price Down'} at ${s.name}: UGX ${(s.petrol||0)+change}/L`,
        oldPrice:s.petrol||0,
        newPrice:(s.petrol||0)+change,
        change,
        read:false,
        date:new Date().toISOString(),
      });
      s.petrol=(s.petrol||0)+change;
      saveDB();
    }
  });
}

function renderNotifications() {
  const notifs=DB.notifications||[];
  const badge=document.getElementById('notifBadge');
  if(!badge) return;
  const unread=notifs.filter(n=>!n.read).length;
  badge.style.display=unread>0?'block':'none';
  badge.textContent=unread;
}
setInterval(()=>{checkPriceChanges();renderNotifications();},15000);
setTimeout(checkPriceChanges,5000);

// Notification bell click
document.addEventListener('click',e=>{
  const panel=e.target.closest('#notifPanel');
  const dd=document.getElementById('notifDropdown');
  if(panel){
    e.stopPropagation();
    dd.classList.toggle('open');
    if(dd.classList.contains('open')) renderNotifDropdown();
    return;
  }
  if(e.target.closest('#notifDropdown')) return;
  dd.classList.remove('open');
});
function renderNotifDropdown(){
  const list=document.getElementById('notifList');
  if(!list) return;
  const notifs=DB.notifications||[];
  const unread=notifs.filter(n=>!n.read).length;
  notifs.forEach(n=>{n.read=true;});
  saveDB();
  renderNotifications();
  if(notifs.length===0){
    list.innerHTML='<div class="notif-empty">No notifications yet.</div>';
    return;
  }
  list.innerHTML=notifs.slice().reverse().map(n=>`
    <div class="notif-item ${unread>0?'':'read'}">
      ${n.message}
      <div class="notif-time">${new Date(n.time||n.createdAt).toLocaleString()}</div>
    </div>
  `).join('');
}

/* ─── FRAUD DETECTION ─── */
function runFraudDetection() {
  const pending=DB.reports.filter(r=>r.status==='pending');
  if(pending.length===0) return false;

  let flagged=false;
  pending.forEach(r=>{
    const s=getStation(r.stationId);
    if(!s) return;

    // 1. Check deviation from current price
    const currentPrice=s[r.fuel]||0;
    if(currentPrice>0){
      const dev=Math.abs(r.price-currentPrice)/currentPrice*100;
      if(dev>25){
        r.status='rejected';
        r.rejectionReason=`Price deviates ${dev.toFixed(0)}% from current pump price.`;
        DB.trustScore=Math.max(0,(DB.trustScore||0)-5);
        flagged=true;
        if(!DB.reviews) DB.reviews=[];
        DB.reviews.push({stationId:r.stationId,rating:1,text:`⚠️ Fraud alert: report for UGX ${r.price.toLocaleString()} rejected (${dev.toFixed(0)}% deviation).`,issues:['adulterated_fuel'],date:new Date().toISOString()});
        saveDB();
        return;
      }
    }

    // 1a. Check price cap compliance
    const capResult = checkPriceCap(r.stationId, r.fuel, r.price);
    if (!capResult.withinCap) {
      r.criticalCompliance = true;
      r.status = 'flagged_critical';
      if (!DB.admin) DB.admin = {};
      if (!DB.admin.fraudQueue) DB.admin.fraudQueue = [];
      DB.admin.fraudQueue.push({
        id: Date.now(),
        stationId: r.stationId,
        stationName: s.name,
        reportedPrice: r.price,
        currentPrice: s[r.fuel] || 0,
        fuel: r.fuel,
        deviationPct: parseFloat(((r.price - capResult.cap) / capResult.cap * 100).toFixed(1)),
        confidence: 'high',
        userId: 'AUTO-FLAG',
        location: s.area + ', ' + s.district,
        timestamp: new Date().toISOString(),
        status: 'pending',
      });
      flagged = true;
      saveDB();
    }

    // 2. Check against 48h rolling median from price history
    const history=DB.priceHistory?.filter(h=>h.stationId===r.stationId&&h.fuel===r.fuel)||[];
    if(history.length>=3){
      const prices=history.map(h=>h.price);
      const sorted=[...prices,r.price].sort((a,b)=>a-b);
      const median=sorted[Math.floor(sorted.length/2)];
      const dev=Math.abs(r.price-median)/median*100;
      if(dev>20){
        r.status='rejected';
        r.rejectionReason=`Deviates ${dev.toFixed(0)}% from 48h median.`;
        DB.trustScore=Math.max(0,(DB.trustScore||0)-3);
        flagged=true;
        saveDB();
        return;
      }
    }

    // 3. If reporter is trusted (>=50), verify immediately
    if((r.userTrust||0)>=50){
      r.status='verified';
      r.verifiedAt=new Date().toISOString();
      s[r.fuel]=r.price;
      s.lastUpdated=r.verifiedAt;
      DB.verifiedCount=(DB.verifiedCount||0)+1;
      DB.trustScore=Math.min(100,(DB.trustScore||0)+2);
      saveDB();
      return;
    }

    // 4. Check consensus: 3 matching reports from different users
    const matching=DB.reports.filter(x=>
      x.stationId===r.stationId&&x.fuel===r.fuel&&x.status==='pending'&&x.id!==r.id
    );
    const withinRange=matching.filter(x=>Math.abs(x.price-r.price)/r.price<=0.05);
    if(withinRange.length>=2){
      r.status='verified';
      withinRange.forEach(x=>{x.status='verified';x.verifiedAt=new Date().toISOString();});
      s[r.fuel]=Math.round((r.price+withinRange.reduce((a,b)=>a+b.price,0))/(withinRange.length+1));
      s.lastUpdated=new Date().toISOString();
      DB.verifiedCount=(DB.verifiedCount||0)+(1+withinRange.length);
      DB.trustScore=Math.min(100,(DB.trustScore||0)+3);
      saveDB();
    }
  });

  if(flagged){
    renderMapMarkers();
    renderStationList();
    renderActivity();
  }
  return flagged;
}
setInterval(runFraudDetection,8000);

/* ─── GOVERNANCE DASHBOARD ─── */
let adminChart=null;
let adminActiveTab='dashboard';

function initAdminSystem() {
  if (!DB.admin) DB.admin = {};
  if (!DB.admin.fraudQueue) {
    DB.admin.fraudQueue = [
      { id:1, stationId:42, stationName:'Shell Mbarara', reportedPrice:6800, currentPrice:5550, fuel:'petrol',
        deviationPct:22.5, confidence:'high', userId:'USR-7X3K9', location:'Mbarara Town',
        timestamp:new Date(Date.now()-120000).toISOString(), status:'pending' },
      { id:2, stationId:17, stationName:'Kobil Bombo Road', reportedPrice:4200, currentPrice:5390, fuel:'petrol',
        deviationPct:22.1, confidence:'high', userId:'USR-2B8M1', location:'Bombo Road, Kampala',
        timestamp:new Date(Date.now()-300000).toISOString(), status:'pending' },
      { id:3, stationId:36, stationName:'Shell Jinja Main', reportedPrice:6000, currentPrice:5430, fuel:'petrol',
        deviationPct:10.5, confidence:'med', userId:'USR-9F4D2', location:'Jinja Town',
        timestamp:new Date(Date.now()-600000).toISOString(), status:'pending' },
      { id:4, stationId:5, stationName:'Total Ntinda', reportedPrice:4900, currentPrice:5380, fuel:'diesel',
        deviationPct:8.9, confidence:'low', userId:'USR-5H7J8', location:'Ntinda, Kampala',
        timestamp:new Date(Date.now()-900000).toISOString(), status:'pending' },
      { id:5, stationId:47, stationName:'Shell Arua', reportedPrice:7100, currentPrice:5650, fuel:'petrol',
        deviationPct:25.7, confidence:'high', userId:'USR-1C3V5', location:'Arua Town',
        timestamp:new Date(Date.now()-1800000).toISOString(), status:'pending' },
    ];
  }
  if (!DB.admin.kycApplications) {
    DB.admin.kycApplications = [
      { id:1, name:'Jinja North Fuel Station', operator:'Sarah Nakato', phone:'+256712998877', email:'sarah@jinnorth.ug',
        district:'Jinja', region:'Eastern', docs:['Trading License','URA Tax Clearance','Station Photos'],
        submitted:new Date(Date.now()-86400000*2).toISOString(), status:'pending' },
      { id:2, name:'Mbarara Express Fuel', operator:'Peter Byansi', phone:'+256771234567', email:'peter@mbarfuel.ug',
        district:'Mbarara', region:'Western', docs:['Trading License','Environmental Permit','Fire Clearance'],
        submitted:new Date(Date.now()-86400000*5).toISOString(), status:'pending' },
      { id:3, name:'Gulu Highway Depot', operator:'Grace Akello', phone:'+256783456789', email:'grace@guludepot.ug',
        district:'Gulu', region:'Northern', docs:['Trading License','Fuel Storage Permit','Tax Clearance'],
        submitted:new Date(Date.now()-86400000*7).toISOString(), status:'pending' },
    ];
  }
  if (!DB.admin.apiTokens) {
    DB.admin.apiTokens = [
      { id:1, name:'Shell Uganda — Forecourt Sync', token:'mfw_v2_shell_fc7a3b9e1d2f4c8a0b5e',
        operator:'Shell Uganda', created:new Date(Date.now()-86400000*30).toISOString(),
        lastUsed:new Date(Date.now()-3600000).toISOString(), status:'active', rateLimit:'1000 req/min' },
      { id:2, name:'TotalEnergies — Pump Integration', token:'mfw_v2_total_d4e5f6a7b8c9d0e1f2a3',
        operator:'TotalEnergies Uganda', created:new Date(Date.now()-86400000*14).toISOString(),
        lastUsed:new Date(Date.now()-7200000).toISOString(), status:'active', rateLimit:'1000 req/min' },
      { id:3, name:'Stabex — Legacy API Bridge', token:'mfw_v2_stabex_b1c2d3e4f5a6b7c8d9e0',
        operator:'Stabex Uganda', created:new Date(Date.now()-86400000*60).toISOString(),
        lastUsed:null, status:'revoked', rateLimit:'500 req/min' },
    ];
  }
  if (!DB.admin.auditLog) {
    const entries = [];
    const channels = ['web','ussd','wa','api','operator','admin'];
    const actions = ['price_update','fraud_dismiss','operator_auth','broadcast'];
    for (let i=0; i<25; i++) {
      const station = STATIONS_DATA[Math.floor(Math.random()*STATIONS_DATA.length)];
      const channel = channels[Math.floor(Math.random()*channels.length)];
      const oldP = 5100 + Math.floor(Math.random()*500);
      const newP = oldP + Math.floor(Math.random()*200)-100;
      entries.push({
        id:Date.now()-i*3600000, timestamp:new Date(Date.now()-i*3600000).toISOString(),
        stationId:station.id, stationName:station.name,
        modifiedBy:['API:Shell','API:Total','Admin:memd_user','Operator:'+station.name,'USSD:user'][Math.floor(Math.random()*5)],
        previousPrice:oldP, newPrice:newP, fuel:Math.random()>0.5?'petrol':'diesel',
        channel, action:actions[Math.floor(Math.random()*actions.length)],
      });
    }
    DB.admin.auditLog = entries;
  }
  if (!DB.admin.hierarchy) {
    DB.admin.hierarchy = [
      { id:1, name:'Central Region', type:'region', children:[
        { id:11, name:'Kampala', type:'district', children:['Kampala Central','Nakawa','Kawempe','Makindye','Rubaga'].map((a,i)=>({id:110+i,name:a,type:'area',stations:STATIONS_DATA.filter(s=>s.area===a).map(s=>s.name)})) },
        { id:12, name:'Wakiso', type:'district', children:[{id:120,name:'Entebbe',type:'area',stations:['Shell Entebbe Airport','Total Entebbe Town']},{id:121,name:'Nansana',type:'area',stations:['Shell Nansana']}] },
        { id:13, name:'Mukono', type:'district', children:[{id:130,name:'Mukono Town',type:'area',stations:['Stabex Mukono','Shell Mukono']}] },
      ]},
      { id:2, name:'Western Region', type:'region', children:[
        { id:21,name:'Mbarara',type:'district',children:[{id:210,name:'Mbarara Town',type:'area',stations:['Shell Mbarara','Total Mbarara']}]},
        { id:22,name:'Kabarole',type:'district',children:[{id:220,name:'Fort Portal',type:'area',stations:['Shell Fort Portal','Total Fort Portal']}]},
      ]},
      { id:3, name:'Eastern Region', type:'region', children:[
        { id:31,name:'Jinja',type:'district',children:[{id:310,name:'Jinja Town',type:'area',stations:['Shell Jinja Main','Total Jinja']}]},
        { id:32,name:'Mbale',type:'district',children:[{id:320,name:'Mbale Town',type:'area',stations:['Shell Mbale','Total Mbale']}]},
      ]},
      { id:4, name:'Northern Region', type:'region', children:[
        { id:41,name:'Gulu',type:'district',children:[{id:410,name:'Gulu Town',type:'area',stations:['Shell Gulu','Total Gulu']}]},
        { id:42,name:'Arua',type:'district',children:[{id:420,name:'Arua Town',type:'area',stations:['Shell Arua','Total Arua']}]},
      ]},
    ];
  }
  saveDB();
}

/* ─── ADMIN ACCOUNTS & RBAC ─── */
const ADMIN_ACCOUNTS = [
  { user:'admin', pass:'admin123', name:'Ministry Admin', role:'Super Admin', tabAccess:['dashboard','fraud','c2g','stations','audit','config','caps','api'] },
  { user:'inspector', pass:'inspector123', name:'Regional Inspector', role:'Regional Inspector', tabAccess:['dashboard','fraud','c2g','audit'] },
  { user:'analyst', pass:'analyst123', name:'Data Analyst', role:'Data Analyst', tabAccess:['dashboard','audit','caps'] },
];
let adminSession = null;

/* ─── ADMIN SUB-NAV ─── */
document.addEventListener('click', e => {
  const tab = e.target.closest('.admin-tab');
  if (tab) {
    const pane = tab.dataset.adminTab;
    document.querySelectorAll('.admin-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.admin-pane').forEach(p=>p.classList.remove('active'));
    const el = document.getElementById('adminPane-'+pane);
    if (el) el.classList.add('active');
    adminActiveTab = pane;
    if (pane==='dashboard') renderAdminDash();
    if (pane==='fraud') renderFraudQueue();
    if (pane==='c2g') renderC2GAdmin();
    if (pane==='stations') renderKYCPipeline();
    if (pane==='audit') renderAuditTrail();
    if (pane==='config') renderHierarchyTree();
    if (pane==='caps') renderCapEditor();
    if (pane==='api') renderAPITokens();
  }
});

document.addEventListener('click', e => {
  const tab = e.target.closest('.admin-sub-tab');
  if (tab) {
    const parent = tab.closest('[id]');
    if (!parent) return;
    const container = parent.id;
    tab.closest('.admin-sub-tabs').querySelectorAll('.admin-sub-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    if (container==='adminPane-stations') {
      document.getElementById('kycPipeline').style.display = tab.dataset.stationTab==='kyc' ? 'block' : 'none';
      document.getElementById('whitelistContainer').style.display = tab.dataset.stationTab==='whitelist' ? 'block' : 'none';
      if (tab.dataset.stationTab==='whitelist') renderWhitelist();
    }
    if (container==='adminPane-config') {
      document.getElementById('configHierarchy').style.display = tab.dataset.configTab==='hierarchy' ? 'block' : 'none';
      document.getElementById('configBroadcast').style.display = tab.dataset.configTab==='broadcast' ? 'block' : 'none';
      renderBroadcasts();
    }
  }
});

/* ─── ADMIN LOGIN ─── */
document.addEventListener('click', e => {
  if(e.target.id==='adminLoginBtn'){
    const user=document.getElementById('adminUser')?.value?.trim();
    const pass=document.getElementById('adminPass')?.value;
    const account=ADMIN_ACCOUNTS.find(a=>a.user===user && a.pass===pass);
    if(account){
      adminSession = { user:account.user, name:account.name, role:account.role, tabAccess:account.tabAccess };
      document.getElementById('adminLogin').style.display='none';
      document.getElementById('adminDash').style.display='block';
      document.getElementById('adminUserName').textContent=account.name;
      document.getElementById('adminUserRole').textContent=account.role;
      // Show only authorized tabs
      document.querySelectorAll('.admin-tab').forEach(t=>{
        const pane = t.dataset.adminTab;
        t.style.display = account.tabAccess.includes(pane) ? '' : 'none';
        t.classList.toggle('active', pane==='dashboard');
      });
      document.querySelectorAll('.admin-pane').forEach(p=>p.classList.remove('active'));
      const dash = document.getElementById('adminPane-dashboard');
      if(dash) dash.classList.add('active');
      adminActiveTab = 'dashboard';
      initAdminSystem();
      showToast('✅ Welcome, '+account.name+' ('+account.role+')');
      renderAdminDash();
    } else {
      showToast('❌ Invalid credentials');
    }
  }
  if(e.target.id==='adminLogoutBtn'){
    adminSession = null;
    document.getElementById('adminDash').style.display='none';
    document.getElementById('adminLogin').style.display='block';
    document.getElementById('adminUser').value='';
    document.getElementById('adminPass').value='';
    showToast('🚪 Logged out');
  }
});

/* ─── SLA TIMERS ─── */
function renderSLATimers() {
  const container = document.getElementById('slatTimerContainer');
  if (!container) return;
  const tickets = (DB.c2gTickets || []).filter(t => t.status === 'open' || t.status === 'investigating');
  if (tickets.length === 0) {
    container.innerHTML = '<div style="color:var(--text-dim);font-size:0.82rem;text-align:center;padding:12px;">No active SLA timers.</div>';
    return;
  }
  container.innerHTML = tickets.map(t => {
    const elapsed = Date.now() - new Date(t.createdAt).getTime();
    const remaining = Math.max(0, 86400000 - elapsed);
    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    const pct = (elapsed / 86400000) * 100;
    const urgent = remaining < 14400000;
    const warning = remaining < 28800000;
    const cls = urgent ? 'sla-urgent' : warning ? 'sla-warning' : '';
    return `<div class="sla-card ${cls}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-weight:600;font-size:0.82rem;">Ticket #${t.id}</span>
        <span style="font-size:0.75rem;color:var(--text-dim);">${t.stationName}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
        <div class="sla-timer" style="font-size:1.4rem;font-weight:800;font-family:var(--font-mono);">${hours}h ${minutes}m</div>
        <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${pct.toFixed(0)}%;background:${urgent?'#ef4444':warning?'#f59e0b':'#76FF03'};border-radius:3px;transition:width 1s;"></div>
        </div>
      </div>
      <div style="font-size:0.65rem;color:var(--text-dim);margin-top:4px;">Status: ${t.status} · Created ${new Date(t.createdAt).toLocaleDateString()}</div>
      <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;">
        ${t.status==='open' ? `<button class="btn-tool btn-tool-outline btn-tool-sm" onclick="progressTicket(${t.id},'investigating')" style="font-size:0.6rem;">🔍 Start Investigation</button>` : ''}
        ${t.status==='investigating' ? `<button class="btn-tool btn-tool-outline btn-tool-sm" onclick="progressTicket(${t.id},'dispatched')" style="font-size:0.6rem;">🚔 Dispatch Enforcement</button>` : ''}
        ${t.status==='dispatched' ? `<button class="btn-tool btn-tool-primary btn-tool-sm" onclick="progressTicket(${t.id},'resolved')" style="font-size:0.6rem;">✅ Resolved</button> <button class="btn-tool btn-tool-outline btn-tool-sm" onclick="progressTicket(${t.id},'penalty_issued')" style="font-size:0.6rem;border-color:rgba(239,68,68,0.3);color:#fca5a5;">💰 Penalty Issued</button>` : ''}
      </div>
    </div>`;
  }).join('');
}
setInterval(renderSLATimers, 60000);

/* ─── DASHBOARD ─── */
function renderAdminDash() {
  if(activePane!=='admin' || adminActiveTab!=='dashboard') return;
  const total=(DB.reports||[]).length;
  const verified=(DB.reports||[]).filter(r=>r.status==='verified').length;
  const rejected=(DB.reports||[]).filter(r=>r.status==='rejected').length;
  const activeAPI = (DB.admin.apiTokens||[]).filter(t=>t.status==='active').length;
  const flagged = (DB.admin.fraudQueue||[]).filter(f=>f.status==='pending').length;
  document.getElementById('adminTotalReports').textContent=total;
  document.getElementById('adminVerified').textContent=verified;
  document.getElementById('adminFraud').textContent=flagged;
  document.getElementById('adminOperators').textContent=activeAPI;
  const dau = DB.totalReports||0;
  document.getElementById('adminDAU').textContent=dau > 0 ? Math.max(150, dau * 3 + 120) : 0;
  document.getElementById('adminRejected').textContent=rejected;

  // Regions
  const regions={};
  STATIONS_DATA.filter(s=>s.petrol).forEach(s=>{
    if(!regions[s.region]) regions[s.region]={prices:[],diesel:[]};
    regions[s.region].prices.push(s.petrol);
    if(s.diesel) regions[s.region].diesel.push(s.diesel);
  });
  const regHtml=Object.entries(regions).map(([name,data])=>{
    const avg=(data.prices.reduce((a,b)=>a+b,0)/data.prices.length).toFixed(0);
    const min=Math.min(...data.prices);
    const max=Math.max(...data.prices);
    return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:0.82rem;">
      <strong>${name}</strong>
      <div><span class="badge badge-green">UGX ${Number(avg).toLocaleString()}</span> <span style="color:var(--text-muted);font-size:0.7rem;">(${Number(min).toLocaleString()}–${Number(max).toLocaleString()})</span></div>
    </div>`;
  }).join('');
  const regEl = document.getElementById('adminRegions');
  if (regEl) regEl.innerHTML=regHtml||'<div style="color:var(--text-muted)">No data</div>';

  // Chart — only if dashboard is visible
  const dashEl = document.getElementById('adminDash');
  if(typeof Chart!=='undefined' && dashEl && dashEl.style.display!=='none'){
    const ctx=document.getElementById('priceChart');
    if(ctx){
      const last30Days=[...Array(30)].map((_,i)=>{
        const d=new Date(); d.setDate(d.getDate()-29+i);
        return {date:d.toLocaleDateString('en-UG',{month:'short',day:'numeric'}),
                avg:5300+Math.random()*300};
      });
      if(adminChart) adminChart.destroy();
      adminChart=new Chart(ctx,{
        type:'line',
        data:{
          labels:last30Days.map(d=>d.date),
          datasets:[{
            label:'Avg Petrol Price (UGX)',
            data:last30Days.map(d=>Math.round(d.avg)),
            borderColor:'#76FF03',
            backgroundColor:'rgba(118,255,3,0.08)',
            fill:true,
            tension:0.3,
            pointRadius:2,
          }]
        },
        options:{
          responsive:true,
          maintainAspectRatio:false,
          plugins:{legend:{display:false}},
          scales:{y:{beginAtZero:false,ticks:{callback:v=>'UGX '+v.toLocaleString()}}}
        }
      });
    }
  }
  renderSLATimers();
}

/* ─── FRAUD QUEUE ─── */
function renderFraudQueue() {
  const queue = DB.admin.fraudQueue || [];
  const pending = queue.filter(f=>f.status==='pending');
  const body = document.getElementById('fraudTableBody');
  const count = document.getElementById('fraudQueueCount');
  const scan = document.getElementById('fraudLastScan');
  if (count) count.textContent = pending.length + ' flagged';
  if (scan) scan.textContent = new Date().toLocaleTimeString();

  if (!body) return;
  if (pending.length === 0) {
    body.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-dim);font-size:0.85rem;">✅ No pending flags. Moving Median Engine reports clean data.</td></tr>';
    return;
  }
  body.innerHTML = pending.slice(0,20).map(f => {
    const confCls = f.confidence==='high'?'conf-high':f.confidence==='med'?'conf-med':'conf-low';
    const devCls = f.deviationPct >= 20 ? 'dev-up' : 'dev-down';
    return `<tr>
      <td style="font-size:0.65rem;color:var(--text-dim);">${new Date(f.timestamp).toLocaleTimeString()}</td>
      <td><strong>${f.stationName}</strong><br><span style="font-size:0.65rem;color:var(--text-dim);">${f.location}</span></td>
      <td style="font-size:0.7rem;font-family:var(--font-mono);color:var(--text-dim);">${f.userId}</td>
      <td class="price-cell" style="color:#fca5a5;">UGX ${f.reportedPrice.toLocaleString()}</td>
      <td class="price-cell" style="color:var(--neon);">UGX ${f.currentPrice.toLocaleString()}</td>
      <td class="price-cell ${devCls}">${f.deviationPct.toFixed(1)}%</td>
      <td><span class="${confCls}" style="font-weight:600;font-size:0.7rem;">${f.confidence.toUpperCase()}</span></td>
      <td><div class="fraud-actions">
        <button class="btn-fraud-approve" onclick="fraudApprove(${f.id})">✓ Approve</button>
        <button class="btn-fraud-dismiss" onclick="fraudDismiss(${f.id})">✕ Dismiss</button>
        <button class="btn-fraud-throttle" onclick="fraudThrottle(${f.id})">⊘ Throttle</button>
      </div></td>
    </tr>`;
  }).join('');
}

function fraudApprove(id) {
  const f = (DB.admin.fraudQueue||[]).find(x=>x.id===id);
  if (!f) return;
  f.status = 'approved';
  const s = getStation(f.stationId);
  if (s) { s[f.fuel||'petrol'] = f.reportedPrice; s.lastUpdated = new Date().toISOString(); }
  if (!DB.admin.auditLog) DB.admin.auditLog = [];
  DB.admin.auditLog.push({
    id:Date.now(), timestamp:new Date().toISOString(), stationId:f.stationId,
    stationName:f.stationName, modifiedBy:'Admin:memd_user',
    previousPrice:f.currentPrice, newPrice:f.reportedPrice, fuel:f.fuel||'petrol',
    channel:'admin', action:'price_update',
  });
  saveDB();
  renderFraudQueue();
  renderMapMarkers();
  showToast('✅ Approved & synced: UGX '+f.reportedPrice.toLocaleString()+' pushed to public view.');
}

function fraudDismiss(id) {
  const f = (DB.admin.fraudQueue||[]).find(x=>x.id===id);
  if (!f) return;
  f.status = 'dismissed';
  if (!DB.reports) DB.reports = [];
  DB.reports.push({
    id:Date.now(), stationId:f.stationId, stationName:f.stationName, fuel:f.fuel||'petrol',
    price:f.reportedPrice, location:f.location, timestamp:new Date().toISOString(),
    status:'rejected', rejectionReason:'Admin dismissed — flagged by Moving Median Engine.',
  });
  if (!DB.admin.auditLog) DB.admin.auditLog = [];
  DB.admin.auditLog.push({
    id:Date.now(), timestamp:new Date().toISOString(), stationId:f.stationId,
    stationName:f.stationName, modifiedBy:'Admin:memd_user',
    previousPrice:f.currentPrice, newPrice:f.reportedPrice, fuel:f.fuel||'petrol',
    channel:'admin', action:'fraud_dismiss',
  });
  saveDB();
  renderFraudQueue();
  showToast('✕ Dismissed & logged. Reporter flagged.');
}

function fraudThrottle(id) {
  const f = (DB.admin.fraudQueue||[]).find(x=>x.id===id);
  if (!f) return;
  f.status = 'throttled';
  if (!DB.blacklist) DB.blacklist = [];
  DB.blacklist.push({ userId:f.userId, phone:f.userId, reason:'Fraud throttle — deviated '+f.deviationPct.toFixed(0)+'% from baseline', date:new Date().toISOString() });
  if (!DB.admin.auditLog) DB.admin.auditLog = [];
  DB.admin.auditLog.push({
    id:Date.now(), timestamp:new Date().toISOString(), stationId:f.stationId,
    stationName:f.stationName, modifiedBy:'Admin:memd_user',
    previousPrice:f.currentPrice, newPrice:f.reportedPrice, fuel:f.fuel||'petrol',
    channel:'admin', action:'fraud_dismiss',
  });
  saveDB();
  renderFraudQueue();
  showToast('⊘ Account throttled: '+f.userId+' blacklisted from submitting data.');
}

/* ─── KYC PIPELINE ─── */
function renderKYCPipeline() {
  const apps = DB.admin.kycApplications || [];
  const pending = apps.filter(a=>a.status==='pending');
  const cnt = document.getElementById('kycPendingCount');
  if (cnt) cnt.textContent = pending.length + ' pending';

  const list = document.getElementById('kycCardList');
  if (!list) return;
  if (pending.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-dim);font-size:0.85rem;">✅ All applications processed. No pending KYC reviews.</div>';
    return;
  }
  list.innerHTML = pending.map(a => `
    <div class="kyc-card">
      <div class="kyc-avatar">🏪</div>
      <div class="kyc-info">
        <div class="name">${a.name}</div>
        <div class="meta">${a.operator} · ${a.phone} · ${a.district}, ${a.region}</div>
        <div class="docs">${a.docs.map(d => '<span class="tag">📄 '+d+'</span>').join('')}</div>
      </div>
      <div class="kyc-actions">
        <button class="btn-tool btn-tool-primary btn-tool-sm" onclick="authorizeOperator(${a.id})">✓ Authorize</button>
        <button class="btn-tool btn-tool-outline btn-tool-sm" onclick="rejectOperator(${a.id})" style="border-color:rgba(239,68,68,0.3);color:#fca5a5;">✕ Reject</button>
      </div>
      <div class="kyc-date">${new Date(a.submitted).toLocaleDateString()}</div>
    </div>
  `).join('');
}

function authorizeOperator(id) {
  const a = (DB.admin.kycApplications||[]).find(x=>x.id===id);
  if (!a) return;
  a.status = 'approved';
  if (!DB.admin.apiTokens) DB.admin.apiTokens = [];
  const tokenStr = 'mfw_v2_'+a.name.toLowerCase().replace(/[^a-z0-9]/g,'_')+'_'+Math.random().toString(36).substr(2,16);
  DB.admin.apiTokens.push({
    id:Date.now(), name:a.name+' — Operator Token', token:tokenStr,
    operator:a.name, created:new Date().toISOString(), lastUsed:null,
    status:'active', rateLimit:'500 req/min',
  });
  if (!DB.admin.auditLog) DB.admin.auditLog = [];
  DB.admin.auditLog.push({
    id:Date.now(), timestamp:new Date().toISOString(), stationId:a.id,
    stationName:a.name, modifiedBy:'Admin:memd_user',
    previousPrice:0, newPrice:0, fuel:'petrol', channel:'admin', action:'operator_auth',
  });
  saveDB();
  renderKYCPipeline();
  showToast('✅ '+a.name+' authorized as Base Station Operator. Token generated.');
}

function rejectOperator(id) {
  const a = (DB.admin.kycApplications||[]).find(x=>x.id===id);
  if (!a) return;
  a.status = 'rejected';
  saveDB();
  renderKYCPipeline();
  showToast('✕ '+a.name+' application rejected.');
}

/* ─── WHITELIST ─── */
function renderWhitelist() {
  const apps = (DB.admin.kycApplications||[]).filter(a=>a.status==='approved');
  const container = document.getElementById('whitelistTableBody');
  if (!container) return;
  const search = (document.getElementById('whitelistSearch')?.value||'').toLowerCase();
  const filtered = search ? apps.filter(a=>a.name.toLowerCase().includes(search)||a.district.toLowerCase().includes(search)) : apps;
  if (filtered.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-dim);font-size:0.8rem;">No whitelisted operators found.</div>';
    return;
  }
  container.innerHTML = filtered.map(a => `
    <div class="whitelist-row">
      <div><strong style="font-size:0.85rem;">${a.name}</strong><br><span style="font-size:0.7rem;color:var(--text-dim);">${a.operator} · ${a.district}, ${a.region}</span></div>
      <div><span class="badge badge-green">Active</span></div>
    </div>
  `).join('');
}

document.addEventListener('input', e=>{ if (e.target.id==='whitelistSearch') renderWhitelist(); });

/* ─── AUDIT TRAIL ─── */
function renderAuditTrail() {
  const log = DB.admin.auditLog || [];
  const channel = document.getElementById('auditChannelFilter')?.value || 'all';
  const type = document.getElementById('auditTypeFilter')?.value || 'all';
  const body = document.getElementById('auditLedgerBody');
  if (!body) return;

  let filtered = [...log].reverse();
  if (channel !== 'all') filtered = filtered.filter(e=>e.channel===channel);
  if (type !== 'all') filtered = filtered.filter(e=>e.action===type);

  if (filtered.length === 0) {
    body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-dim);font-size:0.85rem;">No audit entries match filters.</td></tr>';
    return;
  }
  body.innerHTML = filtered.slice(0,30).map(e => {
    const chMap = {web:'🌐 Web',ussd:'📱 USSD',wa:'💬 WA',api:'🔌 API',operator:'🏪 Operator',admin:'🏛️ Admin'};
    return `<tr>
      <td style="font-size:0.65rem;color:var(--text-dim);white-space:nowrap;">${new Date(e.timestamp).toLocaleString()}</td>
      <td style="font-weight:600;">${e.stationName||'—'}<br><span style="font-size:0.6rem;color:var(--text-dim);">ID: ${e.stationId||'—'}</span></td>
      <td style="font-size:0.72rem;color:var(--text-muted);">${e.modifiedBy||'—'}</td>
      <td style="font-family:var(--font-mono);font-size:0.7rem;">${e.previousPrice? 'UGX '+e.previousPrice.toLocaleString() : '—'}</td>
      <td style="font-family:var(--font-mono);font-size:0.7rem;color:var(--neon);">${e.newPrice? 'UGX '+e.newPrice.toLocaleString() : '—'}</td>
      <td style="font-size:0.65rem;color:var(--text-dim);">${chMap[e.channel]||e.channel}</td>
    </tr>`;
  }).join('');
}

document.addEventListener('change', e=>{
  if (e.target.id==='auditChannelFilter' || e.target.id==='auditTypeFilter') renderAuditTrail();
});
document.addEventListener('click', e=>{ if (e.target.id==='auditRefreshBtn') { renderAuditTrail(); showToast('🔄 Ledger refreshed.'); }});

/* ─── HIERARCHY TREE ─── */
function renderHierarchyTree() {
  const tree = DB.admin.hierarchy || [];
  const container = document.getElementById('hierarchyTree');
  if (!container) return;
  container.innerHTML = tree.map(region => renderHierarchyNode(region, 0)).join('');
}

function renderHierarchyNode(node, depth) {
  if (node.type==='area') {
    return `<div class="hierarchy-leaf">
      <span>📍 ${node.name}</span>
      <div class="actions">
        <span style="font-size:0.6rem;color:var(--text-dim);margin-right:6px;">${(node.stations||[]).length} stations</span>
        <button class="btn-tool btn-tool-outline btn-tool-sm" onclick="deleteHierarchyNode(${node.id})" style="font-size:0.55rem;padding:1px 4px;color:#fca5a5;">✕</button>
      </div>
    </div>`;
  }
  const children = node.children || [];
  const icon = node.type==='region'?'🏙️':node.type==='district'?'📍':'';
  const childType = node.type==='region'?'district':node.type==='district'?'area':'station';
  return `<div class="hierarchy-node">
    <div class="hierarchy-node-header" onclick="this.nextElementSibling.classList.toggle('open');this.querySelector('.toggle').classList.toggle('open')">
      <span>${icon} ${node.name} <span style="font-size:0.65rem;color:var(--text-dim);font-weight:400;">(${node.type})</span></span>
      <span class="toggle">▶</span>
    </div>
    <div class="hierarchy-children">
      ${children.map(c => renderHierarchyNode(c, depth+1)).join('')}
      ${node.type!=='area' ? `<div style="padding:4px 12px;display:flex;gap:4px;"><button class="btn-tool btn-tool-outline btn-tool-sm" onclick="addSubNode(${node.id},'${childType}')" style="font-size:0.65rem;">+ Add ${childType.charAt(0).toUpperCase()+childType.slice(1)}</button><button class="btn-tool btn-tool-outline btn-tool-sm" onclick="deleteHierarchyNode(${node.id})" style="font-size:0.55rem;padding:1px 6px;color:#fca5a5;">✕ Delete</button></div>` : ''}
    </div>
  </div>`;
}

document.addEventListener('click', e => {
  if (e.target.id==='addRegionBtn') {
    const name = prompt('Enter new region name:');
    if (name && name.trim()) {
      if (!DB.admin.hierarchy) DB.admin.hierarchy = [];
      DB.admin.hierarchy.push({ id:Date.now(), name:name.trim(), type:'region', children:[] });
      saveDB();
      renderHierarchyTree();
      showToast('✅ Region "'+name.trim()+'" added. USSD & WhatsApp menus will auto-update.');
    }
  }
});

/* ─── ENHANCED BROADCAST ─── */
document.addEventListener('click', e => {
  if(e.target.id==='sendBroadcastBtn'){
    const title=document.getElementById('broadcastTitle')?.value?.trim();
    const msg=document.getElementById('broadcastMsg')?.value?.trim();
    const targets = [];
    if (document.getElementById('targetWeb')?.checked) targets.push('Web');
    if (document.getElementById('targetWA')?.checked) targets.push('WhatsApp');
    if (document.getElementById('targetUSSD')?.checked) targets.push('USSD');
    const districts = document.getElementById('broadcastDistricts')?.value?.trim() || 'All Districts';
    if(!title||!msg) return showToast('Please enter both title and message.');
    if(!DB.broadcasts) DB.broadcasts=[];
    DB.broadcasts.push({
      id:Date.now(), title, message:msg, date:new Date().toISOString(),
      targets: targets.join(', '), districts,
    });
    saveDB();
    if (!DB.admin.auditLog) DB.admin.auditLog = [];
    DB.admin.auditLog.push({
      id:Date.now(), timestamp:new Date().toISOString(), stationId:0,
      stationName:'SYSTEM', modifiedBy:'Admin:memd_user',
      previousPrice:0, newPrice:0, fuel:'petrol', channel:'admin', action:'broadcast',
    });
    showToast('📢 Emergency broadcast sent to '+targets.join(', ')+' ('+districts+')');
    document.getElementById('broadcastTitle').value='';
    document.getElementById('broadcastMsg').value='';
    renderBroadcasts();
  }
});

function renderBroadcasts() {
  const container=document.getElementById('broadcastList');
  if(!container) return;
  const bcs=DB.broadcasts||[];
  if(bcs.length===0){
    container.innerHTML='<div style="color:var(--text-dim);font-size:0.8rem;text-align:center;padding:12px;">No broadcasts yet.</div>';
    return;
  }
  container.innerHTML=bcs.slice(-5).reverse().map(b=>`
    <div style="padding:8px 0;border-bottom:1px solid var(--green-border);font-size:0.78rem;">
      <div style="display:flex;justify-content:space-between;">
        <strong>📢 ${b.title}</strong>
        <span style="font-size:0.6rem;color:var(--text-dim);">${new Date(b.date).toLocaleDateString()}</span>
      </div>
      <div style="color:var(--text-muted);margin:2px 0;">${b.message}</div>
      <div style="font-size:0.6rem;color:var(--text-dim);">🎯 ${b.targets||'All channels'} · 📍 ${b.districts||'All districts'}</div>
    </div>
  `).join('');
}

/* ─── API CONSOLE ─── */
function renderAPITokens() {
  const tokens = DB.admin.apiTokens || [];
  const container = document.getElementById('apiTokenList');
  if (!container) return;
  if (tokens.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-dim);font-size:0.85rem;">No API tokens generated. Click "Generate New Token" to create one.</div>';
    return;
  }
  container.innerHTML = tokens.map(t => `
    <div class="api-token-card">
      <div class="token-status ${t.status}"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:0.85rem;">${t.name}</div>
        <div class="token-key">${t.token}</div>
        <div style="font-size:0.65rem;color:var(--text-dim);margin-top:2px;">
          Created: ${new Date(t.created).toLocaleDateString()} · 
          ${t.lastUsed ? 'Last used: '+new Date(t.lastUsed).toLocaleString() : 'Never used'} · 
          ${t.rateLimit||'—'}
        </div>
      </div>
      <div class="token-actions">
        <span class="badge ${t.status==='active'?'badge-green':'badge-red'}">${t.status}</span>
        ${t.status==='active' ? 
          `<button class="btn-tool btn-tool-outline btn-tool-sm" onclick="cycleToken(${t.id})" style="font-size:0.6rem;">🔄 Cycle</button>
           <button class="btn-tool btn-tool-outline btn-tool-sm" onclick="revokeToken(${t.id})" style="font-size:0.6rem;border-color:rgba(239,68,68,0.3);color:#fca5a5;">✕ Revoke</button>` :
          `<button class="btn-tool btn-tool-outline btn-tool-sm" onclick="reactivateToken(${t.id})" style="font-size:0.6rem;">↻ Reactivate</button>`}
      </div>
    </div>
  `).join('');
}

document.addEventListener('click', e => {
  if (e.target.id==='generateTokenBtn') {
    const name = prompt('Enter token name (e.g. "Shell Uganda — Forecourt Sync"):');
    if (!name || !name.trim()) return;
    const tokenStr = 'mfw_v2_'+name.toLowerCase().replace(/[^a-z0-9]/g,'_')+'_'+Math.random().toString(36).substr(2,16);
    if (!DB.admin.apiTokens) DB.admin.apiTokens = [];
    DB.admin.apiTokens.push({
      id:Date.now(), name:name.trim(), token:tokenStr,
      operator:name.trim().split('—')[0].trim(), created:new Date().toISOString(),
      lastUsed:null, status:'active', rateLimit:'500 req/min',
    });
    saveDB();
    renderAPITokens();
    showToast('🔑 Token generated: '+tokenStr.substr(0,20)+'...');
  }
});

function cycleToken(id) {
  const t = (DB.admin.apiTokens||[]).find(x=>x.id===id);
  if (!t) return;
  const newToken = 'mfw_v2_'+t.name.toLowerCase().replace(/[^a-z0-9]/g,'_')+'_'+Math.random().toString(36).substr(2,16);
  t.token = newToken;
  t.created = new Date().toISOString();
  saveDB();
  renderAPITokens();
  showToast('🔄 Token cycled: '+newToken.substr(0,20)+'...');
}

function revokeToken(id) {
  const t = (DB.admin.apiTokens||[]).find(x=>x.id===id);
  if (!t) return;
  t.status = 'revoked';
  saveDB();
  renderAPITokens();
  showToast('✕ Token revoked: '+t.name);
}

function reactivateToken(id) {
  const t = (DB.admin.apiTokens||[]).find(x=>x.id===id);
  if (!t) return;
  t.status = 'active';
  saveDB();
  renderAPITokens();
  showToast('↻ Token reactivated: '+t.name);
}
let operatorLoggedIn=false;
document.addEventListener('click',e=>{
  if(e.target.id==='opLoginBtn'){
    const phone=document.getElementById('opPhone')?.value?.trim();
    if(!phone||phone.length<8) return showToast('Please enter a valid phone number.');
    // Simulate OTP verification
    showToast(`📱 OTP sent to ${phone}. Use code: 123456`);
    setTimeout(()=>{
      const code=prompt('Enter OTP code sent to your phone:');
      if(code==='123456'){
        operatorLoggedIn=true;
        document.getElementById('opLogin').style.display='none';
        document.getElementById('opDashboard').style.display='block';
        showToast('✅ Verified! Welcome, station operator.');
        renderOperatorDash();
      } else {
        showToast('❌ Invalid OTP. Please try again.');
      }
    },1500);
  }
});

document.addEventListener('click',e=>{
  if(e.target.id==='opUpdatePriceBtn'){
    const stationId=parseInt(document.getElementById('opStation')?.value);
    const fuel=document.getElementById('opFuel')?.value;
    const price=parseFloat(document.getElementById('opPrice')?.value);
    if(!stationId||!price||price<2000||price>10000) return showToast('Enter valid price.');
    const s=getStation(stationId); if(!s){return showToast('Station not found.');}

    // Log the update
    const oldPrice=s[fuel]||0;
    s[fuel]=price;
    s.lastUpdated=new Date().toISOString();
    if(!DB.priceHistory) DB.priceHistory=[];
    DB.priceHistory.push({stationId,fuel,price,date:new Date().toISOString(),source:'operator'});

    // Notify subscribers
    const subs=DB.subscriptions||[];
    const stationSubs=subs.filter(sub=>sub.stationId===stationId);
    if(stationSubs.length>0){
      if(!DB.notifications) DB.notifications=[];
      const change=price-oldPrice;
      stationSubs.forEach(()=>{
        DB.notifications.push({
          id:Date.now()+Math.random(),
          type:change>0?'price_hike':'price_drop',
          stationId, stationName:s.name,
          message:`${change>0?'📈 Price Up':'📉 Price Down'} at ${s.name}: UGX ${price.toLocaleString()}/L`,
          oldPrice, newPrice:price, change,
          read:false, date:new Date().toISOString(),
        });
      });
      renderNotifications();
    }

    saveDB();
    renderMapMarkers();
    renderStationList();
    renderOperatorDash();
    showToast(`✅ Price updated: UGX ${price.toLocaleString()}/L`);
    document.getElementById('opPrice').value='';
  }
});

function renderOperatorDash() {
  if(!operatorLoggedIn) return;
  const stationId=parseInt(document.getElementById('opStation')?.value);
  const s=getStation(stationId);
  if(s){
    document.getElementById('opCurrentPetrol').textContent=s.petrol?`UGX ${s.petrol.toLocaleString()}`:'—';
    document.getElementById('opCurrentDiesel').textContent=s.diesel?`UGX ${s.diesel.toLocaleString()}`:'—';
    document.getElementById('opLastUpdate').textContent=s.lastUpdated?new Date(s.lastUpdated).toLocaleString():'Never';
  }

  // Reports about this station
  const reports=(DB.reports||[]).filter(r=>r.stationId===stationId);
  const container=document.getElementById('opReports');
  if(container){
    if(reports.length===0) container.innerHTML='<div style="color:var(--text-muted);font-size:0.8rem;">No crowd reports for this station.</div>';
    else container.innerHTML=reports.slice(-5).reverse().map(r=>`
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:0.8rem;">
        <span>${r.fuel} · UGX ${r.price.toLocaleString()}</span>
        <span class="badge badge-${r.status==='verified'?'green':r.status==='rejected'?'red':'yellow'}">${r.status}</span>
      </div>
    `).join('');
  }

  // Price consistency alert
  const freqAlert=document.getElementById('opConsistencyAlert');
  if(freqAlert&&s){
    const officialP=(s.petrol||0);
    const crowdReports=(DB.reports||[]).filter(r=>r.stationId===stationId&&r.fuel==='petrol'&&r.status==='verified');
    if(crowdReports.length>0){
      const crowdAvg=crowdReports.reduce((a,b)=>a+b.price,0)/crowdReports.length;
      const dev=Math.abs(officialP-crowdAvg)/officialP*100;
      if(dev>10){
        freqAlert.innerHTML=`<div class="fraud-alert"><div class="icon">⚠️</div><div class="msg"><strong>Price Mismatch Detected</strong>Official price (UGX ${officialP.toLocaleString()}) differs ${dev.toFixed(0)}% from crowd average (UGX ${Math.round(crowdAvg).toLocaleString()}).</div></div>`;
        freqAlert.style.display='block';
      } else {
        freqAlert.style.display='none';
      }
    } else {
      freqAlert.style.display='none';
    }
  }
}

document.addEventListener('change',e=>{
  if(e.target.id==='opStation') renderOperatorDash();
});

/* ─── REVIEW STAR RATING ─── */
document.addEventListener('click',e=>{
  const star=e.target.closest('.star-rating .star');
  if(star){
    const val=parseInt(star.dataset.val);
    const container=star.closest('.star-rating');
    container.querySelectorAll('.star').forEach((s,i)=>{
      s.classList.toggle('active',i<val);
    });
    container.dataset.rating=val;
  }
});

/* ─── REGION CARDS (Live Analytics) ─── */
function renderRegionCards() {
  const container=document.getElementById('regionCards');
  if(!container) return;
  const regions={};
  STATIONS_DATA.filter(s=>s.petrol).forEach(s=>{
    if(!regions[s.region]) regions[s.region]={prices:[],diesel:[],stations:new Set()};
    regions[s.region].prices.push(s.petrol);
    if(s.diesel) regions[s.region].diesel.push(s.diesel);
    regions[s.region].stations.add(s.name);
  });
  const regionOrder=['Central','Western','Eastern','Northern'];
  container.innerHTML=regionOrder.filter(r=>regions[r]).map(r=>{
    const d=regions[r];
    const avg=Math.round(d.prices.reduce((a,b)=>a+b,0)/d.prices.length);
    const min=Math.min(...d.prices);
    const max=Math.max(...d.prices);
    const icons={Central:'🏙️',Western:'🏔️',Eastern:'🌅',Northern:'🌿'};
    return `<div class="value-card">
      <div class="icon-circle">${icons[r]||'📍'}</div>
      <h3>${r} Region</h3>
      <div style="font-size:2rem;font-weight:900;color:var(--neon);margin:8px 0;">UGX ${avg.toLocaleString()}</div>
      <div style="font-size:0.8rem;color:var(--text-muted);">Average Petrol Price</div>
      <div style="margin-top:8px;font-size:0.75rem;color:var(--text-dim);">Range: UGX ${min.toLocaleString()} – ${max.toLocaleString()}</div>
      <div style="margin-top:4px;font-size:0.7rem;color:var(--text-dim);">${d.stations.size} stations monitored</div>
    </div>`;
  }).join('');
}

/* ─── ANALYTICS MINI MAP ─── */
let analyticsMap=null;
function initAnalyticsMap() {
  const el=document.getElementById('analyticsMiniMap');
  if(!el||analyticsMap) return;
  analyticsMap=L.map('analyticsMiniMap',{
    center:[0.5,32.5],zoom:7,zoomControl:false,
    attributionControl:false,scrollWheelZoom:false,dragging:false,
  });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,
  }).addTo(analyticsMap);
  STATIONS_DATA.forEach(s=>{
    L.circleMarker([s.lat,s.lng],{
      radius:4,color:'#76FF03',fillColor:'#76FF03',fillOpacity:0.6,weight:1,
    }).addTo(analyticsMap);
  });
}

/* ─── HERO COUNT ─── */
function updateHeroCount() {
  const el=document.getElementById('heroVerifiedCount');
  if(!el) return;
  const base=1200;
  const verified=(DB.verifiedCount||0);
  el.textContent=`${(base+verified).toLocaleString()}+`;
  const sc=document.getElementById('heroStationsCount');
  if(sc) sc.textContent=STATIONS_DATA.length;

  // Update service grid live caps
  const petrolCap=document.getElementById('heroPetrolCap');
  if(petrolCap) {
    const caps=Object.values(DISTRICT_PRICE_CAPS);
    const maxPetrol=Math.max(...caps.map(c=>c.petrol));
    petrolCap.textContent=maxPetrol.toLocaleString()+' UGX';
  }
  const dieselCap=document.getElementById('heroDieselCap');
  if(dieselCap) {
    const caps=Object.values(DISTRICT_PRICE_CAPS);
    const maxDiesel=Math.max(...caps.map(c=>c.diesel));
    dieselCap.textContent=maxDiesel.toLocaleString()+' UGX';
  }

  // Update metrics with live data
  const peerCount = (DB.peerScore || 0) + 12400;
  const metricPeer = document.getElementById('metricPeerAlerts');
  if (metricPeer) {
    if (peerCount >= 1000) metricPeer.innerHTML = (peerCount/1000).toFixed(1) + '<span class="neon">k+</span>';
    else metricPeer.textContent = peerCount + '<span class="neon">+</span>';
  }
  const invCount = (DB.c2gTickets||[]).filter(t => t.status === 'investigating' || t.status === 'resolved').length + 420;
  const metricInv = document.getElementById('metricInvestigations');
  if (metricInv) metricInv.innerHTML = invCount + '<span class="neon">+</span>';
}

// Orange interaction hub tab switcher
document.addEventListener('click', e => {
  const tab = e.target.closest('.tab-industrial');
  if (tab) {
    const pane = tab.dataset.orangeTab;
    document.querySelectorAll('.tab-industrial').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.tab-content-industrial').forEach(t=>t.classList.remove('active'));
    const el = document.getElementById('orangeTab-'+pane);
    if (el) el.classList.add('active');
  }
  // Mobile nav toggle
  if (e.target.closest('.hamburger-industrial')) {
    document.querySelector('.header-nav').classList.toggle('open');
  }
});

/* ─── SEED NEW DATA ─── */
function seedNewData() {
  // P2P Rooms
  if (DB.p2pRooms.length === 0) {
    DB.p2pRooms = [
      { id:1, name:'Masaka Road Transporters', icon:'🚦', corridor:'Masaka-Kampala Hwy',
        members:24, active:8, lat:0.220, lng:32.380 },
      { id:2, name:'Kampala Northern Bypass', icon:'🚛', corridor:'Northern Bypass',
        members:31, active:12, lat:0.350, lng:32.560 },
      { id:3, name:'Jinja- Kampala Corridor', icon:'🚌', corridor:'Jinja Rd',
        members:19, active:5, lat:0.430, lng:32.810 },
      { id:4, name:'Gulu Highway Riders', icon:'🛵', corridor:'Gulu-Kampala Hwy',
        members:16, active:7, lat:2.770, lng:32.300 },
      { id:5, name:'Eastern Route — Mbale Line', icon:'🚚', corridor:'Mbale-Kampala',
        members:22, active:9, lat:1.080, lng:34.180 },
      { id:6, name:'Mbarara —Kasese Route', icon:'🚐', corridor:'Mbarara-Kasese',
        members:14, active:4, lat:-0.420, lng:29.780 },
      { id:7, name:'Fort Portal Transport Hub', icon:'🚍', corridor:'Fort Portal-Kampala',
        members:11, active:3, lat:0.660, lng:30.270 },
      { id:8, name:'Entebbe Express Link', icon:'🚗', corridor:'Entebbe-Kampala Expwy',
        members:18, active:6, lat:0.060, lng:32.460 },
    ];
    // Seed messages for each room
    DB.p2pMessages = {};
    DB.p2pRooms.forEach(room => {
      const msgs = [];
      const authors = ['Sarah N.','Peter K.','John M.','Grace A.','Robert S.','Faith O.','David W.','Alice T.'];
      const msgsPerRoom = 3 + Math.floor(Math.random() * 4);
      for (let i=0; i<msgsPerRoom; i++) {
        const isTrusted = Math.random() > 0.5;
        const texts = [
          'Fuel at Shell near the stage is UGX 5,350 today. No queue!',
          '⚠️ Accident on the bypass near the clock tower. Take Kyambogo route instead.',
          'Just filled up at Total — diesel is UGX 5,460. Cheapest on this corridor.',
          'Anyone know if Kobil on Bombo Rd has petrol? Need to fill up.',
          'Traffic is heavy heading into town. Expect 20 min delay.',
          'Bulk buyers — we have 5 people pooling at Shell Jinja. Need 2 more!',
          'Station near the market has diesel at UGX 5,520. Long lines though.',
          'Police checkpoint on Masaka Rd near Mpigi. Drive safe.',
          '⭐⭐⭐ Shell fuel quality is good here. No adulteration issues.',
          'Price drop at Total Ntinda — now UGX 5,280 for petrol! Verified.',
          '🚨 Kobil is refusing to adjust prices despite Ministry directive. Report filed.',
          'Good news — Shell Mukono just reduced petrol to UGX 5,310.',
        ];
        const text = texts[Math.floor(Math.random() * texts.length)];
        const author = authors[Math.floor(Math.random() * authors.length)];
        msgs.push({
          id: Date.now() - (msgsPerRoom - i) * 60000 + room.id * 1000,
          roomId: room.id, author, text,
          timestamp: new Date(Date.now() - (msgsPerRoom - i) * 60000).toISOString(),
          upvotes: Math.floor(Math.random() * 8), trusted: isTrusted,
        });
      }
      DB.p2pMessages[room.id] = msgs;
    });
  }

  // C2G Tickets
  if (DB.c2gTickets.length === 0) {
    DB.c2gTickets = [
      { id:'C2G-2025-0042', category:'tampering', stationId:17, stationName:'Kobil Bombo Road',
        date:'2025-05-20', phone:'+256712345678',
        description:'Pump display showed 5L but only 4.3L dispensed. Request investigation.',
        status:'investigating', createdAt:new Date(Date.now()-86400000*3).toISOString(),
        chat:[
          { from:'gov', text:'Thank you for your report. Case assigned to Inspector Mwesigwa.', time:new Date(Date.now()-86400000*2).toISOString() },
          { from:'gov', text:'We need a photo of the pump display. Can you provide one?', time:new Date(Date.now()-86400000*1).toISOString() },
        ]},
      { id:'C2G-2025-0041', category:'overpricing', stationId:5, stationName:'Total Ntinda',
        date:'2025-05-18', phone:'+256776543210',
        description:'Station is selling petrol at UGX 5,550 despite Ministry cap of UGX 5,400.',
        status:'resolved', createdAt:new Date(Date.now()-86400000*7).toISOString(),
        chat:[
          { from:'gov', text:'Report received. We have contacted the station operator.', time:new Date(Date.now()-86400000*6).toISOString() },
          { from:'gov', text:'Station has complied with the directive. Price adjusted to UGX 5,350. Thank you for your vigilance.', time:new Date(Date.now()-86400000*4).toISOString() },
        ]},
      { id:'C2G-2025-0040', category:'adulterated', stationId:47, stationName:'Shell Arua',
        date:'2025-05-15', phone:'+256701234567',
        description:'Several vehicles broke down after refueling. Suspect water in diesel.',
        status:'open', createdAt:new Date(Date.now()-86400000*10).toISOString(),
        chat:[]},
    ];
  }

  // G2C Posts
  if (DB.g2cPosts.length === 0) {
    DB.g2cPosts = [
      { id:1, title:'New National Fuel Price Cap Effective June 1', source:'Ministry of Energy & Mineral Development',
        body:'The Ministry of Energy and Mineral Development (MEMD) announces a reviewed fuel price cap effective 1st June 2025. Petrol retail price shall not exceed UGX 5,400 per liter, and diesel UGX 5,480 per liter across all licensed stations nationwide. Fuel stations found in violation will face immediate suspension of their operating license.',
        date:new Date(Date.now()-86400000*2).toISOString(), type:'directive' },
      { id:2, title:'Quality Assurance: Nationwide Fuel Sampling Exercise', source:'Uganda National Bureau of Standards (UNBS)',
        body:'UNBS in collaboration with MEMD has commenced a nationwide fuel quality sampling exercise. All licensed stations are required to submit samples for testing. Preliminary results from Kampala and Wakiso districts show 94% compliance with set standards.',
        date:new Date(Date.now()-86400000*5).toISOString(), type:'update' },
      { id:3, title:'⚠️ Public Warning: Adulterated Fuel in Circulation', source:'Ministry of Energy & Mineral Development',
        body:'MEMD warns the public about substandard fuel being sold along the Kampala-Masaka corridor. Official testing revealed elevated sulfur content in diesel samples collected in the Mpigi area. Citizens are advised to report any suspected adulteration via the C2G ticketing system.',
        date:new Date(Date.now()-86400000*8).toISOString(), type:'alert' },
      { id:4, title:'Monthly Town Hall: Fuel Pricing & Consumer Protection', source:'Minister of State for Energy',
        body:'Join us for the monthly "Fuel Market Dialogue" AMA session on 15th June 2025 at 10:00 AM EAT. The Minister will address citizen concerns on fuel pricing, pump calibration enforcement, and the new Petroleum Supply Act amendments. Submit your questions in advance via the AMA section below.',
        date:new Date(Date.now()-86400000*10).toISOString(), type:'townhall' },
      { id:5, title:'Operators: New KYC Requirements Coming July 2025', source:'Ministry of Energy & Mineral Development',
        body:'All fuel station operators must complete enhanced KYC registration by July 1, 2025 to continue API integration with the national fuel pricing system. Non-compliant stations will be delisted from MafutaWatch Uganda and associated USSD and WhatsApp services.',
        date:new Date(Date.now()-86400000*14).toISOString(), type:'notice' },
    ];
  }

  // G2C AMA sessions
  if (DB.g2cAma.length === 0) {
    DB.g2cAma = [
      { id:1, title:'Fuel Market Dialogue — Monthly AMA', host:'Minister of State for Energy',
        date:'2025-06-15T10:00:00', description:'Open Q&A on fuel pricing, pump calibration, and consumer rights.',
        questions:[
          { name:'Sarah N.', text:'Will the price cap apply to all stations including remote areas?', votes:12 },
          { name:'Peter K.', text:'How do we verify pump calibration is accurate?', votes:8 },
        ]},
      { id:2, title:'Petroleum Supply Act — Public Consultation', host:'Permanent Secretary, MEMD',
        date:'2025-06-22T14:00:00', description:'Discussion of the new Petroleum Supply Act amendments and their impact on transporters.',
        questions:[
          { name:'Grace A.', text:'How will the new Act affect fuel transportation licensing?', votes:5 },
        ]},
    ];
  }

  saveDB();
}

/* ─── COMMUNITY BROADCAST SYSTEM ─── */
function submitBroadcast() {
  const input = document.getElementById('broadcastInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text || text.length < 5) return showToast('Please enter at least 5 characters.');
  if (!DB.broadcasts) DB.broadcasts = [];
  DB.broadcasts.push({
    id: Date.now(), text,
    timestamp: new Date().toISOString(),
    verified: (DB.trustScore || 0) >= 20,
    upvotes: 0,
  });
  DB.peerScore = (DB.peerScore || 0) + 1;
  saveDB();
  input.value = '';
  document.getElementById('charCount').textContent = '0/140';
  showToast('📢 Broadcast sent! It will appear in the community feed.');
  updateBroadcastTicker();
  updateHubCounts();
}

function updateBroadcastTicker() {
  const ticker = document.getElementById('feedTicker');
  if (!ticker) return;
  const bcs = DB.broadcasts || [];
  const recent = bcs.slice(-8).reverse();
  const items = recent.map(b => {
    const time = new Date(b.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    const prefix = b.verified ? '✅ <strong>Verified:</strong>' : '📢 <strong>Broadcast:</strong>';
    return `<div class="ticker-item">${prefix} ${b.text} <span style="font-size:0.6rem;color:var(--text-dim);">· ${time}</span></div>`;
  }).join('');
  ticker.innerHTML = items || '<div class="ticker-item" style="color:var(--text-dim);">No broadcasts yet. Be the first to share!</div>';
}

document.addEventListener('input', e => {
  if (e.target.id === 'broadcastInput') {
    const count = e.target.value.length;
    document.getElementById('charCount').textContent = count + '/140';
  }
});

document.addEventListener('click', e => {
  if (e.target.id === 'sendBroadcastBtnHero') submitBroadcast();
});

// Auto-generate sample broadcasts periodically
function simulateBroadcasts() {
  if (!DB.broadcasts) DB.broadcasts = [];
  if (DB.broadcasts.length > 50) return; // Don't grow too large
  const samples = [
    '⚠️ Boda Stage Alert: Heavy traffic heading into downtown Mbarara due to truck breakdown. Shell Mbarara has zero lines right now.',
    '📢 Fuel price drop at Total Ntinda — now UGX 5,280 for petrol!',
    '📍 Route Update: Shell Entebbe Airport has shortest queue times (avg 4 min).',
    '🚨 Consumer Alert: Kobil Bombo Road pump #3 displaying incorrect amounts. Report filed.',
    '✅ Diesel at UGX 5,450 at Shell Jinja Main — consensus confirmed by 5 riders.',
    '💡 Tip: Shell Mukono has both fuels and zero queue this morning.',
    '⚠️ Heavy rain on Kampala-Entebbe road. Drive carefully.',
    '📢 Stabex Mukono just reduced petrol to UGX 5,310!',
    '📍 Total Fort Portal has diesel available — few stations in the area have supply.',
    '👥 Looking for 3 more riders to pool fuel at Total Mbarara. DM to join.',
  ];
  const pick = samples[Math.floor(Math.random() * samples.length)];
  DB.broadcasts.push({
    id: Date.now(), text: pick,
    timestamp: new Date().toISOString(),
    verified: Math.random() > 0.5,
    upvotes: 0,
  });
  saveDB();
  updateBroadcastTicker();
  updateHubCounts();
}

/* ─── P2P CHAT ROOMS ─── */
function renderP2PRooms() {
  const container = document.getElementById('p2pRoomList');
  if (!container) return;
  const rooms = DB.p2pRooms || [];
  container.innerHTML = rooms.map(r => {
    const msgs = (DB.p2pMessages[r.id] || []);
    const lastTime = msgs.length > 0 ? new Date(msgs[msgs.length-1].timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—';
    return `<div class="p2p-room-card" onclick="openP2PRoom(${r.id})">
      <div class="room-icon">${r.icon}</div>
      <div class="room-info">
        <div class="room-name">${r.name}</div>
        <div class="room-meta">${r.corridor} · last active ${lastTime}</div>
      </div>
      <div class="room-stats">
        <div class="room-count">${r.active}</div>
        <div class="room-label">online</div>
      </div>
    </div>`;
  }).join('');
}

function openP2PRoom(roomId) {
  const room = (DB.p2pRooms || []).find(r => r.id === roomId);
  if (!room) return;
  document.getElementById('p2pRoomList').style.display = 'none';
  document.getElementById('p2pActiveRoom').style.display = 'block';
  document.getElementById('p2pRoomTitle').textContent = room.icon + ' ' + room.name;
  document.getElementById('p2pRoomMeta').textContent = '📍 ' + room.corridor + ' · ' + room.members + ' members · ' + room.active + ' online';
  document.getElementById('p2pActiveRoom').dataset.roomId = roomId;
  renderP2PMessages(roomId);
}

function renderP2PMessages(roomId) {
  const container = document.getElementById('p2pMessages');
  if (!container) return;
  const msgs = (DB.p2pMessages[roomId] || []).slice(-30);
  if (msgs.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-dim);font-size:0.82rem;">No messages yet. Start the conversation!</div>';
    return;
  }
  container.innerHTML = msgs.map(m => {
    const initials = m.author.split(' ').map(n=>n[0]).join('');
    const trustedBadge = m.trusted ? '<span class="trusted-badge">✓ Trusted Local</span>' : '';
    const time = new Date(m.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    return `<div class="chat-msg">
      <div class="msg-avatar">${initials}</div>
      <div class="msg-content">
        <div class="msg-author">${m.author} ${trustedBadge} <span class="msg-time">${time}</span></div>
        <div class="msg-text">${m.text}</div>
        <div class="msg-actions">
          <button onclick="upvoteP2PMsg(${roomId},${m.id})">👍 ${m.upvotes || 0}</button>
        </div>
      </div>
    </div>`;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

function upvoteP2PMsg(roomId, msgId) {
  const msgs = DB.p2pMessages[roomId];
  if (!msgs) return;
  const msg = msgs.find(m => m.id === msgId);
  if (!msg) return;
  msg.upvotes = (msg.upvotes || 0) + 1;
  if (msg.upvotes >= 5) msg.trusted = true;
  DB.peerScore = (DB.peerScore || 0) + 1;
  if (DB.peerScore % 10 === 0) DB.trustScore = Math.min(100, (DB.trustScore || 0) + 1);
  saveDB();
  renderP2PMessages(roomId);
  updateHubCounts();
}

document.addEventListener('click', e => {
  if (e.target.id === 'p2pBackBtn') {
    document.getElementById('p2pActiveRoom').style.display = 'none';
    document.getElementById('p2pRoomList').style.display = 'block';
  }
  if (e.target.id === 'p2pSendBtn') {
    const roomEl = document.getElementById('p2pActiveRoom');
    const roomId = parseInt(roomEl?.dataset?.roomId);
    if (!roomId) return;
    const input = document.getElementById('p2pMsgInput');
    const text = input?.value?.trim();
    if (!text) return showToast('Please enter a message.');
    if (!DB.p2pMessages[roomId]) DB.p2pMessages[roomId] = [];
    const authors = ['You','Sarah N.','Peter K.','John M.','Grace A.','Robert S.','Faith O.','David W.','Alice T.'];
    DB.p2pMessages[roomId].push({
      id: Date.now(), roomId,
      author: authors[Math.floor(Math.random() * authors.length)],
      text, timestamp: new Date().toISOString(),
      upvotes: 0, trusted: (DB.trustScore || 0) >= 50,
    });
    saveDB();
    input.value = '';
    document.getElementById('p2pCharCount').textContent = '0/280';
    renderP2PMessages(roomId);
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'p2pMsgInput') {
    document.getElementById('p2pCharCount').textContent = e.target.value.length + '/280';
  }
});

/* ─── C2G TICKETING SYSTEM ─── */
function initC2GForm() {
  const sel = document.getElementById('c2gStation');
  if (!sel) return;
  sel.innerHTML = '<option value="">Select station...</option>';
  getStations().forEach(s => {
    const op = getOp(s.op);
    sel.innerHTML += `<option value="${s.id}">${s.name} — ${op.short}, ${s.area}</option>`;
  });
}

document.addEventListener('click', e => {
  if (e.target.id === 'c2gSubmitBtn') submitC2GTicket();
});

function submitC2GTicket() {
  const category = document.getElementById('c2gCategory')?.value;
  const stationId = parseInt(document.getElementById('c2gStation')?.value);
  const date = document.getElementById('c2gDate')?.value;
  const phone = document.getElementById('c2gPhone')?.value?.trim() || '';
  const desc = document.getElementById('c2gDescription')?.value?.trim();
  const vehicleType = document.getElementById('c2gVehicleType')?.value;

  if (!category) return showToast('Please select a violation category.');
  if (!stationId) return showToast('Please select a fuel station.');
  if (!vehicleType) return showToast('Please select your vehicle type.');
  if (!desc || desc.length < 10) return showToast('Please describe the issue in detail (min 10 chars).');

  const station = getStation(stationId);
  const ticketId = 'C2G-2025-' + String((DB.c2gTickets||[]).length + 42).padStart(4,'0');

  // Read uploaded file metadata
  const fileInput = document.getElementById('c2gFileInput');
  const uploadedFiles = [];
  if (fileInput && fileInput.files.length > 0) {
    for (let f of fileInput.files) {
      uploadedFiles.push({ name: f.name, size: f.size, type: f.type });
    }
  }

  if (!DB.c2gTickets) DB.c2gTickets = [];
  DB.c2gTickets.push({
    id: ticketId, category, stationId, stationName: station?.name || 'Unknown',
    date, phone, description: desc, status: 'open',
    createdAt: new Date().toISOString(), chat: [],
    vehicleType, uploadedFiles,
  });

  const catLabels = { tampering:'Pump Tampering', adulterated:'Adulterated Fuel', overpricing:'Overpricing', refusal:'Refusal to Comply', quality:'Fuel Quality', other:'Other' };

  if (!DB.notifications) DB.notifications = [];
  DB.notifications.push({
    id: Date.now(), type: 'c2g_ticket',
    message: `📋 Ticket ${ticketId} created: ${catLabels[category]||category} at ${station?.name||'Unknown'}`,
    read: false, date: new Date().toISOString(),
  });
  renderNotifications();

  DB.trustScore = Math.min(100, (DB.trustScore || 0) + 2);
  saveDB();
  showToast(`✅ Ticket ${ticketId} generated! A ministry regulator will be assigned within 24 hrs.`);

  document.getElementById('c2gCategory').value = '';
  document.getElementById('c2gStation').value = '';
  document.getElementById('c2gPhone').value = '';
  document.getElementById('c2gDescription').value = '';
  document.getElementById('c2gDate').value = '';

  renderC2GTickets();
  updateHubCounts();
}

function renderC2GTickets() {
  const container = document.getElementById('c2gTicketList');
  if (!container) return;
  const tickets = DB.c2gTickets || [];
  if (tickets.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-dim);font-size:0.82rem;">No tickets yet. Submit your first exploitation report above.</div>';
    return;
  }
  const catLabels = { tampering:'🔧 Pump Tampering', adulterated:'⚠️ Adulterated Fuel', overpricing:'💰 Overpricing', refusal:'🚫 Refusal to Comply', quality:'🧪 Fuel Quality', other:'📝 Other' };
  container.innerHTML = tickets.slice(-10).reverse().map(t => {
    const statusLabels = { open:'🟢 Open', investigating:'🟡 Investigating', resolved:'🔵 Resolved', closed:'⚪ Closed' };
    const chatHtml = t.chat && t.chat.length > 0 ? t.chat.map(c => `
      <div class="chat-bubble ${c.from === 'gov' ? 'gov' : 'user'}">
        <div class="bubble-author">${c.from === 'gov' ? '🏛️ Regulator' : '👤 You'}</div>
        <div class="bubble-text">${c.text}</div>
      </div>
    `).join('') : '';
    return `<div class="c2g-ticket-card">
      <div class="ticket-header">
        <span class="ticket-id">${t.id}</span>
        <span class="ticket-status ${t.status}">${statusLabels[t.status] || t.status}</span>
      </div>
      <div class="ticket-cat">${catLabels[t.category]||t.category} · ${t.stationName}</div>
      <div class="ticket-desc">${t.description}</div>
      ${t.chat && t.chat.length > 0 ? `<div class="ticket-chat">${chatHtml}</div>` : ''}
      <div style="margin-top:6px;font-size:0.65rem;color:var(--text-dim);">${new Date(t.createdAt).toLocaleDateString()}</div>
    </div>`;
  }).join('');
}

document.addEventListener('click', e => {
  if (e.target.id === 'c2gTrackBtn') {
    const input = document.getElementById('c2gTrackInput')?.value?.trim().toUpperCase();
    if (!input) return showToast('Please enter a ticket ID.');
    const ticket = (DB.c2gTickets || []).find(t => t.id.toUpperCase() === input);
    const result = document.getElementById('c2gTrackResult');
    if (!ticket) {
      result.innerHTML = '<div class="empty-state" style="padding:16px;"><div class="icon">🔍</div><p>No ticket found with ID ' + input + '. Please check and try again.</p></div>';
      return;
    }
    const catLabels = { tampering:'Pump Tampering', adulterated:'Adulterated Fuel', overpricing:'Overpricing', refusal:'Refusal to Comply', quality:'Fuel Quality', other:'Other' };
    const statusLabels = { open:'🟢 Open — Awaiting Assignment', investigating:'🟡 Investigating — Assigned to Regulator', resolved:'🔵 Resolved — Action Taken', closed:'⚪ Closed' };
    result.innerHTML = `<div class="ticket-track-result">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="track-id">${ticket.id}</span>
        <span style="font-size:0.75rem;padding:2px 10px;border-radius:999px;background:var(--neon-dim);color:var(--neon);font-weight:600;">${statusLabels[ticket.status] || ticket.status}</span>
      </div>
      <div class="track-detail">
        <div><span>Category</span><span style="font-weight:600;">${catLabels[ticket.category]||ticket.category}</span></div>
        <div><span>Station</span><span style="font-weight:600;">${ticket.stationName}</span></div>
        <div><span>Submitted</span><span>${new Date(ticket.createdAt).toLocaleDateString()}</span></div>
        <div><span>Regulator Chat</span><span>${(ticket.chat||[]).length} messages</span></div>
      </div>
    </div>`;
  }
});

document.addEventListener('click', e => {
  if (e.target.id === 'c2gUploadBtn') {
    document.getElementById('c2gFileInput').click();
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'c2gFileInput') {
    const files = e.target.files;
    const list = document.getElementById('c2gFileList');
    if (files.length > 0) {
      list.innerHTML = Array.from(files).map(f => {
        const sizeKB = (f.size / 1024).toFixed(1);
        const isImage = f.type.startsWith('image/');
        return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">' +
          (isImage ? '<img src="' + URL.createObjectURL(f) + '" style="width:40px;height:40px;object-fit:cover;border-radius:4px;">' : '📎') +
          '<span style="font-size:0.8rem;">' + f.name + ' <span style="color:var(--text-dim);font-size:0.65rem;">(' + sizeKB + ' KB)</span></span></div>';
      }).join('');
      showToast('📷 ' + files.length + ' file(s) attached.');
    } else {
      list.innerHTML = '';
    }
  }
});

// Set default date on C2G form
document.addEventListener('DOMContentLoaded', () => {
  const dateInput = document.getElementById('c2gDate');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
});

/* ─── G2C ADVISORY ─── */
function renderG2CPosts() {
  const container = document.getElementById('g2cPostList');
  if (!container) return;
  const posts = DB.g2cPosts || [];
  if (posts.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">🏛️</div><p>No official releases yet.</p></div>';
    return;
  }
  const typeLabels = { directive:'📜 Directive', update:'📢 Update', alert:'⚠️ Alert', townhall:'🎤 Town Hall', notice:'📋 Notice' };
  container.innerHTML = posts.slice().reverse().map(p => `
    <div class="g2c-post">
      <div class="post-header">
        <div class="post-title">${typeLabels[p.type]||'📄'} ${p.title} <span class="verified-badge">✓ Verified @energy.go.ug</span></div>
        <span style="font-size:0.65rem;color:var(--text-dim);white-space:nowrap;">${new Date(p.date).toLocaleDateString()}</span>
      </div>
      <div class="post-source"><span class="gov-badge"></span> ${p.source}</div>
      <div class="post-body">${p.body}</div>
      <div class="post-meta">🔒 Official communication — unalterable · Ministry of Energy & Mineral Development</div>
    </div>
  `).join('');
}

function renderG2CAMA() {
  const container = document.getElementById('g2cAmaList');
  if (!container) return;
  const sessions = DB.g2cAma || [];
  if (sessions.length === 0) {
    container.innerHTML = '<div style="color:var(--text-dim);font-size:0.8rem;">No upcoming AMA sessions scheduled.</div>';
    return;
  }
  container.innerHTML = sessions.map(a => {
    const d = new Date(a.date);
    const isUpcoming = d > new Date();
    const questionsHtml = (a.questions || []).map(q => `
      <div style="font-size:0.75rem;padding:4px 0;border-bottom:1px solid var(--green-border);display:flex;justify-content:space-between;">
        <span><strong>${q.name}:</strong> ${q.text}</span>
        <span style="color:var(--neon);font-weight:600;">👍 ${q.votes}</span>
      </div>
    `).join('');
    return `<div class="ama-card">
      <div class="ama-title">${isUpcoming ? '🟢 Upcoming' : '🔵 Past'} · ${a.title}</div>
      <div class="ama-date">🎤 ${a.host} · ${d.toLocaleDateString()} at ${d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
      <div class="ama-desc">${a.description}</div>
      <div style="margin-top:8px;">
        <div style="font-size:0.75rem;font-weight:600;margin-bottom:4px;">Questions (${(a.questions||[]).length}):</div>
        ${questionsHtml || '<div style="font-size:0.7rem;color:var(--text-dim);">No questions yet. Be the first to ask!</div>'}
      </div>
      ${isUpcoming ? `<div class="ama-ask">
        <input type="text" placeholder="Submit your question for the Minister..." id="amaQ_${a.id}">
        <button onclick="submitAMAQuestion(${a.id})">Ask ↗</button>
      </div>` : ''}
    </div>`;
  }).join('');
}

function submitAMAQuestion(amaId) {
  const input = document.getElementById('amaQ_' + amaId);
  const text = input?.value?.trim();
  if (!text) return showToast('Please enter a question.');
  const session = (DB.g2cAma || []).find(a => a.id === amaId);
  if (!session) return;
  if (!session.questions) session.questions = [];
  session.questions.push({ name: 'You', text, votes: 0 });
  saveDB();
  input.value = '';
  renderG2CAMA();
  showToast('✅ Question submitted! It will be queued for the AMA session.');
}

/* ─── HUB COUNTS ─── */
function updateHubCounts() {
  const p2pRooms = DB.p2pRooms || [];
  const totalActive = p2pRooms.reduce((s, r) => s + r.active, 0);
  const el1 = document.getElementById('hubP2PCount');
  if (el1) el1.textContent = totalActive.toLocaleString();
  const el1b = document.getElementById('hubP2PMsgCount');
  if (el1b) el1b.textContent = p2pRooms.length;

  const tickets = DB.c2gTickets || [];
  const openTickets = tickets.filter(t => t.status === 'open' || t.status === 'investigating').length;
  const resolvedTickets = tickets.filter(t => t.status === 'resolved').length;
  const el2 = document.getElementById('hubC2GCount');
  if (el2) el2.textContent = openTickets;
  const el2b = document.getElementById('hubC2GResolved');
  if (el2b) el2b.textContent = resolvedTickets;

  const posts = DB.g2cPosts || [];
  const el3 = document.getElementById('hubG2CCount');
  if (el3) el3.textContent = posts.length;
  const ama = DB.g2cAma || [];
  const upcomingAMA = ama.filter(a => new Date(a.date) > new Date()).length;
  const el4 = document.getElementById('hubG2CAMA');
  if (el4) el4.textContent = upcomingAMA;
}

/* ─── PRICE CAP MATRIX ─── */
function renderPriceCapMatrix() {
  const container = document.getElementById('priceCapMatrix');
  if (!container) return;
  const districts = Object.keys(DISTRICT_PRICE_CAPS);
  const avgPrices = {};
  districts.forEach(d => {
    const stations = STATIONS_DATA.filter(s => s.district === d);
    if (stations.length > 0) {
      const petrolPrices = stations.filter(s => s.petrol).map(s => s.petrol);
      const dieselPrices = stations.filter(s => s.diesel).map(s => s.diesel);
      avgPrices[d] = {
        petrolAvg: petrolPrices.length ? petrolPrices.reduce((a, b) => a + b, 0) / petrolPrices.length : null,
        dieselAvg: dieselPrices.length ? dieselPrices.reduce((a, b) => a + b, 0) / dieselPrices.length : null,
      };
    }
  });
  container.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
    <thead><tr style="border-bottom:1px solid var(--border);">
      <th style="text-align:left;padding:6px 8px;">District</th>
      <th style="text-align:right;padding:6px 8px;">Petrol Cap</th>
      <th style="text-align:right;padding:6px 8px;">Petrol Avg</th>
      <th style="text-align:right;padding:6px 8px;">Diesel Cap</th>
      <th style="text-align:right;padding:6px 8px;">Diesel Avg</th>
      <th style="text-align:center;padding:6px 8px;">Status</th>
    </tr></thead><tbody>
    ${districts.map(d => {
      const caps = DISTRICT_PRICE_CAPS[d];
      const avgs = avgPrices[d] || {};
      const petrolOk = avgs.petrolAvg !== null ? avgs.petrolAvg <= caps.petrol : true;
      const dieselOk = avgs.dieselAvg !== null ? avgs.dieselAvg <= caps.diesel : true;
      const status = (!petrolOk || !dieselOk) ? '⚠️ Exceeded' : '✅ Compliant';
      const statusCls = (!petrolOk || !dieselOk) ? 'color:#fca5a5;' : 'color:#76FF03;';
      return `<tr style="border-bottom:1px solid var(--border-dim);">
        <td style="padding:6px 8px;font-weight:600;">${d}</td>
        <td style="text-align:right;padding:6px 8px;">UGX ${caps.petrol.toLocaleString()}</td>
        <td style="text-align:right;padding:6px 8px;${avgs.petrolAvg !== null ? (avgs.petrolAvg > caps.petrol ? 'color:#fca5a5;font-weight:600;' : '') : 'color:var(--text-dim);'}">${avgs.petrolAvg !== null ? 'UGX ' + Math.round(avgs.petrolAvg).toLocaleString() : '—'}</td>
        <td style="text-align:right;padding:6px 8px;">UGX ${caps.diesel.toLocaleString()}</td>
        <td style="text-align:right;padding:6px 8px;${avgs.dieselAvg !== null ? (avgs.dieselAvg > caps.diesel ? 'color:#fca5a5;font-weight:600;' : '') : 'color:var(--text-dim);'}">${avgs.dieselAvg !== null ? 'UGX ' + Math.round(avgs.dieselAvg).toLocaleString() : '—'}</td>
        <td style="text-align:center;padding:6px 8px;${statusCls}font-weight:600;">${status}</td>
      </tr>`;
    }).join('')}
    </tbody></table>`;
}

/* ─── Broadcast enter key ─── */
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'broadcastInput') {
    e.preventDefault();
    submitBroadcast();
  }
});

/* ─── INIT ─── */
document.addEventListener('DOMContentLoaded',()=>{
  initMap();
  initAnalyticsMap();
  populateReportForm();

  // Populate report station in reviews
  const revSel=document.getElementById('reviewStation');
  if(revSel){
    revSel.innerHTML='<option value="">Select a station...</option>';
    getStations().forEach(s=>{revSel.innerHTML+=`<option value="${s.id}">${s.name}</option>`;});
  }
  // Populate operator station select
  const opSel=document.getElementById('opStation');
  if(opSel){
    opSel.innerHTML='<option value="">Select your station</option>';
    getStations().forEach(s=>{opSel.innerHTML+=`<option value="${s.id}">${s.name}</option>`;});
  }

  // Populate trip planner
  const vehSel=document.getElementById('tripVehicle');
  if(vehSel){
    VEHICLES.forEach(v=>{vehSel.innerHTML+=`<option value="${v.id}">${v.name} (~${v.consumption} km/L)</option>`;});
  }
  const locList=document.getElementById('locList');
  if(locList){
    LOCATIONS.forEach(l=>{locList.innerHTML+=`<option value="${l.name}">${l.area}, ${l.district}</option>`;});
  }
  const dests=document.getElementById('commonDests');
  if(dests){
    ['Kampala Post Office','Mukono Town','Jinja Town','Entebbe Airport','Ntinda','Mbarara Town','Gulu Town','Mbale Town','Masaka Town'].forEach(n=>{
      dests.innerHTML+=`<button class="btn-tool btn-tool-outline btn-tool-sm" onclick="document.getElementById('tripTo').value='${n}'">${n}</button>`;
  });
}

/* ─── C2G TICKET ADMIN ─── */
function renderC2GAdmin() {
  const tickets = DB.c2gTickets || [];
  const active = tickets.filter(t=>t.status!=='resolved' && t.status!=='penalty_issued');
  const cnt = document.getElementById('c2gTicketCount');
  if (cnt) cnt.textContent = active.length + ' active';
  const list = document.getElementById('c2gAdminList');
  if (!list) return;
  if (tickets.length===0) {
    list.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-dim);font-size:0.85rem;">No C2G tickets filed.</div>';
    return;
  }
  list.innerHTML = tickets.slice().reverse().map(t => {
    const statusColors = {open:'#fcd34d',investigating:'#93c5fd',dispatched:'#fbbf24',resolved:'#76FF03',penalty_issued:'#fca5a5'};
    const statusIcons = {open:'🟡',investigating:'🔍',dispatched:'🚔',resolved:'✅',penalty_issued:'💰'};
    const statusColor = statusColors[t.status]||'var(--text-dim)';
    const vehicleLabel = {truck:'🚛 Truck',boda:'🛵 Boda Boda',private:'🚗 Private'}[t.vehicleType]||'—';
    return `<div class="kyc-card" style="margin-bottom:8px;">
      <div class="kyc-info" style="flex:1;">
        <div class="name" style="font-size:0.85rem;">Ticket #${t.id} — ${t.stationName} <span style="font-size:0.7rem;color:${statusColor};">${statusIcons[t.status]||''} ${t.status.replace(/_/g,' ').toUpperCase()}</span></div>
        <div class="meta">${vehicleLabel} · ${t.fuel||'petrol'} at UGX ${(t.price||0).toLocaleString()} · ${t.location||t.district||'—'}</div>
        <div class="meta" style="font-size:0.65rem;">Reporter: ${t.phone||t.userId||'—'} · ${new Date(t.createdAt).toLocaleString()}</div>
        ${t.description ? `<div class="docs" style="margin-top:4px;">📝 ${t.description.substring(0,120)}${t.description.length>120?'…':''}</div>` : ''}
        ${t.uploadedFiles?.length ? `<div class="docs">📎 ${t.uploadedFiles.map(f=>f.name).join(', ')}</div>` : ''}
      </div>
      <div class="kyc-actions" style="flex-direction:column;gap:4px;">
        ${t.status==='open' ? `<button class="btn-tool btn-tool-outline btn-tool-sm" onclick="progressTicket(${t.id},'investigating')" style="font-size:0.6rem;">🔍 Investigate</button>` : ''}
        ${t.status==='investigating' ? `<button class="btn-tool btn-tool-outline btn-tool-sm" onclick="progressTicket(${t.id},'dispatched')" style="font-size:0.6rem;">🚔 Dispatch</button>` : ''}
        ${t.status==='dispatched' ? `<button class="btn-tool btn-tool-primary btn-tool-sm" onclick="progressTicket(${t.id},'resolved')" style="font-size:0.6rem;">✅ Resolve</button><button class="btn-tool btn-tool-outline btn-tool-sm" onclick="progressTicket(${t.id},'penalty_issued')" style="font-size:0.6rem;border-color:rgba(239,68,68,0.3);color:#fca5a5;">💰 Issue Penalty</button>` : ''}
        ${t.status==='resolved'||t.status==='penalty_issued' ? `<span style="font-size:0.6rem;color:var(--text-dim);">✔ Closed ${new Date(t.resolvedAt||t.updatedAt).toLocaleDateString()}</span>` : ''}
        ${t.notifiedReporter ? `<span style="font-size:0.6rem;color:var(--neon);">📨 Reporter notified</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

function progressTicket(id, newStatus) {
  const ticket = (DB.c2gTickets||[]).find(t=>t.id===id);
  if (!ticket) return;
  ticket.status = newStatus;
  ticket.updatedAt = new Date().toISOString();
  if (newStatus==='resolved' || newStatus==='penalty_issued') {
    ticket.resolvedAt = new Date().toISOString();
    ticket.notifiedReporter = true;
    const msg = `📨 C2G Ticket #${id}: ${ticket.stationName} — Status updated to "${newStatus.replace(/_/g,' ').toUpperCase()}". An automated SMS notification has been dispatched to the reporting citizen (${ticket.phone||ticket.userId||'on file'}).`;
    if (!DB.notifications) DB.notifications = [];
    DB.notifications.push({ id:Date.now(), type:'c2g_resolved', message:msg, read:false, date:new Date().toISOString() });
    showToast('📨 Resolution dispatched — citizen notified via SMS/WhatsApp.');
  }
  saveDB();
  renderC2GAdmin();
  renderSLATimers();
}

/* ─── PRICE CAP EDITOR ─── */
function renderCapEditor() {
  const container = document.getElementById('adminCapEditor');
  if (!container) return;
  const districts = Object.keys(DISTRICT_PRICE_CAPS);
  container.innerHTML = `<table class="fraud-table">
    <thead><tr>
      <th>District</th>
      <th>Region</th>
      <th>Petrol Cap (UGX)</th>
      <th>Diesel Cap (UGX)</th>
      <th>Last Updated</th>
    </tr></thead>
    <tbody>${districts.map(d => {
      const region = STATIONS_DATA.find(s=>s.district===d)?.region||'—';
      const caps = DISTRICT_PRICE_CAPS[d];
      return `<tr>
        <td style="font-weight:600;">${d}</td>
        <td style="font-size:0.75rem;color:var(--text-dim);">${region}</td>
        <td><input type="number" class="cap-input" data-district="${d}" data-fuel="petrol" value="${caps.petrol}" style="width:100px;padding:4px 8px;border:1px solid var(--green-border);border-radius:4px;background:var(--green-dark);color:var(--white);font-family:var(--font-mono);"></td>
        <td><input type="number" class="cap-input" data-district="${d}" data-fuel="diesel" value="${caps.diesel}" style="width:100px;padding:4px 8px;border:1px solid var(--green-border);border-radius:4px;background:var(--green-dark);color:var(--white);font-family:var(--font-mono);"></td>
        <td style="font-size:0.65rem;color:var(--text-dim);">${new Date().toLocaleDateString()}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

document.addEventListener('click', e => {
  if (e.target.id==='saveAllCapsBtn') {
    document.querySelectorAll('.cap-input').forEach(inp => {
      const district = inp.dataset.district;
      const fuel = inp.dataset.fuel;
      const val = parseInt(inp.value);
      if (district && fuel && val > 0 && DISTRICT_PRICE_CAPS[district]) {
        DISTRICT_PRICE_CAPS[district][fuel] = val;
      }
    });
    saveDB();
    showToast('💾 Price caps updated across all system layers.');
    renderPriceCapMatrix();
  }
});

/* ─── HIERARCHY — ADD DISTRICT/AREA/STATION ─── */
function addSubNode(parentId, type) {
  const name = prompt('Enter name for new '+type+':');
  if (!name || !name.trim()) return;
  const tree = DB.admin.hierarchy;
  if (!tree) return;
  const parent = findHierarchyNode(tree, parentId);
  if (!parent) return;
  if (!parent.children) parent.children = [];
  const newNode = { id:Date.now(), name:name.trim(), type, children:[] };
  if (type==='area') newNode.stations = [];
  parent.children.push(newNode);
  saveDB();
  renderHierarchyTree();
  showToast('✅ '+type.charAt(0).toUpperCase()+type.slice(1)+' "'+name.trim()+'" added.');
}
function findHierarchyNode(nodes, id) {
  for (const n of nodes) {
    if (n.id===id) return n;
    if (n.children) {
      const found = findHierarchyNode(Array.isArray(n.children)?n.children:n.children, id);
      if (found) return found;
    }
  }
  return null;
}
function deleteHierarchyNode(id) {
  if (!confirm('Delete this node and all its children?')) return;
  const tree = DB.admin.hierarchy;
  const remove = (nodes, targetId) => {
    for (let i=nodes.length-1; i>=0; i--) {
      if (nodes[i].id===targetId) { nodes.splice(i,1); return true; }
      if (nodes[i].children) { if (remove(Array.isArray(nodes[i].children)?nodes[i].children:nodes[i].children, targetId)) return true; }
    }
    return false;
  };
  if (remove(tree, id)) { saveDB(); renderHierarchyTree(); showToast('🗑️ Deleted.'); }
}

/* ─── CSV EXPORT ─── */
function exportCSV(data, filename, columns) {
  if (!data || data.length===0) return showToast('No data to export.');
  const header = columns.map(c=>c.label).join(',');
  const rows = data.map(row => columns.map(c => {
    let val = c.get ? c.get(row) : row[c.key];
    if (typeof val==='string' && (val.includes(',')||val.includes('"'))) val='"'+val.replace(/"/g,'""')+'"';
    return val;
  }).join(','));
  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename+'_'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 '+filename+' exported.');
}

// Add CSV export buttons in admin panes
document.addEventListener('click', e => {
  if (e.target.id==='exportFraudBtn') {
    const queue = (DB.admin.fraudQueue||[]).filter(f=>f.status==='pending');
    exportCSV(queue, 'fraud_queue', [
      {label:'Timestamp', get:r=>new Date(r.timestamp).toLocaleString()},
      {label:'Station', key:'stationName'},
      {label:'User ID', key:'userId'},
      {label:'Reported Price', get:r=>'UGX '+r.reportedPrice},
      {label:'Current Price', get:r=>'UGX '+r.currentPrice},
      {label:'Deviation %', get:r=>r.deviationPct.toFixed(1)+'%'},
      {label:'Confidence', key:'confidence'},
    ]);
  }
  if (e.target.id==='exportAuditBtn') {
    const log = DB.admin.auditLog || [];
    exportCSV(log, 'audit_trail', [
      {label:'Timestamp', get:r=>new Date(r.timestamp).toLocaleString()},
      {label:'Station', key:'stationName'},
      {label:'Modified By', key:'modifiedBy'},
      {label:'Previous Price', get:r=>r.previousPrice?'UGX '+r.previousPrice:'—'},
      {label:'New Price', get:r=>r.newPrice?'UGX '+r.newPrice:'—'},
      {label:'Channel', key:'channel'},
      {label:'Action', key:'action'},
    ]);
  }
  if (e.target.id==='exportKPIBtn') {
    const data = [{
      totalReports:(DB.reports||[]).length,
      verified:(DB.reports||[]).filter(r=>r.status==='verified').length,
      rejected:(DB.reports||[]).filter(r=>r.status==='rejected').length,
      activeFlags:(DB.admin.fraudQueue||[]).filter(f=>f.status==='pending').length,
      activeAPITokens:(DB.admin.apiTokens||[]).filter(t=>t.status==='active').length,
      activeC2GTickets:(DB.c2gTickets||[]).filter(t=>t.status!=='resolved'&&t.status!=='penalty_issued').length,
    }];
    exportCSV(data, 'kpi_snapshot', [
      {label:'Total Reports', key:'totalReports'},
      {label:'Verified', key:'verified'},
      {label:'Rejected', key:'rejected'},
      {label:'Active Flags', key:'activeFlags'},
      {label:'Active API Tokens', key:'activeAPITokens'},
      {label:'Active C2G Tickets', key:'activeC2GTickets'},
    ]);
  }
});

// Update the SLA section header in dashboard to show the ticket ID prefixed
  // Seed new community data if needed
  seedNewData();

  renderRegionCards();
  updateHeroCount();
  renderStationList();
  renderActivity();
  renderReviews();
  renderNotifications();
  updateBroadcastTicker();
  updateHubCounts();
  renderPriceCapMatrix();

  // Simulate verification of initial reports
  setTimeout(runFraudDetection,3000);
  // Simulate price changes
  setTimeout(checkPriceChanges,8000);
  // Simulate community broadcasts
  setTimeout(() => { simulateBroadcasts(); }, 15000);
  setInterval(() => {
    if (Math.random() > 0.4 && (DB.broadcasts||[]).length < 60) {
      simulateBroadcasts();
    }
  }, 60000);
});

// SW
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('service-worker.js').catch(()=>{});
  });
}

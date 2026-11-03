const CACHE='mafutawatch-shell-v8';
const ASSETS=['/','/index.html','/css/style.css','/js/api.js','/js/ui.js','/js/discovery.js','/js/access.js','/js/app.js','/manifest.json','/icon.svg','/vendor/leaflet/leaflet.css','/vendor/leaflet/leaflet.js'];
const allowed=new Set(ASSETS);
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('mafutawatch-shell-')&&key!==CACHE||key==='MafutaWatch Uganda-v1').map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  // No API, private evidence, map tile or arbitrary third-party caching.
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(!allowed.has(url.pathname)&&request.mode!=='navigate')return;
  event.respondWith(fetch(request).then(response=>{
    if(response.ok&&allowed.has(url.pathname)){
      const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(url.pathname,copy)));
    }
    return response;
  }).catch(async()=>await caches.match(request.mode==='navigate'?'/':url.pathname)||new Response('Offline. Reconnect to load this resource.',{status:503})));
});

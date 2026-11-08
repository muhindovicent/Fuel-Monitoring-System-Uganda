// Load the existing local Leaflet distribution only after a map is requested.
let loading;
export function loadLeaflet(){
  if(loading)return loading;
  const assets=[];
  const load=(tag,url)=>new Promise((resolve,reject)=>{
    const element=document.createElement(tag);assets.push(element);
    if(tag==='link'){element.rel='stylesheet';element.href=url;}else{element.src=url;element.async=true;}
    element.onload=resolve;element.onerror=()=>reject(new Error('Map library unavailable. Search and station details remain available in List View.'));
    document.head.append(element);
  });
  loading=Promise.all([
    load('link','/vendor/leaflet/leaflet.css'),
    window.L?Promise.resolve():load('script','/vendor/leaflet/leaflet.js')
  ]).then(()=>{
    if(!window.L)throw new Error('Map library unavailable. Return to List View to search stations.');
    return window.L;
  }).catch(error=>{assets.forEach(element=>element.remove());loading=null;throw error;});
  return loading;
}

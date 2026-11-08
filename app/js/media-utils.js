export const assetPattern=/^\/api\/v1\/media-assets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
export function secureMediaUrl(value){
  if(assetPattern.test(value))return true;
  if(/^\/assets\/[a-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(value))return true;
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}
}
// Only supported providers become frames; direct files use the native player.
export function videoSource(value){
  if(assetPattern.test(value))return {kind:'video',url:value};
  if(!secureMediaUrl(value))return null;
  const url=new URL(value),host=url.hostname.toLowerCase();
  if(['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com'].includes(host)){
    const id=host==='youtu.be'?url.pathname.slice(1):url.searchParams.get('v')||url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)\/?$/)?.[1];
    return /^[\w-]{11}$/.test(id||'')?{kind:'embed',url:`https://www.youtube-nocookie.com/embed/${id}`}:null;
  }
  if(['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(host)){
    const id=url.pathname.match(/^\/(?:video\/)?(\d+)\/?$/)?.[1];
    return id?{kind:'embed',url:`https://player.vimeo.com/video/${id}`}:null;
  }
  return /\.(mp4|webm)$/i.test(url.pathname)?{kind:'video',url:url.href}:null;
}

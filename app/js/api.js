let csrfToken=null;
export function setCsrf(value){csrfToken=value;}
export async function api(path,{method='GET',body,headers={},raw}={}) {
  let response;
  try {
    response=await fetch(`/api/v1${path}`,{method,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000),
      headers:{'x-requested-with':'MafutaWatch',...(csrfToken?{'x-csrf-token':csrfToken}:{}),...(body!==undefined?{'content-type':'application/json'}:{}),...headers},
      body:raw??(body!==undefined?JSON.stringify(body):undefined)});
  } catch(error){throw new Error('Connection unavailable. Your submission has not been confirmed. Keep your entries and retry when connected.',{cause:error});}
  if(response.status===204)return null;
  const data=await response.json().catch(()=>({error:'Unexpected service response. Please retry.'}));
  if(!response.ok){const error=new Error(data.error||'Request failed.');error.status=response.status;throw error;}
  return data;
}
export function uploadMedia(file,{onProgress,signal}={}){
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();xhr.open('POST','/api/v1/admin/media-assets');xhr.withCredentials=true;xhr.timeout=120000;
    xhr.setRequestHeader('content-type',file.type);xhr.setRequestHeader('x-requested-with','MafutaWatch');if(csrfToken)xhr.setRequestHeader('x-csrf-token',csrfToken);
    const abort=()=>xhr.abort(),finish=()=>signal?.removeEventListener('abort',abort);
    xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress?.(Math.round(event.loaded/event.total*100));};
    xhr.onload=()=>{finish();let data;try{data=JSON.parse(xhr.responseText);}catch{data={error:'Unexpected upload response. Please retry.'};}if(xhr.status>=200&&xhr.status<300)resolve(data);else{const error=new Error(data.error||'Upload failed.');error.status=xhr.status;reject(error);}};
    xhr.onerror=xhr.ontimeout=()=>{finish();reject(new Error('Upload was not confirmed. Check your connection and retry; metadata has not been published.'));};
    xhr.onabort=()=>{finish();reject(new Error('Upload cancelled. Content was not published.'));};
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){finish();reject(new Error('Upload cancelled.'));return;}xhr.send(file);
  });
}
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money=value=>value==null?'Not available':`UGX ${Number(value).toLocaleString('en-UG')}`;
export const date=value=>value?new Date(value).toLocaleString('en-UG',{timeZone:'Africa/Kampala',dateStyle:'medium',timeStyle:'short'}):'Not recorded';

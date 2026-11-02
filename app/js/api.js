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
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money=value=>value==null?'Not available':`UGX ${Number(value).toLocaleString('en-UG')}`;
export const date=value=>value?new Date(value).toLocaleString('en-UG',{timeZone:'Africa/Kampala',dateStyle:'medium',timeStyle:'short'}):'Not recorded';

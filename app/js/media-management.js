import {api,uploadMedia,escapeHtml as esc,date} from './api.js';
import {secureMediaUrl,videoSource} from './media-utils.js';
import {videoPlayer} from './media-content.js';

const categories={media:['fuel-stations','transport','energy-infrastructure','public-events'],videos:['platform-howto','fuel-saving','road-safety','boda-experiences','price-verification','energy-events'],news:['fuel-prices','petroleum-markets','energy-policy','transport','infrastructure']};
const licenses=['All Rights Reserved','CC BY 4.0','CC BY-SA 4.0','CC BY-ND 4.0','CC0 1.0'];
const names={media:'Images',videos:'Videos',news:'News articles'};
const input=(label,name,value='',{type='text',required=true,max=200,min=1}={})=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''} ${['text','url'].includes(type)?`minlength="${min}" maxlength="${max}"`:''}></label>`;
const text=(label,name,value='',max=1000,min=10,required=true)=>`<label>${label}<textarea name="${name}" aria-label="${esc(label)}" rows="4" maxlength="${max}" minlength="${min}" ${required?'required':''}>${esc(value)}</textarea></label>`;
const select=(label,name,values,current)=>`<label>${label}<select name="${name}" aria-label="${esc(label)}">${values.map(value=>`<option value="${esc(value)}"${value===current?' selected':''}>${esc(value.replaceAll('-',' '))}</option>`).join('')}</select></label>`;
const file=(label,name,video=false)=>`<div class="media-file-field"><label>${label}<input type="file" name="${name}" accept="${video?'video/mp4,video/webm':'image/jpeg,image/png,image/webp'}"></label><small>${video?'MP4 / WebM · maximum 25 MiB':'JPEG / PNG / WebP · maximum 10 MiB'}</small></div>`;
const url=(label,name,value='')=>input(label,name,value,{required:false,max:2000});
function rows(data){return Object.keys(names).map(kind=>`<section class="card" data-media-kind="${kind}"><h3>${names[kind]}</h3>${data[kind].map(row=>`<article class="media-management-row" data-content-id="${row.id}"><div><strong>${esc(row.title)}</strong><p class="small">${esc(row.category)} · <span class="badge ${row.status}">${esc(row.status)}</span>${kind==='news'?` · ${date(row.published_at||row.created_at)}`:''}</p></div><div class="actions"><button class="small" data-media-action="edit" data-kind="${kind}" data-id="${row.id}">Edit</button><button class="small" data-media-action="visibility" data-kind="${kind}" data-id="${row.id}">${row.status==='published'?'Unpublish':'Publish'}</button><button class="small danger" data-media-action="delete" data-kind="${kind}" data-id="${row.id}">Delete</button></div></article>`).join('')||'<p class="empty">No content yet.</p>'}</section>`).join('');}
export function mediaManagementMarkup(data){return `<section id="mediaManagement"><div class="card"><h2>Media Management</h2><p>Upload from your device, save drafts, and publish to the public gallery, video centre and newsroom. Files are stored persistently in PostgreSQL / Neon.</p><div class="actions"><button class="primary" data-media-action="create" data-kind="media">Upload Image</button><button class="primary" data-media-action="create" data-kind="videos">Add Video</button><button class="primary" data-media-action="create" data-kind="news">Publish News</button></div><p class="media-management-status" role="status"></p><p class="form-error media-management-error" role="alert"></p></div><div id="mediaManagementLists">${rows(data)}</div><dialog id="mediaEditor" aria-labelledby="mediaEditorTitle"></dialog></section>`;}

export function mountMediaManagement(root,initial,{onSaved}={}){
  let data=initial,kind,current,busy=false,disposed=false,previewUrls=[],uploads=[],controller;
  const dialog=root.querySelector('#mediaEditor'),status=root.querySelector('.media-management-status'),error=root.querySelector('.media-management-error');
  const revoke=()=>{previewUrls.forEach(value=>URL.revokeObjectURL(value));previewUrls=[];};
  async function cleanup(){const pending=uploads;uploads=[];for(const asset of pending)await api(`/admin/media-assets/${asset.id}`,{method:'DELETE'}).catch(()=>{});}
  function close(){if(busy)return;dialog.querySelectorAll('video').forEach(player=>player.pause());dialog.close();revoke();cleanup();}
  function openEditor(next,row){
    kind=next;current=row||null;uploads=[];revoke();const r=row||{};
    const title=row?`Edit ${names[kind].toLowerCase()}`:{media:'Upload Image',videos:'Add Video',news:'Publish News'}[kind];
    const imageFields=file(kind==='news'?'Featured image file':'Image file','imageFile')+url('Image URL (or select a file above)','imageUrl',r.image_url||'');
    let fields=input(kind==='news'?'Headline':'Title','title',r.title||'',{max:200,min:kind==='media'?2:5});
    if(kind==='media')fields+=imageFields+text('Description','description',r.description||'',1000,5)+select('Category','category',categories[kind],r.category)+input('Photographer','photographer',r.photographer||'',{min:2,max:100})+input('Source / owner','source',r.source||'',{min:2,max:200})+url('Source URL (optional)','sourceUrl',r.source_url||'')+select('License','license',licenses,r.license||licenses[0])+text('Caption','caption',r.caption||'',300,0,false)+input('Alternative text','altText',r.alt_text||'',{required:false,max:200});
    if(kind==='videos')fields+=file('Video file','videoFile',true)+url('Video link (YouTube, Vimeo, HTTPS MP4/WebM)','videoUrl',r.video_url||'')+file('Thumbnail file (optional)','thumbnailFile')+url('Thumbnail URL (optional)','thumbnailUrl',r.thumbnail_url||'')+text('Description','description',r.description||'')+select('Category','category',categories[kind],r.category)+input('Duration (minutes:seconds or hours:minutes:seconds)','duration',r.duration||'',{max:20})+input('Source / owner','source',r.source||'',{min:2,max:200})+url('Source URL (optional)','sourceUrl',r.source_url||'')+select('License','license',licenses,r.license||licenses[0]);
    if(kind==='news'){
      const published=new Date(r.published_at||Date.now()),localDate=new Date(published.getTime()-published.getTimezoneOffset()*60000).toISOString().slice(0,16);
      fields+=text('Article content','body',r.body||'',10000)+text('Summary (optional)','summary',r.summary||'',500,10,false)+input('Source name','sourceName',r.source_name||'',{min:2,max:100})+input('Source URL','sourceUrl',r.source_url||'',{type:'url',max:2000})+input('Publication date and time (your local time)','publicationDate',localDate,{type:'datetime-local'})+select('Category','category',categories[kind],r.category)+imageFields;
    }
    dialog.innerHTML=`<div class="dialog-top"><h2 id="mediaEditorTitle">${title}</h2><button type="button" data-media-action="close" aria-label="Close media editor">✕</button></div><form id="mediaEditorForm"><div class="media-editor-fields">${fields}${select('Publication status','status',['draft','published','archived'],r.status||'draft')}</div><button type="button" data-media-action="preview">Preview selected content</button><div class="media-preview" aria-live="polite"></div><label class="upload-progress" hidden>Upload progress<progress max="100" value="0"></progress><span role="status"></span></label><p class="form-error" role="alert"></p><div class="actions"><button class="primary" type="submit" name="intent" value="save">${row?'Save changes':'Save metadata'}</button><button type="submit" name="intent" value="publish">Publish</button><button type="submit" name="intent" value="draft">Save draft</button><button type="button" data-media-action="close">Cancel</button></div></form>`;
    dialog.showModal();preview();
  }
  function validate(file,video=false){
    if(!file.size)throw new Error('Select a non-empty file.');
    if(!(video?['video/mp4','video/webm']:['image/jpeg','image/png','image/webp']).includes(file.type))throw new Error(video?'Choose an MP4 or WebM video.':'Choose a JPEG, PNG or WebP image.');
    if(file.size>(video?data.storage.videoLimit:data.storage.imageLimit))throw new Error(`File exceeds the ${video?25:10} MiB upload limit.`);
  }
  function preview(){
    const form=dialog.querySelector('form');if(!form)return;revoke();const area=dialog.querySelector('.media-preview');
    const local=(name,video=false)=>{const selected=form.elements[name]?.files?.[0];if(!selected)return null;validate(selected,video);const value=URL.createObjectURL(selected);previewUrls.push(value);return value;};
    try{
      const title=form.elements.title.value;
      if(kind==='videos'){
        const localVideo=local('videoFile',true),thumbnail=local('thumbnailFile')||form.elements.thumbnailUrl.value;
        area.innerHTML=(localVideo?`<video class="media-player" controls playsinline src="${esc(localVideo)}"></video>`:videoPlayer(form.elements.videoUrl.value,title))+(thumbnail&&(thumbnail.startsWith('blob:')||secureMediaUrl(thumbnail))?`<img src="${esc(thumbnail)}" alt="Thumbnail preview">`:'');
      }else{
        const image=local('imageFile')||form.elements.imageUrl.value;
        area.innerHTML=`<h3>${esc(title)}</h3>${image&&(image.startsWith('blob:')||secureMediaUrl(image))?`<img src="${esc(image)}" alt="Selected image preview">`:''}${kind==='news'?`<div class="article-body">${esc(form.elements.body.value)}</div>`:`<p>${esc(form.elements.caption.value)}</p>`}`;
      }
      dialog.querySelector('.form-error').textContent='';
    }catch(error){area.replaceChildren();dialog.querySelector('.form-error').textContent=error.message;}
  }
  async function refresh(message){data=await api('/admin/media');if(disposed)return;root.querySelector('#mediaManagementLists').innerHTML=rows(data);status.textContent=message;onSaved?.();}
  async function save(event){
    if(event.target.id!=='mediaEditorForm')return;event.preventDefault();event.stopPropagation();if(busy)return;
    const form=event.target,fields=Object.fromEntries(new FormData(form)),formError=form.querySelector('.form-error'),progress=form.querySelector('.upload-progress');
    const body={};for(const [name,value]of Object.entries(fields))if(!(value instanceof File))body[name]=value;
    delete body.intent;body.status=event.submitter?.value==='publish'?'published':event.submitter?.value==='draft'?'draft':body.status;
    if(kind==='news'){body.summary=body.summary||body.body.slice(0,240);body.publicationDate=new Date(body.publicationDate).toISOString();}
    for(const field of ['sourceUrl','thumbnailUrl','imageUrl','caption','altText'])if(field in body&&!body[field])body[field]=null;
    busy=true;controller=new AbortController();formError.textContent='';form.querySelectorAll('button,input,select,textarea').forEach(element=>{element.disabled=true;});
    const upload=async(name,target,video=false)=>{
      const selected=form.elements[name]?.files?.[0];if(!selected)return;validate(selected,video);
      const existing=uploads.find(asset=>asset.file===selected);
      if(existing){body[target]=existing.url;return;}
      progress.hidden=false;progress.querySelector('progress').value=0;progress.querySelector('span').textContent=`Uploading ${selected.name}…`;
      const asset=await uploadMedia(selected,{signal:controller.signal,onProgress:percent=>{progress.querySelector('progress').value=percent;progress.querySelector('span').textContent=`${selected.name}: ${percent}% transferred${percent===100?' · confirming persistent storage…':''}`;}});
      uploads.push({...asset,file:selected});body[target]=asset.url;progress.querySelector('span').textContent=`${selected.name} stored. Saving metadata…`;
    };
    try{
      await upload('imageFile','imageUrl');await upload('videoFile','videoUrl',true);await upload('thumbnailFile','thumbnailUrl');
      if(kind==='media'&&!body.imageUrl)throw new Error('Select an image file or provide a secure image URL.');
      if(kind==='videos'&&!videoSource(body.videoUrl||''))throw new Error('Select a video file or provide a supported video link.');
      await api(`/${kind}${current?`/${current.id}`:''}`,{method:current?'PATCH':'POST',body});
      uploads=[];busy=false;close();
      const scheduled=kind==='news'&&body.status==='published'&&new Date(body.publicationDate)>new Date();
      const message=scheduled?'News saved and scheduled for its publication date.':body.status==='published'?'Content published successfully. Public sections are updated.':'Content saved as '+body.status+'.';
      try{await refresh(message);}catch(error){if(!disposed){status.textContent=message;root.querySelector('.media-management-error').textContent=`Content was saved, but the management list could not refresh: ${error.message}`;onSaved?.();}}
    }catch(error){if(!disposed)formError.textContent=error.message;}
    finally{busy=false;if(form.isConnected)form.querySelectorAll('button,input,select,textarea').forEach(element=>{element.disabled=false;});}
  }
  async function click(event){
    const button=event.target.closest('[data-media-action]');if(!button)return;event.preventDefault();event.stopPropagation();if(busy)return;
    error.textContent='';const action=button.dataset.mediaAction,selectedKind=button.dataset.kind,row=data[selectedKind]?.find(item=>item.id===button.dataset.id);
    try{
      if(action==='create')openEditor(selectedKind);
      if(action==='edit')openEditor(selectedKind,row);
      if(action==='close')close();
      if(action==='preview')preview();
      if(action==='visibility'){button.disabled=true;await api(`/${selectedKind}/${row.id}`,{method:'PATCH',body:{status:row.status==='published'?'draft':'published'}});await refresh(row.status==='published'?'Content unpublished.':'Content published successfully.');}
      if(action==='delete'&&confirm(`Delete “${row.title}”? This removes it from public pages.`)){button.disabled=true;await api(`/${selectedKind}/${row.id}`,{method:'DELETE'});await refresh('Content deleted successfully.');}
    }catch(failure){error.textContent=failure.message;}finally{button.disabled=false;}
  }
  function change(event){if(event.target.closest('#mediaEditorForm')&&(event.target.type==='file'||['imageUrl','thumbnailUrl'].includes(event.target.name)))preview();}
  function cancel(event){event.preventDefault();close();}
  function previewFailure(event){if(event.target.closest('.media-preview'))dialog.querySelector('.form-error').textContent='This file or link could not be previewed. Check the URL or choose a browser-compatible image or MP4/WebM video.';}
  root.addEventListener('click',click);root.addEventListener('submit',save);root.addEventListener('change',change);root.addEventListener('error',previewFailure,true);dialog.addEventListener('cancel',cancel);
  return {destroy(){disposed=true;controller?.abort();busy=false;close();root.removeEventListener('click',click);root.removeEventListener('submit',save);root.removeEventListener('change',change);root.removeEventListener('error',previewFailure,true);dialog.removeEventListener('cancel',cancel);}};
}

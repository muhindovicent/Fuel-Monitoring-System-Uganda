import {icon} from './ui.js';

// Show/hide controls for authentication password fields. The typed value stays in the
// original input; only its visibility changes. Nothing is logged, copied or stored.
function fieldName(input){
  const label=input.closest('label');
  if(!label)return '';
  const copy=label.cloneNode(true);
  copy.querySelectorAll('input,button').forEach(node=>node.remove());
  return copy.textContent.replace(/\s+/g,' ').trim();
}
function sync(button,input){
  const shown=input.type==='text';
  const label=fieldName(input);
  const name=/password/i.test(label)?(label.toLowerCase()==='password'?'password':label):label?`password for ${label}`:'password';
  const text=`${shown?'Hide':'Show'} ${name}`;
  button.innerHTML=icon(shown?'eye-off':'eye');
  button.setAttribute('aria-label',text);
  button.setAttribute('title',text);
  button.setAttribute('aria-pressed',String(shown));
}
export function mountPasswordToggles(root=document){
  if(!root?.querySelectorAll)return;
  root.querySelectorAll('input[type="password"]').forEach(input=>{
    if(input.dataset.passwordToggle==='1')return;
    input.dataset.passwordToggle='1';
    input.spellcheck=false;
    input.setAttribute('autocapitalize','none');
    const host=input.closest('label')||input;
    const wrap=document.createElement('div');
    wrap.className='password-field';
    host.parentNode.insertBefore(wrap,host);
    wrap.appendChild(host);
    const button=document.createElement('button');
    button.type='button';
    button.className='password-toggle';
    wrap.appendChild(button);
    sync(button,input);
    button.addEventListener('click',()=>{
      input.type=input.type==='password'?'text':'password';
      sync(button,input);
    });
  });
}
export function resetPasswordVisibility(root=document){
  if(!root?.querySelectorAll)return;
  root.querySelectorAll('input[data-password-toggle="1"]').forEach(input=>{
    input.type='password';
    const button=input.closest('.password-field')?.querySelector('.password-toggle');
    if(button)sync(button,input);
  });
}

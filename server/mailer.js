import nodemailer from 'nodemailer';

// Transactional email delivery for account workflows. Credentials come only from
// configuration; nothing is hardcoded and messages never include stored secrets.
export const emailDisabledMessage='Email delivery is not configured for this deployment, so changing your email address is disabled. Contact the operator of this deployment to update your address.';

export function createMailer(config={}){
  const provider=config.EMAIL_PROVIDER||'';
  const from=config.EMAIL_FROM||'';
  const enabled=Boolean(provider&&from&&(provider==='smtp'?config.EMAIL_SMTP_HOST:config.EMAIL_HTTP_URL));
  let transport;
  async function send({to,subject,text}){
    if(!enabled)throw new Error(emailDisabledMessage);
    if(!to||!subject||!text)throw new Error('Incomplete email message.');
    if(provider==='smtp'){
      transport??=nodemailer.createTransport({
        host:config.EMAIL_SMTP_HOST,
        port:config.EMAIL_SMTP_PORT||587,
        secure:config.EMAIL_SMTP_SECURE==='true',
        ...(config.EMAIL_SMTP_USER?{auth:{user:config.EMAIL_SMTP_USER,pass:config.EMAIL_SMTP_PASSWORD}}:{})
      });
      await transport.sendMail({from,to,subject,text});
      return;
    }
    const response=await fetch(config.EMAIL_HTTP_URL,{
      method:'POST',
      headers:{'content-type':'application/json',...(config.EMAIL_HTTP_API_KEY?{authorization:`Bearer ${config.EMAIL_HTTP_API_KEY}`}:{})},
      body:JSON.stringify({from,to,subject,text}),
      signal:AbortSignal.timeout(15000)
    });
    if(!response.ok)throw new Error(`Email provider rejected the message (${response.status}).`);
  }
  return {enabled,provider,send};
}

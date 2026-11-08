import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { authenticate, ensure, limit, writeProtection } from './security.js';
import { authRoutes } from './auth.js';
import { apiRoutes } from './api.js';

export function createApp(db,config) {
  const app=express();
  const logger=pino({level:config.LOG_LEVEL,redact:['password','token','cookie','authorization']});
  app.disable('x-powered-by');app.disable('etag');
  app.set('trust proxy',config.TRUST_PROXY_HOPS);
  app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:','blob:','https:'],mediaSrc:["'self'",'blob:','https:'],frameSrc:['https://www.youtube-nocookie.com','https://player.vimeo.com'],connectSrc:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"],baseUri:["'self'"],formAction:["'self'"],upgradeInsecureRequests:config.NODE_ENV==='production'?[]:null}},xFrameOptions:{action:'deny'},strictTransportSecurity:config.NODE_ENV==='production'?{maxAge:31536000,includeSubDomains:true}:false}));
  app.use((req,res,next)=>{
    req.requestId=randomUUID();res.set('X-Request-Id',req.requestId);
    const start=performance.now();
    res.on('finish',()=>logger.info({requestId:req.requestId,method:req.method,path:req.path,status:res.statusCode,ms:Math.round(performance.now()-start)},'request'));
    next();
  });
  app.get('/health/live',(_req,res)=>res.json({status:'ok'}));
  app.get('/health/ready',async(_req,res)=>{
    try { await db.query('SELECT name FROM schema_migrations LIMIT 1');res.json({status:'ready'}); }
    catch(_error) {res.status(503).json({status:'unavailable'});}
  });
  app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  app.use(cookieParser());
  app.use('/api',async(req,res,next)=>{
    await limit(db,`http:${req.ip}`,config.NODE_ENV==='test'?1000:300,60);
    await authenticate(db,req);
    if(req.apiToken) ensure(req.method==='PUT'&&/^\/v1\/stations\/\d+\/prices$/.test(req.path),403,'Credential is limited to station price updates.');
    next();
  });
  app.use(writeProtection(config));
  app.use((req,res,next)=>{
    if(/^\/api\/v1\/(tickets|applications)\/[^/]+\/attachments$/.test(req.path)) return next();
    return express.json({limit:'64kb',strict:true})(req,res,next);
  });
  app.use('/api/v1/auth',authRoutes(db,config));
  app.use('/api/v1',apiRoutes(db,config));
  app.use('/api',(_req,res)=>res.status(404).json({error:'API endpoint not found.'}));
  const appDirectory=fileURLToPath(new URL('../app/',import.meta.url));
  app.get('/app',(_req,res)=>res.redirect('/'));
  app.get('/app/',(_req,res)=>res.redirect('/'));
  app.use('/vendor/leaflet',express.static(fileURLToPath(new URL('../node_modules/leaflet/dist/',import.meta.url)),{maxAge:'7d',dotfiles:'deny'}));
  app.use(express.static(appDirectory,{maxAge:0,dotfiles:'deny',setHeaders(res,path){
    if(path.endsWith('service-worker.js'))res.set('Cache-Control','no-cache');
  }}));
  app.use((_req,res)=>res.status(404).send('Page not found.'));
  app.use((error,req,res,_next)=>{
    let status=error.status??500,message=error.message;
    if(error instanceof ZodError){status=400;message=error.issues.map(i=>`${i.path.join('.')||'input'}: ${i.message}`).join('; ');}
    if(error.code==='23505'){status=409;message='A matching record already exists.';}
    if(['23503','23514','22P02','22007','22008'].includes(error.code)){status=400;message='A referenced record or value is invalid.';}
    if(error.type==='entity.parse.failed'){status=400;message='Invalid JSON body.';}
    if(error.type==='entity.too.large'){status=413;message='Request exceeds the allowed size.';}
    if(status===429)res.set('Retry-After','60');
    if(status>=500&&error.expose!==true){logger.error({requestId:req.requestId,code:error.code,err:error},'request failed');message='The service is temporarily unavailable. Please retry.';}
    res.status(status).json({error:message,requestId:req.requestId});
  });
  return app;
}

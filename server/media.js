import express,{Router} from 'express';
import {randomUUID} from 'node:crypto';
import {fileTypeFromBuffer} from 'file-type';
import {z} from 'zod';
import {transaction} from './db.js';
import {audit,ensure,roles,limit} from './security.js';
import {assetPattern,secureMediaUrl,videoSource} from '../app/js/media-utils.js';

const admin=roles('admin'),uuid=z.uuid(),imageLimit=10*1024*1024,videoLimit=25*1024*1024;
const licenses=['CC BY 4.0','CC BY-SA 4.0','CC BY-ND 4.0','CC0 1.0','All Rights Reserved'];
const mediaUrl=z.string().max(2000).refine(secureMediaUrl,'Use a saved upload or an HTTPS URL without credentials.');
const sourceUrl=z.url().max(2000).refine(value=>!assetPattern.test(value)&&secureMediaUrl(value),'Use an HTTPS source URL without credentials.');
const status=z.enum(['published','draft','archived']);
const common={title:z.string().trim().min(5).max(200),description:z.string().trim().min(10).max(1000),status:status.optional(),featured:z.boolean().optional(),priority:z.number().int().min(0).max(100).optional()};
const definitions={
  media:{table:'media_gallery',schema:z.object({...common,title:z.string().trim().min(2).max(200),description:z.string().trim().min(5).max(1000),category:z.enum(['fuel-stations','transport','energy-infrastructure','public-events']),imageUrl:mediaUrl,thumbnailUrl:mediaUrl.nullable().optional(),photographer:z.string().trim().min(2).max(100),source:z.string().trim().min(2).max(200),license:z.enum(licenses),sourceUrl:sourceUrl.nullable().optional(),caption:z.string().trim().max(300).nullable().optional(),altText:z.string().trim().min(2).max(200).nullable().optional(),fileSize:z.number().int().min(1).max(imageLimit).nullable().optional(),dimensions:z.string().regex(/^\d+x\d+$/).max(50).nullable().optional()}).strict(),map:{title:'title',description:'description',category:'category',imageUrl:'image_url',thumbnailUrl:'thumbnail_url',photographer:'photographer',source:'source',license:'license',sourceUrl:'source_url',caption:'caption',altText:'alt_text',fileSize:'file_size',dimensions:'dimensions',status:'status',featured:'featured',priority:'priority'}},
  videos:{table:'video_content',schema:z.object({...common,category:z.enum(['platform-howto','fuel-saving','road-safety','boda-experiences','price-verification','energy-events']),videoUrl:mediaUrl.refine(value=>Boolean(videoSource(value)),'Use an uploaded video, HTTPS MP4/WebM, YouTube or Vimeo link.'),thumbnailUrl:mediaUrl.nullable().optional(),duration:z.string().trim().regex(/^(?:\d{1,3}:)?[0-5]?\d:[0-5]\d$/,'Use a duration such as 5:30 or 1:05:30.'),source:z.string().trim().min(2).max(200).nullable().optional(),sourceUrl:sourceUrl.nullable().optional(),license:z.enum(licenses).nullable().optional()}).strict(),map:{title:'title',description:'description',category:'category',videoUrl:'video_url',thumbnailUrl:'thumbnail_url',duration:'duration',source:'source',sourceUrl:'source_url',license:'license',status:'status',featured:'featured',priority:'priority'}},
  news:{table:'news_articles',schema:z.object({title:z.string().trim().min(5).max(200),summary:z.string().trim().min(10).max(500),body:z.string().trim().min(10).max(10000),sourceUrl,sourceName:z.string().trim().min(2).max(100),category:z.enum(['fuel-prices','petroleum-markets','energy-policy','transport','infrastructure']),imageUrl:mediaUrl.nullable().optional(),publicationDate:z.iso.datetime({offset:true}).transform(value=>new Date(value).toISOString()).optional(),status:status.optional(),excerpt:z.string().trim().min(5).max(300).nullable().optional(),tags:z.array(z.string().trim().min(1).max(30)).max(10).nullable().optional().refine(value=>!value||JSON.stringify(value).length<=200,'Tags must fit within 200 characters.'),readingTime:z.number().int().min(1).max(120).nullable().optional(),featured:z.boolean().optional(),priority:z.number().int().min(0).max(100).optional()}).strict(),map:{title:'title',summary:'summary',body:'body',sourceUrl:'source_url',sourceName:'source_name',category:'category',imageUrl:'image_url',publicationDate:'published_at',status:'status',excerpt:'excerpt',tags:'tags',readingTime:'reading_time',featured:'featured',priority:'priority'}}
};
const publicNews="status='published' AND coalesce(published_at::timestamptz,created_at)<=now()";
async function referenced(db,url,published=false){
  const visibility=published?" AND status='published'":'';
  return (await db.query(`SELECT 1 FROM media_gallery WHERE (image_url=$1 OR thumbnail_url=$1)${visibility}
    UNION ALL SELECT 1 FROM video_content WHERE (video_url=$1 OR thumbnail_url=$1)${visibility}
    UNION ALL SELECT 1 FROM news_articles WHERE image_url=$1${published?` AND ${publicNews}`:''} LIMIT 1`,[url])).rowCount>0;
}
async function validateAssets(db,input){
  for(const field of ['imageUrl','thumbnailUrl','videoUrl']){
    const match=assetPattern.exec(input[field]||'');if(!match)continue;
    const asset=(await db.query('SELECT media_type FROM media_assets WHERE id=$1 FOR UPDATE',[match[1]])).rows[0];
    ensure(asset&&asset.media_type.startsWith(field==='videoUrl'?'video/':'image/'),400,`Upload not found or wrong file type for ${field}.`);
  }
}
async function cleanAssets(db,row){
  for(const url of new Set([row?.image_url,row?.thumbnail_url,row?.video_url])){
    const match=assetPattern.exec(url||'');if(match){await db.query('SELECT id FROM media_assets WHERE id=$1 FOR UPDATE',[match[1]]);if(!await referenced(db,url))await db.query('DELETE FROM media_assets WHERE id=$1',[match[1]]);}
  }
}

export function mediaRoutes(db){
  const router=Router();
  router.get('/admin/media',admin,async(_req,res)=>{
    const items={};for(const [name,{table}]of Object.entries(definitions))items[name]=(await db.query(`SELECT * FROM ${table} ORDER BY created_at DESC,id LIMIT 500`)).rows;
    res.json({...items,storage:{provider:'PostgreSQL / Neon',imageLimit,videoLimit}});
  });
  router.post('/admin/media-assets',admin,async(req,_res,next)=>{
    const type=req.get('content-type')?.split(';')[0];
    ensure(['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(type),415,'Upload JPEG, PNG, WebP, MP4 or WebM files.');
    await limit(db,`media-upload:${req.user.id}`,40,3600);
    express.raw({type:()=>true,limit:type.startsWith('image/')?imageLimit:videoLimit})(req,_res,next);
  },async(req,res)=>{
    ensure(Buffer.isBuffer(req.body)&&req.body.length>0,400,'Select a non-empty media file.');
    const type=await fileTypeFromBuffer(req.body).catch(()=>null);
    ensure(type?.mime===req.get('content-type').split(';')[0],415,'File contents do not match the supported file type.');
    const id=randomUUID();await transaction(db,async client=>{
      await client.query('INSERT INTO media_assets(id,created_by,media_type,size,data) VALUES ($1,$2,$3,$4,$5)',[id,req.user.id,type.mime,req.body.length,req.body]);
      await audit(client,req.user.id,'media.asset.upload',id,{type:type.mime,size:req.body.length});
    });res.status(201).json({id,url:`/api/v1/media-assets/${id}`,mediaType:type.mime,size:req.body.length});
  });
  router.delete('/admin/media-assets/:id',admin,async(req,res)=>{
    const id=uuid.parse(req.params.id);await transaction(db,async client=>{
      await client.query('SELECT id FROM media_assets WHERE id=$1 FOR UPDATE',[id]);
      ensure(!await referenced(client,`/api/v1/media-assets/${id}`),409,'This file is used by content. Remove or replace that content first.');
      await client.query('DELETE FROM media_assets WHERE id=$1',[id]);await audit(client,req.user.id,'media.asset.delete',id);
    });res.status(204).end();
  });
  router.get('/media-assets/:id',async(req,res)=>{
    const id=uuid.parse(req.params.id);
    ensure(req.user?.role==='admin'||await referenced(db,`/api/v1/media-assets/${id}`,true),404,'Media file not found.');
    const asset=(await db.query('SELECT media_type,size,data FROM media_assets WHERE id=$1',[id])).rows[0];ensure(asset,404,'Media file not found.');
    res.set({'Content-Type':asset.media_type,'Content-Disposition':'inline','Cache-Control':'private, no-store','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'});
    const bytes=Buffer.from(asset.data),range=req.get('range');
    if(range){
      const parsed=/^bytes=(\d*)-(\d*)$/.exec(range);let start=0,end=asset.size-1;
      if(parsed){if(parsed[1]){start=Number(parsed[1]);if(parsed[2])end=Math.min(Number(parsed[2]),end);}else if(parsed[2])start=Math.max(0,asset.size-Number(parsed[2]));}
      if(!parsed||(!parsed[1]&&!parsed[2])||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=asset.size)return res.status(416).set('Content-Range',`bytes */${asset.size}`).end();
      return res.status(206).set({'Content-Range':`bytes ${start}-${end}/${asset.size}`,'Content-Length':String(end-start+1)}).end(bytes.subarray(start,end+1));
    }
    res.set('Content-Length',String(asset.size)).end(bytes);
  });
  for(const [name,{table,schema,map}]of Object.entries(definitions)){
    router.get(`/${name}`,async(_req,res)=>res.json({items:(await db.query(name==='news'?`SELECT n.*,u.display_name AS author FROM news_articles n JOIN users u ON u.id=n.created_by WHERE n.status='published' AND coalesce(n.published_at::timestamptz,n.created_at)<=now() ORDER BY coalesce(n.published_at::timestamptz,n.created_at) DESC,n.id LIMIT 100`:`SELECT * FROM ${table} WHERE status='published' ORDER BY featured DESC,priority DESC,created_at DESC,id LIMIT 100`)).rows}));
    router.post(`/${name}`,admin,async(req,res)=>{
      const input=schema.parse(req.body),id=randomUUID();
      if(name==='videos')ensure(input.source&&input.license,400,'Video source attribution and license are required.');
      await transaction(db,async client=>{
        await validateAssets(client,input);
        if(name==='news'){input.publicationDate??=new Date().toISOString();}
        input.status??='published';
        const entries=Object.entries(map).filter(([field])=>input[field]!==undefined);
        const values=entries.map(([field])=>field==='tags'&&input[field]!==null?JSON.stringify(input[field]):input[field]);
        const columns=['id',...entries.map(([,column])=>column)],params=[id,...values];
        if(name==='news'){columns.push('created_by');params.push(req.user.id);}
        await client.query(`INSERT INTO ${table}(${columns.join(',')}) VALUES (${params.map((_,i)=>`$${i+1}`).join(',')})`,params);
        await audit(client,req.user.id,`${name}.create`,id,{status:input.status});
      });res.status(201).json({id});
    });
    router.patch(`/${name}/:id`,admin,async(req,res)=>{
      const input=schema.partial().parse(req.body),id=uuid.parse(req.params.id);ensure(Object.keys(input).length,400,'No fields to update.');
      await transaction(db,async client=>{
        const before=(await client.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,[id])).rows[0];ensure(before,404,'Content not found.');
        await validateAssets(client,input);
        if(name==='videos'&&(input.status??before.status)==='published')ensure((input.source===undefined?before.source:input.source)&&(input.license===undefined?before.license:input.license),400,'Add source attribution and a license before publishing this video.');
        const entries=Object.entries(map).filter(([field])=>input[field]!==undefined);
        const params=[id,...entries.map(([field])=>field==='tags'&&input[field]!==null?JSON.stringify(input[field]):input[field])];
        await client.query(`UPDATE ${table} SET ${entries.map(([,column],i)=>`${column}=$${i+2}`).join(',')},updated_at=now() WHERE id=$1`,params);
        await cleanAssets(client,before);await audit(client,req.user.id,`${name}.update`,id,{fields:Object.keys(input),status:input.status});
      });res.json({saved:true});
    });
    router.delete(`/${name}/:id`,admin,async(req,res)=>{
      const id=uuid.parse(req.params.id);await transaction(db,async client=>{
        const removed=(await client.query(`DELETE FROM ${table} WHERE id=$1 RETURNING *`,[id])).rows[0];ensure(removed,404,'Content not found.');
        await cleanAssets(client,removed);await audit(client,req.user.id,`${name}.delete`,id);
      });res.status(204).end();
    });
  }
  for(const [kind,table,column,target]of [['photos','news_article_photos','media_gallery_id','media_gallery'],['videos','news_article_videos','video_content_id','video_content']]){
    router.post(`/news/:id/${kind}`,admin,async(req,res)=>{
      const id=uuid.parse(req.params.id),input=z.object({mediaId:uuid,caption:z.string().trim().min(2).max(300).nullable().optional(),position:z.number().int().min(0).optional()}).strict().parse(req.body);
      await transaction(db,async client=>{
        ensure((await client.query('SELECT 1 FROM news_articles WHERE id=$1',[id])).rowCount,404,'News article not found.');
        ensure((await client.query(`SELECT 1 FROM ${target} WHERE id=$1`,[input.mediaId])).rowCount,404,'Media item not found.');
        await client.query(`INSERT INTO ${table}(id,news_article_id,${column},caption,position) VALUES ($1,$2,$3,$4,$5)`,[randomUUID(),id,input.mediaId,input.caption??null,input.position??0]);
        await audit(client,req.user.id,`news.${kind}.add`,id,{mediaId:input.mediaId});
      });res.status(201).json({saved:true});
    });
  }
  return router;
}

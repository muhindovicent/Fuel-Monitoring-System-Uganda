import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { transaction } from './db.js';
import { audit, ensure, hash, limit, secret, passwordHash, passwordMatches, emailSchema, passwordSchema, userFields, requireUser } from './security.js';

export function authRoutes(db, config) {
  const router = Router();
  const cookieOptions = { httpOnly:true, secure:config.NODE_ENV==='production', sameSite:'strict', path:'/', maxAge:12*3600000 };
  let dummyHash;
  async function createSession(client, userId, req) {
    if (req.cookies.mfw_session) await client.query('DELETE FROM sessions WHERE token_hash=$1',[hash(req.cookies.mfw_session)]);
    const token = secret(), csrf = secret();
    await client.query("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES ($1,$2,$3,now()+interval '12 hours')",[hash(token),userId,csrf]);
    return { token,csrf };
  }
  router.get('/session',(req,res)=>res.json({user:req.user??null,csrfToken:req.session?.csrf_token??null}));
  router.post('/register',async(req,res)=>{
    await limit(db,`register:${req.ip}`,5,3600);
    ensure(!req.user,409,'Sign out before creating another account.');
    const input = z.object({email:emailSchema,password:passwordSchema,displayName:z.string().trim().min(2).max(80),consent:z.literal(true)}).strict().parse(req.body);
    const result = await transaction(db,async client=>{
      ensure(!(await client.query('SELECT 1 FROM users WHERE email=$1',[input.email])).rows[0],409,'That email address is already registered.');
      const id=randomUUID();
      const user=(await client.query(`INSERT INTO users(id,email,password_hash,display_name) VALUES ($1,$2,$3,$4) RETURNING ${userFields}`,[id,input.email,await passwordHash(input.password),input.displayName])).rows[0];
      await audit(client,id,'account.register',id,{privacyConsent:true});
      return {user,...await createSession(client,id,req)};
    });
    res.cookie('mfw_session',result.token,cookieOptions).status(201).json({user:result.user,csrfToken:result.csrf});
  });
  router.post('/login',async(req,res)=>{
    const input=z.object({email:emailSchema,password:z.string().min(1).max(128)}).strict().parse(req.body);
    await limit(db,`login-ip:${req.ip}`,20,900);
    await limit(db,`login-account:${input.email}`,10,900);
    const user=(await db.query('SELECT * FROM users WHERE email=$1',[input.email])).rows[0];
    dummyHash ??= await passwordHash(secret());
    const valid=await passwordMatches(input.password,user?.password_hash??dummyHash);
    ensure(valid&&user&&!user.disabled,401,'Invalid email or password.');
    const session=await transaction(db, async client=>{
      await audit(client,user.id,'account.login',user.id);
      return createSession(client,user.id,req);
    });
    res.cookie('mfw_session',session.token,cookieOptions).json({user:Object.fromEntries(userFields.split(',').map(k=>[k,user[k]])),csrfToken:session.csrf});
  });
  router.post('/logout',requireUser,async(req,res)=>{
    await db.query('DELETE FROM sessions WHERE token_hash=$1',[req.session.token_hash]);
    res.clearCookie('mfw_session',{...cookieOptions,maxAge:undefined}).status(204).end();
  });
  router.post('/password',requireUser,async(req,res)=>{
    await limit(db,`password:${req.user.id}`,5,900);
    const input=z.object({currentPassword:z.string().max(128),newPassword:passwordSchema}).strict().parse(req.body);
    const user=(await db.query('SELECT password_hash FROM users WHERE id=$1',[req.user.id])).rows[0];
    ensure(await passwordMatches(input.currentPassword,user.password_hash),401,'Current password is incorrect.');
    await transaction(db,async client=>{
      await client.query('UPDATE users SET password_hash=$1 WHERE id=$2',[await passwordHash(input.newPassword),req.user.id]);
      await client.query('DELETE FROM sessions WHERE user_id=$1',[req.user.id]);
      await client.query('UPDATE api_tokens SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[req.user.id]);
      await audit(client,req.user.id,'account.password_changed',req.user.id);
    });
    res.clearCookie('mfw_session',{...cookieOptions,maxAge:undefined}).status(204).end();
  });
  return router;
}

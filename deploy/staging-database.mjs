import pg from 'pg';
import {randomBytes,randomUUID} from 'node:crypto';
import {migrate,transaction} from '../server/db.js';
import {passwordHash,passwordMatches,emailSchema,passwordSchema,audit} from '../server/security.js';
import {target,managedMarker,DeploymentError,secureConnection,applicationUrl,managedConnection,identifier,literal} from './hosting-shared.mjs';

const poolFor=value=>{const pool=new pg.Pool(secureConnection(value));pool.on('error',()=>{});return pool;};

export async function provisionApplication(db,email,password){
  // Only the dedicated versioned database is passed here; legacy tables are never renamed or removed.
  await db.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
  await migrate(db);
  await transaction(db,async client=>{
    const role=identifier(target.runtimeRole);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await client.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
    await client.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
    await client.query(`REVOKE ALL ON audit_log,schema_migrations FROM ${role}`);
    await client.query(`GRANT SELECT,INSERT ON audit_log TO ${role}`);
    await client.query(`GRANT SELECT ON schema_migrations TO ${role}`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ${role}`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO ${role}`);
    if((await client.query("SELECT 1 FROM pg_roles WHERE rolname='mafuta_app'")).rowCount){
      await client.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM mafuta_app');
      await client.query('REVOKE ALL ON SCHEMA public FROM mafuta_app');
    }
    const existing=(await client.query('SELECT id,role,password_hash,disabled FROM users WHERE email=$1 FOR UPDATE',[email])).rows[0];
    if(existing){
      if(existing.role!=='admin'||existing.disabled||!await passwordMatches(password,existing.password_hash))throw new DeploymentError('The managed administrator does not match bootstrap configuration. Existing credentials were not overwritten.');
    }else{
      const id=randomUUID();
      await client.query("INSERT INTO users(id,email,display_name,password_hash,role) VALUES ($1,$2,'Platform administrator',$3,'admin')",[id,email,await passwordHash(password)]);
      await audit(client,null,'deployment.bootstrap_administrator',id,{source:'verified legacy bootstrap account'});
    }
  });
}
export async function verifyRuntime(db){
  const info=(await db.query(`SELECT current_user AS role,
    has_table_privilege(current_user,'public.users','INSERT') AS can_insert_users,
    has_table_privilege(current_user,'public.audit_log','UPDATE') AS can_update_audit,
    has_table_privilege(current_user,'public.schema_migrations','UPDATE') AS can_update_migrations,
    has_schema_privilege(current_user,'public','CREATE') AS can_create_schema,
    rolsuper,rolcreaterole,rolcreatedb,rolbypassrls FROM pg_roles WHERE rolname=current_user`)).rows[0];
  if(info.role!==target.runtimeRole||!info.can_insert_users||info.can_update_audit||info.can_update_migrations||info.can_create_schema||info.rolsuper||info.rolcreaterole||info.rolcreatedb||info.rolbypassrls)throw new DeploymentError('Runtime database privileges did not pass least-privilege checks.');
  const migrations=(await db.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count;
  if(migrations<3)throw new DeploymentError('The application migration set is incomplete.');
  return {role:info.role,migrations,auditAndMigrationMutationDenied:true};
}
export async function prepareDatabase(ownerConnection,renderConnection,emailValue,passwordValue){
  const email=emailSchema.parse(emailValue.trim()),password=passwordSchema.parse(passwordValue),owner=poolFor(ownerConnection);
  let runtimePassword;
  try{
    const database=(await owner.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",[target.database])).rows[0];
    if(database&&database.marker!==managedMarker)throw new DeploymentError('An unmanaged database already uses the target name. It was not changed.');
    if(!database){
      await owner.query(`CREATE DATABASE ${identifier(target.database)}`);
      await owner.query(`COMMENT ON DATABASE ${identifier(target.database)} IS ${literal(managedMarker)}`);
    }
    const role=(await owner.query("SELECT shobj_description(oid,'pg_authid') AS marker FROM pg_roles WHERE rolname=$1",[target.runtimeRole])).rows[0];
    if(role&&role.marker!==managedMarker)throw new DeploymentError('An unmanaged database role already uses the target name. It was not changed.');
    if(role&&managedConnection(renderConnection,ownerConnection))runtimePassword=decodeURIComponent(new URL(renderConnection).password);
    else{
      runtimePassword=randomBytes(32).toString('hex');
      if(!role)await owner.query(`CREATE ROLE ${identifier(target.runtimeRole)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD ${literal(runtimePassword)}`);
      else await owner.query(`ALTER ROLE ${identifier(target.runtimeRole)} PASSWORD ${literal(runtimePassword)}`);
      await owner.query(`COMMENT ON ROLE ${identifier(target.runtimeRole)} IS ${literal(managedMarker)}`);
    }
    await owner.query(`GRANT CONNECT ON DATABASE ${identifier(target.database)} TO ${identifier(target.runtimeRole)}`);
  }finally{await owner.end();}
  const applicationOwner=poolFor(applicationUrl(ownerConnection));
  try{await provisionApplication(applicationOwner,email,password);}finally{await applicationOwner.end();}
  const runtimeUrl=applicationUrl(renderConnection,{username:target.runtimeRole,password:runtimePassword});
  const runtime=poolFor(runtimeUrl);
  try{const privileges=await verifyRuntime(runtime);return {runtimeUrl,privileges};}finally{await runtime.end();}
}

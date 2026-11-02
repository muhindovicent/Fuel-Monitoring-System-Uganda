import { OPERATORS,STATIONS_DATA } from '../app/js/data.js';
import { transaction } from './db.js';

export async function seedDemo(db) {
  await transaction(db,async client=>{
    for(const op of OPERATORS) await client.query('INSERT INTO operators(id,name,short_name) VALUES ($1,$2,$3) ON CONFLICT(id) DO NOTHING',[op.id,op.name,op.short]);
    for(const s of STATIONS_DATA) {
      const inserted=await client.query(`INSERT INTO stations(id,operator_id,name,area,district,region,latitude,longitude,demo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) ON CONFLICT(id) DO NOTHING RETURNING id`,[s.id,s.op,s.name,s.area,s.district,s.region,s.lat,s.lng]);
      if(!inserted.rowCount)continue;
      for(const fuel of ['petrol','diesel']) if(s[fuel]) await client.query("INSERT INTO prices(station_id,fuel,price,source) VALUES ($1,$2,$3,'demo') ON CONFLICT DO NOTHING",[s.id,fuel,s[fuel]]);
    }
    for(const name of ['Kampala–Jinja corridor','Kampala–Masaka corridor','Northern bypass','Gulu highway','Entebbe corridor']) await client.query('INSERT INTO rooms(name) VALUES ($1) ON CONFLICT DO NOTHING',[name]);
    await client.query("SELECT setval(pg_get_serial_sequence('stations','id'),greatest(1,(SELECT max(id) FROM stations)))");
    await client.query("SELECT setval(pg_get_serial_sequence('operators','id'),greatest(1,(SELECT max(id) FROM operators)))");
  });
}

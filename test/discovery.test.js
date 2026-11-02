import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterStations,freshPrice,publishedPrice,distanceKm} from '../app/js/discovery.js';

const now=Date.parse('2026-11-02T12:00:00Z');
function station(id,name,price=5200,{age=2,demo=false,source='operator',fuel='petrol',latitude=0.3145,longitude=32.5795,district='Kampala',area='Central'}={}){
  return {id,name,operator_name:'Test operator',area,district,region:'Central',latitude,longitude,demo,prices:price==null?[]:[{fuel,price,source,updated_at:new Date(now-age*3600000).toISOString(),stale:age>48}]};
}
test('price ranking uses only fresh accepted sources and never promotes demo, pending or stale observations',()=>{
  const rows=[station(1,'Alpha',5200),station(2,'Beta',4900),station(3,'Cheap demo',1000,{demo:true,source:'demo'}),station(4,'Old price',2000,{age:60}),station(5,'Pending input',1500,{source:'pending'})];
  assert.deepEqual(filterStations(rows,{sort:'price'},null,now).slice(0,2).map(s=>s.id),[2,1]);
  assert.deepEqual(filterStations(rows,{verifiedOnly:true},null,now).map(s=>s.id),[2,1]);
  assert.equal(freshPrice(rows[2],'petrol',now),null);assert.equal(freshPrice(rows[3],'petrol',now),null);assert.equal(publishedPrice(rows[4],'petrol'),undefined);
});
test('freshness windows and selected fuel require actual published records',()=>{
  const rows=[station(1,'Recent',5000,{age:2}),station(2,'Morning',5100,{age:8}),station(3,'Yesterday',5200,{age:30})];
  assert.deepEqual(filterStations(rows,{freshness:'6'},null,now).map(s=>s.id),[1]);
  assert.deepEqual(filterStations(rows,{freshness:'24'},null,now).map(s=>s.id),[1,2]);
  assert.equal(filterStations(rows,{fuel:'diesel',verifiedOnly:true},null,now).length,0);
});
test('station, operator, district and city searches are case-insensitive without changing source records',()=>{
  const rows=[station(1,'Airport forecourt',5200,{district:'Wakiso',area:'Entebbe'}),station(2,'Town forecourt',5100)];
  const original=JSON.stringify(rows);
  assert.deepEqual(filterStations(rows,{district:'ENTEBBE',q:'airport'},null,now).map(s=>s.id),[1]);
  assert.equal(filterStations(rows,{q:'test OPERATOR'},null,now).length,2);
  assert.equal(JSON.stringify(rows),original);
});
test('nearby sorting and radius use actual coordinate distance rather than a synthetic road estimate',()=>{
  const position={latitude:0.3145,longitude:32.5795};
  const rows=[station(1,'Zulu near'),station(2,'Alpha far',5000,{latitude:0.425,longitude:33.204}),station(3,'Middle',5100,{latitude:0.34})];
  assert.deepEqual(filterStations(rows,{sort:'distance',radius:'10'},position,now).map(s=>s.id),[1,3]);
  assert.equal(distanceKm(position,position),0);
  assert.ok(Math.abs(distanceKm({latitude:0,longitude:0},{latitude:0,longitude:1})-111.195)<.01);
});
test('canonical district selection does not match a similarly named road in a different district',()=>{
  const rows=[station(1,'Shell Jinja Road',5200,{district:'Kampala',area:'Jinja Road'}),station(2,'Jinja town station',5100,{district:'Jinja',area:'Jinja Town'})];
  assert.deepEqual(filterStations(rows,{district:'JINJA'},null,now).map(s=>s.id),[2]);
  assert.equal(filterStations(rows,{q:'Jinja'},null,now).length,2);
});

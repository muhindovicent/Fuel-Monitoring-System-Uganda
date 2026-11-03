import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildFrontend} from '../app/build.mjs';

test('frontend build publishes only public assets and licensed Leaflet files',async()=>{
  const parent=join(tmpdir(),'opencode');await mkdir(parent,{recursive:true});
  const base=await mkdtemp(join(parent,'mafuta-static-'));
  try{
    for(const entry of ['css','js','assets','node_modules/leaflet/dist','server'])await mkdir(join(base,entry),{recursive:true});
    for(const entry of ['index.html','manifest.json','icon.svg','service-worker.js','.env','build.mjs','vercel.json','server/private.js'])await writeFile(join(base,entry),'test fixture');
    await writeFile(join(base,'node_modules/leaflet/dist/leaflet.js'),'leaflet fixture');
    await writeFile(join(base,'node_modules/leaflet/LICENSE'),'Leaflet license fixture');
    const output=await buildFrontend(base),files=await readdir(output);
    assert.deepEqual(files.sort(),['assets','css','icon.svg','index.html','js','manifest.json','service-worker.js','vendor'].sort());
    assert.equal(await readFile(join(output,'vendor/leaflet/leaflet.js'),'utf8'),'leaflet fixture');
    assert.equal(await readFile(join(output,'vendor/leaflet/LICENSE'),'utf8'),'Leaflet license fixture');
  }finally{await rm(base,{recursive:true,force:true});}
});

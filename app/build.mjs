import {cp,mkdir,rm,copyFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';

export async function buildFrontend(base=fileURLToPath(new URL('.',import.meta.url))){
  const output=join(base,'dist');
  await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
  // Explicit public allowlist: no .env, PostgreSQL data, server files or tests.
  for(const entry of ['index.html','css','js','assets','manifest.json','icon.svg','service-worker.js']){
    await cp(join(base,entry),join(output,entry),{recursive:true});
  }
  const vendor=join(output,'vendor','leaflet');await mkdir(vendor,{recursive:true});
  await cp(join(base,'node_modules','leaflet','dist'),vendor,{recursive:true});
  await copyFile(join(base,'node_modules','leaflet','LICENSE'),join(vendor,'LICENSE'));
  return output;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  await buildFrontend();console.log('Public frontend assets and pinned Leaflet distribution built.');
}

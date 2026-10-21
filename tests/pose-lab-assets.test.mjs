import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

test('self-hosted model and browser runtimes match the pinned manifest',()=>{
  const root=new URL('../',import.meta.url);
  const manifest=JSON.parse(readFileSync(new URL('public/pose-lab-assets/manifest.json',root),'utf8'));
  assert.deepEqual(manifest.model.input,[1,3,640,640]);
  assert.deepEqual(manifest.model.output,[1,300,57]);
  assert.equal(manifest.runtime.pyodide,'0.27.7');
  for(const asset of manifest.files){
    const bytes=readFileSync(new URL(asset.path,root));
    assert.equal(bytes.length,asset.bytes,asset.path+' length');
    assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,asset.path+' checksum');
  }
});

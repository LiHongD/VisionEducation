"""Download a small, attributed three-class subset without fetching the full 391 MB ZIP.
Run with the workspace's onnxruntime/numpy environment on PYTHONPATH.
Only training/validation images and features enter public/. Test features stay server-side.
"""
from pathlib import Path
import urllib.request,struct,json,time,zlib,hashlib,re,random,io,concurrent.futures,zipfile
from collections import Counter,defaultdict
from PIL import Image,ImageOps,ImageStat
ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'work/training-data';CACHE.mkdir(parents=True,exist_ok=True)
PUBLIC=ROOT/'public/model-lab-assets';PUBLIC.mkdir(parents=True,exist_ok=True)
URL='https://zenodo.org/api/records/15349809/files/CombatSports%20Dataset%20-%20Greyscale%2010%25.zip/content'
SIZE=391023087
CLASSES=[{'id':'cross','name':'直拳','sourceId':1},{'id':'high-guard','name':'高位防守','sourceId':2},{'id':'kick','name':'踢腿','sourceId':4}]
def digest(b):return hashlib.sha256(b).hexdigest()
def get(a,b):
    p=CACHE/f'range-{a}-{b}.bin'
    if p.exists():return p.read_bytes()
    for attempt in range(5):
        try:
            r=urllib.request.urlopen(urllib.request.Request(URL,headers={'Range':f'bytes={a}-{b}'}),timeout=90)
            data=r.read()
            if r.status!=206 or len(data)!=b-a+1:raise RuntimeError('Invalid partial response')
            p.write_bytes(data);return data
        except Exception:
            if attempt==4:raise
            time.sleep(1+attempt)
def directory():
    tail=get(SIZE-65536,SIZE-1);f=struct.unpack('<4s4H2IH',tail[-22:]);size,offset=f[5:7]
    b=get(offset,offset+size-1);i=0;rows=[]
    while i<len(b):
        f=struct.unpack_from('<4s6H3I5H2I',b,i);assert f[0]==b'PK\1\2'
        name=b[i+46:i+46+f[10]].decode('utf8')
        rows.append({'name':name,'method':f[4],'crc':f[7],'compressed':f[8],'size':f[9],'offset':f[16]})
        i+=46+f[10]+f[11]+f[12]
    return rows
def unpack(entry,data,origin):
    p=entry['offset']-origin;f=struct.unpack_from('<4s5H3I2H',data,p);assert f[0]==b'PK\3\4'
    start=p+30+f[-2]+f[-1];content=data[start:start+entry['compressed']]
    out=zlib.decompress(content,-15) if entry['method']==8 else content
    assert len(out)==entry['size'] and zlib.crc32(out)==entry['crc']
    return out
def entry_bytes(e):
    key=CACHE/('entry-'+digest(e['name'].encode())[:24]+'.bin')
    if not key.exists():
        # Prefer the single archive download when present; avoid rate-limited tiny requests.
        archive=CACHE/'combat-sports.zip';length=e['compressed']+len(e['name'].encode())+256
        if archive.exists():
            deadline=time.monotonic()+1800
            while archive.stat().st_size<e['offset']+length:
                if time.monotonic()>deadline:raise RuntimeError('Archive download incomplete')
                time.sleep(3)
            with archive.open('rb') as handle:handle.seek(e['offset']);b=handle.read(length)
        else:b=get(e['offset'],e['offset']+length-1)
        key.write_bytes(unpack(e,b,e['offset']))
    return key.read_bytes()
def base_name(name):return Path(name).name.split('.rf.')[0]
def group_name(name):
    base=base_name(name)
    if re.match(r'frame[_-]?\d+',base,re.I):return 'video:unidentified-frame-series'
    date=re.match(r'(20\d{6})\d{6}',base)
    if date:return 'photo-session:'+date.group(1)
    m=re.match(r'(.+?)[_-](?:mp4|mov|avi|mkv)(?:[_-]|$)',base,re.I)
    return 'video:'+m.group(1).lower() if m else 'image:'+base.lower()
def split_for(group):
    n=int(digest(('actionlab-v1:'+group).encode())[:8],16)%100
    return 'train' if n<60 else 'validation' if n<75 else 'test'
def feature_model():
    import onnx
    original=CACHE/'mobilenetv2-12.onnx'
    if not original.exists():urllib.request.urlretrieve('https://media.githubusercontent.com/media/onnx/models/main/validated/vision/classification/mobilenet/model/mobilenetv2-12.onnx',original)
    m=onnx.load(original)
    out=onnx.helper.make_tensor_value_info('472',onnx.TensorProto.FLOAT,[1,1280]);del m.graph.output[:];m.graph.output.append(out);del m.graph.node[-1]
    used={x for n in m.graph.node for x in n.input};keep=[t for t in m.graph.initializer if t.name in used];del m.graph.initializer[:];m.graph.initializer.extend(keep)
    onnx.checker.check_model(m);onnx.save(m,PUBLIC/'mobilenetv2-features.onnx')
def main():
    # A single sequential download is friendlier to Zenodo than hundreds of requests.
    archive=CACHE/'combat-sports.zip'
    if not archive.exists():urllib.request.urlretrieve(URL,archive)
    rows=directory();byname={r['name']:r for r in rows}
    small=[r for r in rows if r['name'].endswith(('.txt','.yaml')) and r['size']]
    # Labels are contiguous by source split; download each block once.
    blocks=[]
    for key in ['test/labels/','train/labels/','valid/labels/']:
        members=sorted([r for r in small if '/'+key in r['name']],key=lambda r:r['offset'])
        if not members:continue
        first,last=members[0],members[-1];a=first['offset'];b=last['offset']+last['compressed']+len(last['name'].encode())+255
        data=get(a,b)
        blocks.extend((e,unpack(e,data,a)) for e in members)
    for e in small:
        if '/labels/' not in e['name']:
            content=entry_bytes(e);(CACHE/Path(e['name']).name).write_bytes(content);print(Path(e['name']).name,content.decode()[:450],flush=True)
    candidates=defaultdict(list);seen=set()
    source_ids={c['sourceId']:i for i,c in enumerate(CLASSES)}
    for label,data in blocks:
        image=label['name'].replace('/labels/','/images/').removesuffix('.txt')+'.jpg'
        if image not in byname:continue
        for line in data.decode().splitlines():
            parts=line.split()
            if len(parts)!=5 or int(parts[0]) not in source_ids:continue
            category=source_ids[int(parts[0])];box=list(map(float,parts[1:]));x,y,w,h=box
            if min(w,h)<.13 or max(w/h,h/w)>3.5:continue
            orig=base_name(image);key=(orig,category)
            if key in seen:continue
            seen.add(key);group=group_name(image);split=split_for(group)
            candidates[(split,category)].append({'source':image,'group':group,'box':box,'label':category,'split':split})
    print('candidate counts',dict(Counter({str(k):len(v) for k,v in candidates.items()})),flush=True)
    chosen=[];limits={'train':60,'validation':15,'test':20}
    for key,items in candidates.items():
        items.sort(key=lambda item:digest(('selection:'+item['source']).encode()))
        pergroup=Counter();selected=[]
        for item in items:
            if pergroup[item['group']]>=8:continue
            selected.append(item);pergroup[item['group']]+=1
            if len(selected)>=limits[key[0]]:break
        if len(selected)<limits[key[0]]:raise RuntimeError(f'Not enough independent samples for {key}: {len(selected)}')
        chosen.extend(selected)
    (CACHE/'selection.json').write_text(json.dumps(chosen,ensure_ascii=False,indent=2))
    print('Downloading selected source images',len({c['source'] for c in chosen}),flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(entry_bytes,[byname[name] for name in sorted({c['source'] for c in chosen})]))
    prepared=[];hashes={};perceptual=[]
    for item in chosen:
        raw=entry_bytes(byname[item['source']]);img=Image.open(io.BytesIO(raw)).convert('RGB');width,height=img.size;x,y,w,h=item['box'];margin=.08
        box=(max(0,int((x-w*(.5+margin))*width)),max(0,int((y-h*(.5+margin))*height)),min(width,int((x+w*(.5+margin))*width)),min(height,int((y+h*(.5+margin))*height)))
        crop=img.crop(box);crop=ImageOps.pad(crop,(224,224),method=Image.Resampling.BILINEAR,color=(128,128,128))
        b=io.BytesIO();crop.save(b,format='JPEG',quality=89);encoded=b.getvalue();sha=digest(encoded)
        if sha in hashes:raise RuntimeError('Exact duplicate crop selected')
        hashes[sha]=item['split'];ident=sha[:16];item={**item,'id':ident,'sha256':sha}
        image_dir=PUBLIC/'images'/CLASSES[item['label']]['id'] if item['split']!='test' else CACHE/'test-images'
        image_dir.mkdir(parents=True,exist_ok=True);file=image_dir/(ident+'.jpg');file.write_bytes(encoded);item['file']=file
        prepared.append(item)
    assert len({x['group'] for x in prepared if x['split']=='train'} & {x['group'] for x in prepared if x['split']!='train'})==0
    feature_model()
    import numpy as np,onnxruntime as ort
    opts=ort.SessionOptions();opts.intra_op_num_threads=2
    session=ort.InferenceSession(str(PUBLIC/'mobilenetv2-features.onnx'),sess_options=opts,providers=['CPUExecutionProvider'])
    mean=np.array([.485,.456,.406],dtype=np.float32).reshape(3,1,1);std=np.array([.229,.224,.225],dtype=np.float32).reshape(3,1,1)
    public_samples=[];test_samples=[]
    for index,item in enumerate(prepared):
        img=np.array(Image.open(item['file']).convert('RGB'),dtype=np.float32)/255
        tensor=((img.transpose(2,0,1)-mean)/std)[None,...]
        full=session.run(None,{session.get_inputs()[0].name:tensor})[0].reshape(-1)
        compressed=np.zeros(256,dtype=np.float64)
        for i,value in enumerate(full):compressed[i%256]+=float(value)*(1 if ((i*2654435761)&0x80000000)==0 else -1)
        norm=float(np.linalg.norm(compressed));features=(compressed/(norm or 1)*16).round(6).tolist()
        row={'id':item['id'],'label':item['label'],'split':item['split'],'features':features}
        if item['split']=='test':test_samples.append(row)
        else:
            row['image']='/model-lab-assets/images/'+CLASSES[item['label']]['id']+'/'+item['id']+'.jpg';public_samples.append(row)
        if index%50==0:print('Embedded',index,flush=True)
    model_sha=digest((PUBLIC/'mobilenetv2-features.onnx').read_bytes())
    common={'datasetId':'combat3-v1','featureSpec':'mobilenetv2-472-hash256-l2-v1','featureDimension':256,'backboneSha256':model_sha,'classes':[{'id':c['id'],'name':c['name']} for c in CLASSES]}
    manifest={**common,'name':'武术与格斗动作三分类 · 课堂小样本集','counts':{k:sum(x['split']==k for x in prepared) for k in limits},'perClass':limits,'source':{'title':'Combat Sports Dataset','author':'Evan Quinn','url':'https://zenodo.org/records/15349809','license':'Public Domain (as declared by dataset author)'},'splitPolicy':'按来源视频/原图分组；同源增强图不跨集合。测试集仅在服务端评测。','limitations':'含格斗训练与竞技场景，并非中国武术标准动作库；小样本、相邻来源帧和背景偏差仍可能影响结果。','backboneUrl':'/model-lab-assets/mobilenetv2-features.onnx','dataUrl':'/model-lab-assets/samples.json','downloadUrl':'/model-lab-assets/classroom-dataset.zip'}
    (PUBLIC/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
    (PUBLIC/'samples.json').write_text(json.dumps({**common,'samples':public_samples},ensure_ascii=False,separators=(',',':')),encoding='utf8')
    allowed={(ROOT/'public'/s['image'].lstrip('/')).resolve() for s in public_samples}
    image_root=(PUBLIC/'images').resolve()
    assert image_root.is_relative_to(ROOT.resolve())
    for stale in image_root.rglob('*.jpg'):
        if stale.resolve() not in allowed:stale.unlink()
    (ROOT/'lib/classifier-benchmark.json').write_text(json.dumps({**common,'samples':test_samples},ensure_ascii=False,separators=(',',':')),encoding='utf8')
    provenance=[{k:v for k,v in item.items() if k!='file'} for item in prepared]
    (ROOT/'docs/classifier-dataset-provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2),encoding='utf8')
    with zipfile.ZipFile(PUBLIC/'classroom-dataset.zip','w',zipfile.ZIP_DEFLATED) as z:
        for item in prepared:
            if item['split']!='test':z.write(item['file'],item['split']+'/'+CLASSES[item['label']]['id']+'/'+item['file'].name)
        z.writestr('README.txt','Combat Sports Dataset subset\nEvan Quinn, https://zenodo.org/records/15349809\nLicense: Public Domain, declared by source author.\nThree classes: cross, high-guard, kick. Person boxes cropped and resized for classroom image classification.\nFixed group split. Held-out test data are not distributed in this student download.\n')
    print(json.dumps(manifest,ensure_ascii=False),flush=True)
if __name__=='__main__':main()

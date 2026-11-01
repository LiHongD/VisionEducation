"""Build a reproducible, licensed full-body COCO classroom subset."""
import concurrent.futures, hashlib, json, pathlib, urllib.request, time
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / 'pose-training-classroom/tools'
WORK = ROOT / 'work/pose-v2/raw'
WORK.mkdir(parents=True, exist_ok=True)
TARGET = ROOT / 'public/pose-training/assets'
old = json.loads((TARGET / 'dataset.json').read_text())
def select(coco):
  images = {i['id']: i for i in coco['images']}
  best = {}
  for a in coco['annotations']:
    i = images[a['image_id']]
    x,y,w,h = a['bbox']; k = a['keypoints']
    if i['license'] != 4 or a['iscrowd'] or a['num_keypoints'] < 15 or h < 160 or w < 65 or h < w*1.2:
        continue
    if any(k[j*3+2] == 0 for j in [5,6,11,12,13,14,15,16]): continue
    if (k[16]+k[19])/2 >= (k[34]+k[37])/2: continue
    if (k[46]+k[49])/2 <= (k[34]+k[37])/2: continue
    if i['id'] not in best or a['num_keypoints'] > best[i['id']]['num_keypoints']:
        best[i['id']] = a
  return images,best
train_images,train_best=select(json.loads((ROOT/'work/pose-v2/person_keypoints_train2017.json').read_text()))
val_images,val_best=select(json.loads((SOURCE/'person_keypoints_val2017.json').read_text()))
images={**train_images,**val_images}; best={**train_best,**val_best}
ordered=lambda values:sorted(values,key=lambda i:hashlib.sha256(('classroom-fullbody-v2:'+str(i)).encode()).hexdigest())
train_ids=ordered(train_best)[:1024];val_ids=ordered(val_best)[:80]
assert len(train_ids)==1024 and len(val_ids)==80 and not set(train_ids)&set(val_ids)
splits={**{i:'train' for i in train_ids},**{i:'valid' if n<40 else 'test' for n,i in enumerate(val_ids)}}
records = []
for image_id in sorted(splits, key=lambda i: (['train', 'valid', 'test'].index(splits[i]), hashlib.sha256(str(i).encode()).hexdigest())):
    a, i = best[image_id], images[image_id]
    side = max(a['bbox'][2:]) * 1.16
    x, y = a['bbox'][0] + a['bbox'][2] / 2 - side / 2, a['bbox'][1] + a['bbox'][3] / 2 - side / 2
    points = []
    for j in range(17):
        px, py, v = a['keypoints'][j * 3:j * 3 + 3]
        nx, ny = (px - x) / side, (py - y) / side
        points.append([nx, ny, v] if v and 0 <= nx <= 1 and 0 <= ny <= 1 else [0, 0, 0])
    records.append(dict(id=f'coco-{image_id}', image=f"assets/images/{i['file_name']}", fileName=i['file_name'], split=splits[image_id], keypoints=points,
        source=dict(imageId=image_id, annotationId=a['id'], cocoSplit='train2017' if splits[image_id]=='train' else 'val2017', url=i['coco_url'].replace('http:', 'https:'), flickrUrl=i['flickr_url'], license='CC BY 2.0', licenseUrl='https://creativecommons.org/licenses/by/2.0/'),
        crop=dict(x=x, y=y, side=side), originalSize=[i['width'], i['height']]))
assert len(records) == 1104
assert [sum(s['split'] == split for s in records) for split in ['train', 'valid', 'test']] == [1024, 40, 40]

def prepare(record):
    path = SOURCE / 'raw' / record['fileName']
    if not path.exists():
        path = WORK / record['fileName']
        if not path.exists() or path.stat().st_size < 1000:
            url = 'https://s3.amazonaws.com/images.cocodataset.org/' + record['source']['cocoSplit'] + '/' + record['fileName']
            for attempt in range(4):
                try:
                    with urllib.request.urlopen(url, timeout=90) as response:
                        path.write_bytes(response.read())
                    break
                except Exception:
                    if attempt == 3:
                        raise
                    time.sleep(1 + attempt)
    with Image.open(path) as image:
        c = record['crop']
        # Explicit padding matches Canvas preprocessing and does not stretch the person.
        canvas = Image.new('RGB', (256, 256), (232, 235, 240))
        region = image.convert('RGB').transform((256, 256), Image.Transform.AFFINE,
            (c['side']/256, 0, c['x'], 0, c['side']/256, c['y']), Image.Resampling.BICUBIC, fillcolor=(232, 235, 240))
        canvas.paste(region)
        canvas.save(TARGET / record['image'].removeprefix('assets/'), quality=92)
    return record['id']

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    for n, _ in enumerate(pool.map(prepare, records), 1):
        if n % 25 == 0:
            print(f'Prepared {n}/{len(records)} real images', flush=True)
(TARGET / 'dataset.json').write_text(json.dumps(dict(name='COCO 课堂单人姿态集 · 扩充版', version=2, keypointNames=old['keypointNames'],
    origin='COCO train2017/val2017，1104张CC BY 2.0原图；选择躯干向上、腿部标注完整的全身人物。一图一人，人工框放大1.16倍后方形裁剪至256×256。',
    splitPolicy='1024张来自COCO train2017；40张验证和40张测试来自COCO val2017，三组原图不重叠。测试集不用于选权重。', samples=records), ensure_ascii=False, indent=2), encoding='utf-8')
print('Dataset ready: 1024 train / 40 validation / 40 test', flush=True)

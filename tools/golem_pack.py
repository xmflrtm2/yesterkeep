"""StoneGolem 팩 → 게임용 골렘 파일들 (assets/fab/StoneGolem/).

    py -I tools\\golem_pack.py

- 원본: C:\\FabAssets\\glb\\StoneGolem (fab-export 결과, 텍스처는 ../textures/*.jpg|png 바깥 파일)
- 몸(SKM_StoneGolem), 망치, 방패를 각각 한 파일로: 텍스처를 줄여(JPEG) GLB 안에 담는다.
- 웹에서 안 쓰는 것 빼기: TANGENT(노멀맵은 화면 미분으로 됨), JOINTS_1/WEIGHTS_1(three.js는 4개만 씀),
  KHR_materials_specular(그림 한 장 + 물리 머티리얼 비용).
- 동작은 fab-assets/tools/glb_tools.py subset 으로 쓸 것만 골라 assets/fab/anims/SKEL_StoneGolem.anims.glb 에.
"""
import base64, json, os, struct, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
GAME = HERE.parent
SRC = Path(r'C:\FabAssets\glb\StoneGolem')
OUT = GAME / 'assets' / 'fab' / 'StoneGolem'
ANIM_OUT = GAME / 'assets' / 'fab' / 'anims' / 'SKEL_StoneGolem.anims.glb'
GLB_TOOLS = Path(r'C:\Users\PC\Desktop\CMG\fab-assets\tools\glb_tools.py')
CLIPS = ['AS_StoneGolem_idle2', 'AS_StoneGolem_walkF', 'AS_StoneGolem_jogF', 'AS_StoneGolem_attack4',  # attack4 = 뛰어올라 망치 내려찍기
         'AS_StoneGolem_death1', 'AS_StoneGolem_death2']  # death1 = 뒤로 쓰러짐(정면·기습), death2 = 앞으로 엎어짐(등 뒤)
# 줄일 크기: 위에서 내려다보는 카메라(골렘 키가 화면에서 150px 안팎)라 몸 바탕색만 512, 나머지·무기는 256
SIZES = {'base': 512, 'normal': 256, 'mr': 256, 'occlusion': 256}
SMALL = {'base': 256, 'normal': 256, 'mr': 256, 'occlusion': 256}
DROP_ATTRS = ('TANGENT', 'JOINTS_1', 'WEIGHTS_1')

sys.path.insert(0, str(HERE))
from shrink_tex import read_glb, write_glb, PS  # noqa: E402


def resize(jobs):
    tmp = Path(tempfile.mkdtemp(prefix='yk-golem-'))
    jf = tmp / 'jobs.json'
    jf.write_text(json.dumps(jobs), encoding='utf-8')
    cmd = "$jobsPath = '%s'\n%s" % (str(jf).replace("'", "''"), PS)
    enc = base64.b64encode(cmd.encode('utf-16-le')).decode('ascii')
    subprocess.run(['powershell', '-NoProfile', '-EncodedCommand', enc], check=True)


FMT = {5126: 'f', 5125: 'I', 5123: 'H', 5121: 'B', 5122: 'h', 5120: 'b'}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
NORM = {5121: 255.0, 5123: 65535.0, 5120: 127.0, 5122: 32767.0}


def read_acc(js, bn, a):
    """accessor 값을 평평한 리스트로 (byteStride 고려)"""
    bv = js['bufferViews'][a['bufferView']]
    f, nc = FMT[a['componentType']], NCOMP[a['type']]
    es = struct.calcsize('<' + f) * nc
    stride = bv.get('byteStride', es)
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    vals = []
    for i in range(a['count']):
        vals.extend(struct.unpack_from('<%d%s' % (nc, f), bn, base + i * stride))
    # 이미 정규화된 정수(가중치 ubyte/ushort 등)는 0~1 실수로 되돌린다
    if a.get('normalized') and a['componentType'] in NORM:
        k = NORM[a['componentType']]
        vals = [max(-1.0, v / k) for v in vals]
    return vals


def slim(src_glb, out_glb, tmp, sizes=SIZES):
    js, bn = read_glb(src_glb)
    SZ = sizes
    # 1) 안 쓰는 정점 속성 빼기
    for me in js['meshes']:
        for pr in me['primitives']:
            for a in DROP_ATTRS: pr['attributes'].pop(a, None)
            mat = js['materials'][pr['material']] if 'material' in pr else {}
            if '"texCoord": 1' not in json.dumps(mat): pr['attributes'].pop('TEXCOORD_1', None)  # 라이트맵 UV
    # 2) 머티리얼 슬롯별 그림 → 줄인 JPEG (새 images/textures 배열로 다시 짠다)
    old_imgs, old_texs = js.get('images', []), js.get('textures', [])
    new_imgs, new_texs, jobs, img_key = [], [], [], {}
    def remap(slot, ref):
        t = old_texs[ref['index']]
        uri = old_imgs[t['source']]['uri']
        key = (uri, SZ[slot])
        if key not in img_key:
            dst = tmp / ('%s_%d.jpg' % (Path(uri).stem, SZ[slot]))
            jobs.append({'src': str((Path(src_glb).parent / uri).resolve()), 'dst': str(dst), 'max': SZ[slot], 'png': False})
            img_key[key] = len(new_imgs); new_imgs.append({'_file': str(dst), 'mimeType': 'image/jpeg'})
        nt = {'source': img_key[key]}
        if 'sampler' in t: nt['sampler'] = t['sampler']
        new_texs.append(nt); ref['index'] = len(new_texs) - 1
    for m in js.get('materials', []):
        m.pop('extensions', None)
        pb = m.get('pbrMetallicRoughness', {})
        if 'baseColorTexture' in pb: remap('base', pb['baseColorTexture'])
        if 'metallicRoughnessTexture' in pb: remap('mr', pb['metallicRoughnessTexture'])
        if 'normalTexture' in m: remap('normal', m['normalTexture'])
        if 'occlusionTexture' in m: remap('occlusion', m['occlusionTexture'])
    js.pop('extensionsUsed', None); js.pop('extensionsRequired', None)
    resize(jobs)
    # 3) 쓰는 accessor만 남기고 번호를 다시 매김
    used = []
    def use(i):
        if i not in used: used.append(i)
    for me in js['meshes']:
        for pr in me['primitives']:
            for v in pr['attributes'].values(): use(v)
            if 'indices' in pr: use(pr['indices'])
            for tg in pr.get('targets', []):
                for v in tg.values(): use(v)
    for sk in js.get('skins', []):
        if 'inverseBindMatrices' in sk: use(sk['inverseBindMatrices'])
    for an in js.get('animations', []):
        for sa in an['samplers']: use(sa['input']); use(sa['output'])
    amap = {o: n for n, o in enumerate(used)}
    for me in js['meshes']:
        for pr in me['primitives']:
            pr['attributes'] = {k: amap[v] for k, v in pr['attributes'].items()}
            if 'indices' in pr: pr['indices'] = amap[pr['indices']]
            if 'targets' in pr: pr['targets'] = [{k: amap[v] for k, v in tg.items()} for tg in pr['targets']]
    for sk in js.get('skins', []):
        if 'inverseBindMatrices' in sk: sk['inverseBindMatrices'] = amap[sk['inverseBindMatrices']]
    for an in js.get('animations', []):
        for sa in an['samplers']: sa['input'] = amap[sa['input']]; sa['output'] = amap[sa['output']]
    accs = [js['accessors'][o] for o in used]
    # 양자화(KHR_mesh_quantization): 노멀 int8, 뼈 가중치 uint8, 뼈 번호 uint8, 인덱스 uint16
    role = {}
    for me in js['meshes']:
        for pr in me['primitives']:
            at = pr['attributes']
            for k, r in (('NORMAL', 'normal'), ('WEIGHTS_0', 'weights'), ('JOINTS_0', 'joints'), ('TEXCOORD_0', 'uv')):
                if k in at: role[at[k]] = r
            if 'indices' in pr: role[pr['indices']] = 'indices'
    # 4) 버퍼를 새로 짠다: accessor가 쓰는 뷰 + 그림 뷰
    out, views, vmap = bytearray(), [], {}
    def add_view(data, extra):
        out.extend(b'\0' * (-len(out) % 4))
        views.append(dict(buffer=0, byteOffset=len(out), byteLength=len(data), **extra)); out.extend(data)
        return len(views) - 1
    quant = False
    for n, a in enumerate(accs):
        if 'bufferView' not in a or n not in role: continue
        vals = read_acc(js, bn, a)
        r, data = role[n], None
        if r == 'indices' and max(vals) < 65536:
            data = struct.pack('<%dH' % len(vals), *vals); a['componentType'] = 5123; tgt = 34963; stride = None
        elif r == 'normal':
            b = bytearray()
            for k in range(0, len(vals), 3):
                b += struct.pack('<bbbx', *[max(-127, min(127, round(v * 127))) for v in vals[k:k + 3]])
            data, a['componentType'], a['normalized'], tgt, stride = bytes(b), 5120, True, 34962, 4
        elif r == 'weights':
            b = bytearray()
            for k in range(0, len(vals), 4):
                w = [max(0, round(v * 255)) for v in vals[k:k + 4]]
                w[w.index(max(w))] += 255 - sum(w)  # 합이 정확히 255가 되게
                b += struct.pack('<4B', *w)
            data, a['componentType'], a['normalized'], tgt, stride = bytes(b), 5121, True, 34962, None
        elif r == 'uv' and min(vals) >= 0.0 and max(vals) <= 1.0:
            data = struct.pack('<%dH' % len(vals), *[round(v * 65535) for v in vals])
            a['componentType'], a['normalized'], tgt, stride = 5123, True, 34962, None
        elif r == 'joints' and max(vals) < 256:
            data, a['componentType'], tgt, stride = struct.pack('<%dB' % len(vals), *vals), 5121, 34962, None
        if data is None: continue
        a.pop('min', None); a.pop('max', None); a['byteOffset'] = 0
        extra = {'target': tgt}
        if stride: extra['byteStride'] = stride
        a['bufferView'] = add_view(data, extra); a['_done'] = True
        quant = quant or r in ('normal', 'weights', 'uv')
    for a in accs:
        if a.pop('_done', False) or 'bufferView' not in a: continue
        ov = a['bufferView']
        if ov not in vmap:
            bv = js['bufferViews'][ov]; o = bv.get('byteOffset', 0)
            extra = {k: bv[k] for k in ('byteStride', 'target') if k in bv}
            vmap[ov] = add_view(bn[o:o + bv['byteLength']], extra)
        a['bufferView'] = vmap[ov]
    for im in new_imgs:
        im['bufferView'] = add_view(Path(im.pop('_file')).read_bytes(), {})
    js['accessors'], js['bufferViews'], js['images'], js['textures'] = accs, views, new_imgs, new_texs
    js['buffers'] = [{'byteLength': len(out) + (-len(out) % 4)}]
    if quant: js['extensionsUsed'] = js['extensionsRequired'] = ['KHR_mesh_quantization']
    write_glb(out_glb, js, bytes(out))
    return os.path.getsize(src_glb), os.path.getsize(out_glb)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix='yk-golem-'))
    for src, name, sz in [('Mesh/SKM_StoneGolem.glb', 'StoneGolem.glb', SIZES), ('Mesh/SM_StoneGolem_Hammer.glb', 'Hammer.glb', SMALL),
                          ('Mesh/SM_StoneGolem_Shield.glb', 'Shield.glb', SMALL)]:
        a, b = slim(SRC / src, OUT / name, tmp, sz)
        print('%-16s %8d -> %8d bytes (source textures were separate files)' % (name, a, b))
    ANIM_OUT.parent.mkdir(parents=True, exist_ok=True)
    py = sys.executable
    clips = sys.argv[sys.argv.index('--clips') + 1] if '--clips' in sys.argv else ';'.join(CLIPS)  # 고르는 중엔 --clips "*"
    r = subprocess.run([py, '-I', str(GLB_TOOLS), 'subset', str(ANIM_OUT), clips,
                        str(SRC / 'anims' / 'SKEL_StoneGolem_Skeleton.anims.glb')], capture_output=True, text=True)
    print(r.stdout.strip() or r.stderr.strip())
    print('anims', os.path.getsize(ANIM_OUT), 'bytes')


if __name__ == '__main__':
    main()

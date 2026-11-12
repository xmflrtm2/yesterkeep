"""Shrinks the Fab GLB files the game loads, for the web. Reads the untouched copies, writes the game's copies.

    py -I tools\\web_pack.py                      -> all groups into assets/fab/
    py -I tools\\web_pack.py chars anims          -> only these groups (chars, dagger, anims, dungeon)
    py -I tools\\web_pack.py --out <fab dir>      -> write somewhere else (e.g. a test copy of the game)
    py -I tools\\web_pack.py --restore            -> copy the untouched files back into assets/fab/

The untouched files live in build/fab-originals/ (copied once from assets/fab/ before the first run, gitignored),
so every run starts from the same input and settings can be changed and re-run. The Fab library (C:\\FabAssets) is
never touched. StoneGolem files are left alone: tools/golem_pack.py builds those.

What it does (three.js r160 GLTFLoader reads all of it):
- meshes: drop TANGENT (three.js derives tangents in the shader and flips normalScale.y itself), JOINTS_1/WEIGHTS_1
  (three.js skins with 4 influences) and texture coordinate sets no material uses; KHR_mesh_quantization for
  normals (int8), UVs (uint16/int16 when inside -1..1), joints (uint8) and weights (uint8, sums kept at 255);
  uint16 indices when they fit. Positions stay float.
- textures: WebP through EXT_texture_webp, with a size cap per group; normal maps get a higher quality. Embedded
  for the Polyart parts and the dagger, side files (textures/<name>.webp) for the dungeon pack.
- animations: per track, keys that linear interpolation (slerp for rotations) reproduces within a small tolerance are
  removed (first and last keys always stay, so clip lengths do not change); rotations are stored as int16.
"""
import io, json, math, os, shutil, struct, sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
GAME = Path(__file__).resolve().parent.parent
FAB = GAME / 'assets' / 'fab'
ORIG = GAME / 'build' / 'fab-originals'

GROUPS = {
    # characters are ~150 px tall on screen: base color 512, normal/AO/metal-rough 256 (same rule as tools/golem_pack.py)
    'chars': {'glob': ['Polyart/**/*.glb'], 'tex_max': {'base': 512, 'normal': 256, 'other': 256}},
    'dagger': {'glob': ['Dagger/**/*.glb'], 'tex_max': {'base': 256, 'normal': 256, 'other': 256}},
    # all these clips play on the rig from Dagger.anims.glb (src/hero.js), so that file's node TRS is the rest pose
    'anims': {'files': ['anims/Dagger.anims.glb', 'anims/SKEL_Mannequin.anims.glb'], 'rest_from': 'anims/Dagger.anims.glb'},
    'dungeon': {'glob': ['Fantastic_Dungeon_Pack/meshes/**/*.glb'], 'side_tex': 'Fantastic_Dungeon_Pack/textures', 'tex_max': {'base': 1024, 'normal': 1024, 'other': 1024}},
}
QUALITY = {'base': 82, 'normal': 90, 'other': 80}   # WebP quality per texture role
ROT_TOL = math.radians(0.12)                         # animation key reduction: max rotation error per bone
POS_TOL = 0.0005                                     # ... and translation/scale error (scene units; x100 if the rig is in cm)

DT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
CT = {np.dtype(v): k for k, v in DT.items()}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT2': 4, 'MAT3': 9, 'MAT4': 16}
NMAX = {5120: 127.0, 5121: 255.0, 5122: 32767.0, 5123: 65535.0}
ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER = 34962, 34963


def read_glb(p):
    b = Path(p).read_bytes()
    off, js, bn = 12, None, b''
    while off < len(b):
        ln, ty = struct.unpack_from('<II', b, off); off += 8
        if ty == 0x4E4F534A: js = json.loads(b[off:off + ln])
        elif ty == 0x004E4942: bn = b[off:off + ln]
        off += ln
    return js, bn


def write_glb(p, js, bn):
    j = json.dumps(js, separators=(',', ':')).encode('utf-8')
    j += b' ' * (-len(j) % 4)
    bn = bytes(bn) + b'\0' * (-len(bn) % 4)
    total = 12 + 8 + len(j) + (8 + len(bn) if bn else 0)
    out = struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(j), 0x4E4F534A) + j
    if bn:
        out += struct.pack('<II', len(bn), 0x004E4942) + bn
    Path(p).parent.mkdir(parents=True, exist_ok=True)
    Path(p).write_bytes(out)


def get(js, bn, ai, as_float=False):
    a = js['accessors'][ai]
    if 'sparse' in a:
        raise ValueError('sparse accessors are not handled')
    dt, nc = np.dtype(DT[a['componentType']]), NC[a['type']]
    if 'bufferView' not in a:
        arr = np.zeros((a['count'], nc), dt)
    else:
        bv = js['bufferViews'][a['bufferView']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = bv.get('byteStride', dt.itemsize * nc)
        arr = np.ndarray((a['count'], nc), dt, buffer=bn, offset=off, strides=(stride, dt.itemsize)).copy()
    if as_float:
        f = arr.astype(np.float64)
        if a.get('normalized') and a['componentType'] in NMAX:
            f = np.maximum(f / NMAX[a['componentType']], -1.0)
        return f
    return arr


def f32(x):
    """Shortest text that reads back as the same float32 (keeps min/max exact and the JSON small)."""
    return float(np.format_float_positional(np.float32(x), unique=True, trim='-'))


class Out:
    """New binary chunk: every bufferView 4-byte aligned, one bufferView per accessor.
    Animation data goes into one shared 'pool' bufferView (accessors use byteOffset) so the JSON stays small."""
    def __init__(self):
        self.buf, self.views, self.accs, self.cache = bytearray(), [], [], {}
        self.pool, self.pooled = bytearray(), []

    def pooled_acc(self, arr, type_, normalized=False, minmax=False, key=None):
        if key is not None and key in self.cache:
            return self.cache[key]
        arr = np.ascontiguousarray(arr)
        self.pool += b'\0' * (-len(self.pool) % 4)
        a = {'bufferView': -1, 'byteOffset': len(self.pool), 'componentType': CT[arr.dtype], 'count': int(arr.shape[0]), 'type': type_}
        if a['byteOffset'] == 0: del a['byteOffset']
        if normalized: a['normalized'] = True
        if minmax:
            a['min'] = [f32(x) for x in arr.min(0)]
            a['max'] = [f32(x) for x in arr.max(0)]
        self.pool += arr.tobytes()
        self.accs.append(a); self.pooled.append(a)
        idx = len(self.accs) - 1
        if key is not None: self.cache[key] = idx
        return idx

    def finish(self):
        if self.pool:
            v = self.view(bytes(self.pool))
            for a in self.pooled: a['bufferView'] = v

    def view(self, data, target=None, stride=None):
        self.buf += b'\0' * (-len(self.buf) % 4)
        v = {'buffer': 0, 'byteOffset': len(self.buf), 'byteLength': len(data)}
        if target: v['target'] = target
        if stride: v['byteStride'] = stride
        self.buf += data
        self.views.append(v)
        return len(self.views) - 1

    def acc(self, arr, type_, normalized=False, target=None, minmax=False, key=None):
        if key is not None and key in self.cache:
            return self.cache[key]
        arr = np.ascontiguousarray(arr)
        count, nc = arr.shape
        es = arr.itemsize * nc
        stride = None
        if target == ARRAY_BUFFER and es % 4:          # vertex attributes: each element 4-byte aligned
            stride = es + (-es % 4)
            pad = np.zeros((count, stride // arr.itemsize), arr.dtype)
            pad[:, :nc] = arr
            data = pad.tobytes()
        else:
            data = arr.tobytes()
        a = {'bufferView': self.view(data, target, stride), 'componentType': CT[arr.dtype], 'count': int(count), 'type': type_}
        if normalized: a['normalized'] = True
        if minmax:
            a['min'] = [float(x) if arr.dtype.kind == 'f' else int(x) for x in arr.min(0)]
            a['max'] = [float(x) if arr.dtype.kind == 'f' else int(x) for x in arr.max(0)]
        self.accs.append(a)
        idx = len(self.accs) - 1
        if key is not None: self.cache[key] = idx
        return idx

    def raw(self, js, bn, ai, target=None):
        """Copy an accessor unchanged (keeps type, normalized, min/max)."""
        key = ('raw', ai)
        if key in self.cache: return self.cache[key]
        a = dict(js['accessors'][ai])
        arr = get(js, bn, ai)
        new = self.acc(arr, a['type'], a.get('normalized', False), target)
        for k in ('min', 'max', 'name'):
            if k in a: self.accs[new][k] = a[k]
        self.cache[key] = new
        return new


def used_texcoords(mat):
    """UV sets the material's textures read (textureInfo = any '...Texture' object with an index)."""
    sets = {0}
    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k.endswith('Texture') and isinstance(v, dict) and 'index' in v:
                    tt = v.get('extensions', {}).get('KHR_texture_transform', {})
                    sets.add(tt.get('texCoord', v.get('texCoord', 0)))
                walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    walk(mat or {})
    return sets


def texture_roles(js):
    roles = {}
    for m in js.get('materials', []):
        pbr = m.get('pbrMetallicRoughness', {})
        for key, role in (('baseColorTexture', 'base'), ('metallicRoughnessTexture', 'other')):
            if key in pbr: roles.setdefault(pbr[key]['index'], role)
        for key, role in (('normalTexture', 'normal'), ('occlusionTexture', 'other'), ('emissiveTexture', 'base')):
            if key in m: roles[m[key]['index']] = role if role == 'normal' else roles.get(m[key]['index'], role)
    img_role = {}
    for ti, t in enumerate(js.get('textures', [])):
        src = t.get('source', t.get('extensions', {}).get('EXT_texture_webp', {}).get('source'))
        if src is not None:
            r = roles.get(ti, 'other')
            if img_role.get(src) != 'normal': img_role[src] = r
    return img_role


def to_webp(data, role, cap):
    im = Image.open(io.BytesIO(data)); im.load()
    alpha = im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info)
    im = im.convert('RGBA' if alpha else 'RGB')
    if alpha and im.getchannel('A').getextrema()[0] == 255:
        im, alpha = im.convert('RGB'), False
    if max(im.size) > cap:
        s = cap / max(im.size)
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    b = io.BytesIO()
    im.save(b, 'WEBP', quality=QUALITY[role], method=6, alpha_quality=90)
    return b.getvalue()


def slerp(q0, q1, a):
    d = np.sum(q0 * q1, axis=1, keepdims=True)
    q1 = np.where(d < 0, -q1, q1); d = np.abs(d)
    th = np.arccos(np.clip(d, -1, 1)); s = np.sin(th)
    small = s < 1e-6
    w0 = np.where(small, 1 - a, np.sin((1 - a) * th) / np.where(small, 1, s))
    w1 = np.where(small, a, np.sin(a * th) / np.where(small, 1, s))
    return w0 * q0 + w1 * q1


def reduce_keys(t, v, path, tol):
    n = len(t)
    if path == 'rotation':
        v = v / np.linalg.norm(v, axis=1, keepdims=True)
        for i in range(1, n):
            if np.dot(v[i], v[i - 1]) < 0: v[i] = -v[i]
    if n <= 2:
        return t, v
    def ok(i0, j):
        k = np.arange(i0 + 1, j)
        a = ((t[k] - t[i0]) / (t[j] - t[i0]))[:, None]
        if path == 'rotation':
            q = slerp(np.repeat(v[i0][None], len(k), 0), np.repeat(v[j][None], len(k), 0), a)
            ang = 2 * np.arccos(np.clip(np.abs(np.sum(q * v[k], axis=1)) / np.linalg.norm(q, axis=1), -1, 1))
            return ang.max() <= tol
        p = (1 - a) * v[i0] + a * v[j]
        return np.abs(p - v[k]).max() <= tol
    keep, i0, j = [0], 0, 2
    while j < n:
        if ok(i0, j):
            j += 1
            continue
        keep.append(j - 1); i0 = j - 1; j = i0 + 2
    keep.append(n - 1)
    keep = sorted(set(keep))
    return t[keep], v[keep]


def pack(src, dst, opt, side_map=None):
    js, bn = read_glb(src)
    out = Out()
    quant = False
    # meshes
    for m in js.get('meshes', []):
        for pr in m['primitives']:
            mat = js['materials'][pr['material']] if 'material' in pr and js.get('materials') else None
            uvs = used_texcoords(mat)
            na = {}
            for k, ai in pr['attributes'].items():
                base, _, num = k.partition('_')
                if k in ('TANGENT', 'JOINTS_1', 'WEIGHTS_1'): continue
                if base == 'TEXCOORD' and int(num or 0) not in uvs: continue
                a = js['accessors'][ai]
                if k == 'NORMAL' and a['componentType'] == 5126:
                    f = get(js, bn, ai, True)
                    f /= np.maximum(np.linalg.norm(f, axis=1, keepdims=True), 1e-8)
                    na[k] = out.acc(np.round(f * 127).astype(np.int8), 'VEC3', True, ARRAY_BUFFER, key=('n', ai)); quant = True
                elif base == 'TEXCOORD' and a['componentType'] == 5126:
                    f = get(js, bn, ai, True)
                    if f.min() >= 0 and f.max() <= 1:
                        na[k] = out.acc(np.round(f * 65535).astype(np.uint16), 'VEC2', True, ARRAY_BUFFER, key=('uv', ai)); quant = True
                    elif f.min() >= -1 and f.max() <= 1:
                        na[k] = out.acc(np.round(f * 32767).astype(np.int16), 'VEC2', True, ARRAY_BUFFER, key=('uv', ai)); quant = True
                    else:
                        na[k] = out.raw(js, bn, ai, ARRAY_BUFFER)
                elif k == 'JOINTS_0' and a['componentType'] != 5121:
                    j = get(js, bn, ai)
                    na[k] = out.acc(j.astype(np.uint8), 'VEC4', False, ARRAY_BUFFER, key=('j', ai)) if j.max() < 256 else out.raw(js, bn, ai, ARRAY_BUFFER)
                elif k == 'WEIGHTS_0' and a['componentType'] == 5126:
                    w = get(js, bn, ai, True)
                    w /= np.maximum(w.sum(1, keepdims=True), 1e-8)
                    q = np.round(w * 255).astype(np.int32)
                    fix = 255 - q.sum(1)
                    q[np.arange(len(q)), q.argmax(1)] += fix
                    na[k] = out.acc(q.astype(np.uint8), 'VEC4', True, ARRAY_BUFFER, key=('w', ai)); quant = True
                else:
                    na[k] = out.raw(js, bn, ai, ARRAY_BUFFER)
            pr['attributes'] = na
            if 'indices' in pr:
                idx = get(js, bn, pr['indices'])
                if idx.dtype == np.uint32 and idx.max() < 65536: idx = idx.astype(np.uint16)
                pr['indices'] = out.acc(idx.reshape(-1, 1), 'SCALAR', False, ELEMENT_ARRAY_BUFFER, key=('i', pr['indices']))
            if 'targets' in pr:
                pr['targets'] = [{k: out.raw(js, bn, ai, ARRAY_BUFFER) for k, ai in t.items()} for t in pr['targets']]
    for s in js.get('skins', []):
        if 'inverseBindMatrices' in s: s['inverseBindMatrices'] = out.raw(js, bn, s['inverseBindMatrices'])
    # animations
    if js.get('animations'):
        trans = [get(js, bn, sm['output'], True) for an in js['animations'] for ch, sm in ((c, an['samplers'][c['sampler']]) for c in an['channels']) if ch['target']['path'] == 'translation']
        unit = 100.0 if trans and np.median([np.abs(x).max() for x in trans]) > 5 else 1.0
        rest = opt.get('rest', {})   # bone name -> rest TRS of the rig these clips play on
        dropped = kept = 0
        for an in js['animations']:
            new_ch, new_sm = [], []
            for ch in an['channels']:
                sm = an['samplers'][ch['sampler']]
                path = ch['target']['path']
                node = js['nodes'][ch['target']['node']].get('name') if 'node' in ch['target'] else None
                interp = sm.get('interpolation', 'LINEAR')
                if interp == 'CUBICSPLINE' or path not in ('rotation', 'translation', 'scale'):
                    ia, oa = js['accessors'][sm['input']], js['accessors'][sm['output']]
                    s = {'input': out.pooled_acc(get(js, bn, sm['input']), ia['type'], ia.get('normalized', False), True),
                         'output': out.pooled_acc(get(js, bn, sm['output']), oa['type'], oa.get('normalized', False))}
                    if interp != 'LINEAR': s['interpolation'] = interp
                    new_sm.append(s); new_ch.append(dict(ch, sampler=len(new_sm) - 1)); continue
                t = get(js, bn, sm['input'], True)[:, 0]
                v = get(js, bn, sm['output'], True)
                tol = ROT_TOL if path == 'rotation' else POS_TOL * unit
                if path == 'rotation':
                    v = v / np.linalg.norm(v, axis=1, keepdims=True)
                    const = (2 * np.arccos(np.clip(np.abs(v @ v[0]), -1, 1))).max() <= tol
                else:
                    const = np.abs(v - v[0]).max() <= tol
                if const:            # one value held for the whole clip (exporters write these as STEP): keep 2 keys
                    t, v = t[[0, -1]], v[[0, 0]]
                elif interp == 'LINEAR':
                    t, v = reduce_keys(t, v, path, tol)
                # a track that never leaves the rig's rest pose does nothing: three.js blends a missing track
                # with the bone's original (rest) value, so the channel can go
                r = rest.get(node, {}).get(path)
                if r is not None:
                    r = np.asarray(r, dtype=np.float64)
                    if path == 'rotation':
                        r = r / np.linalg.norm(r)
                        err = (2 * np.arccos(np.clip(np.abs(v @ r), -1, 1))).max()
                    else:
                        err = np.abs(v - r).max()
                    if err <= tol:
                        dropped += 1; continue
                kept += 1
                s = {'input': out.pooled_acc(t.astype(np.float32).reshape(-1, 1), 'SCALAR', minmax=True, key=('t', t.astype(np.float32).tobytes()))}
                if path == 'rotation':
                    s['output'] = out.pooled_acc(np.round(np.clip(v, -1, 1) * 32767).astype(np.int16), 'VEC4', True); quant = True
                else:
                    s['output'] = out.pooled_acc(v.astype(np.float32), 'VEC3')
                if interp != 'LINEAR' and not const: s['interpolation'] = interp
                new_sm.append(s); new_ch.append(dict(ch, sampler=len(new_sm) - 1))
            an['channels'], an['samplers'] = new_ch, new_sm
        print(f'    {Path(src).name}: {kept} tracks kept, {dropped} rest-pose tracks dropped')
    out.finish()
    # images
    roles = texture_roles(js)
    webp = False
    for ii, im in enumerate(js.get('images', [])):
        if 'bufferView' in im:
            bv = js['bufferViews'][im['bufferView']]
            data = bn[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
            role = roles.get(ii, 'base')
            w = to_webp(data, role, opt['tex_max'][role])
            if len(w) < len(data) * 0.9:
                im['bufferView'], im['mimeType'] = out.view(w), 'image/webp'; webp = True
            else:
                im['bufferView'] = out.view(data)
        elif 'uri' in im and side_map is not None:
            name = os.path.basename(im['uri'])
            if name in side_map:
                im['uri'] = im['uri'][: -len(name)] + side_map[name]
                if side_map[name].endswith('.webp'):
                    im['mimeType'] = 'image/webp'; webp = True
    if webp:
        for t in js.get('textures', []):
            s = t.get('source')
            if s is None: continue
            img = js['images'][s]
            if img.get('mimeType') == 'image/webp' or img.get('uri', '').endswith('.webp'):
                t.pop('source')
                t.setdefault('extensions', {})['EXT_texture_webp'] = {'source': s}
    js['accessors'], js['bufferViews'] = out.accs, out.views
    js['buffers'] = [{'byteLength': len(out.buf)}] if out.buf else []
    for flag, name in ((quant, 'KHR_mesh_quantization'), (webp, 'EXT_texture_webp')):
        if flag:
            for key in ('extensionsUsed', 'extensionsRequired'):
                js.setdefault(key, [])
                if name not in js[key]: js[key].append(name)
    write_glb(dst, js, out.buf)


def side_textures(rel, out_fab, cap, glbs):
    """Dungeon pack: textures/<name>.jpg|png -> textures/<name>.webp; returns {old name: new name}"""
    roles = {}
    for g in glbs:
        js, _ = read_glb(g)
        r = texture_roles(js)
        for ii, im in enumerate(js.get('images', [])):
            if 'uri' in im:
                n = os.path.basename(im['uri'])
                if roles.get(n) != 'normal': roles[n] = r.get(ii, 'base')
    src_dir, dst_dir = ORIG / rel, out_fab / rel
    dst_dir.mkdir(parents=True, exist_ok=True)
    mapping, before, after = {}, 0, 0
    for f in sorted(src_dir.iterdir()):
        if f.suffix.lower() not in ('.jpg', '.jpeg', '.png'): continue
        data = f.read_bytes()
        role = roles.get(f.name, 'base')
        w = to_webp(data, role, cap[role])
        for old in (dst_dir / f.name,):
            if old.exists(): old.unlink()
        if len(w) < len(data) * 0.9:
            (dst_dir / (f.stem + '.webp')).write_bytes(w); mapping[f.name] = f.stem + '.webp'; after += len(w)
        else:
            (dst_dir / f.name).write_bytes(data); mapping[f.name] = f.name; after += len(data)
        before += len(data)
    print(f'  textures {before / 1048576:.2f} MB -> {after / 1048576:.2f} MB ({len(mapping)} files)')
    return mapping


def main():
    args = sys.argv[1:]
    out_fab = FAB
    if '--out' in args:
        k = args.index('--out'); out_fab = Path(args[k + 1]).resolve(); del args[k:k + 2]
    if not ORIG.exists():
        shutil.copytree(FAB, ORIG)
        print('backed up assets/fab ->', ORIG)
    def group_rel(base, opt):
        """files a group covers, relative to base (GLBs + side texture images, not our .webp outputs)"""
        rel = [Path(f) for f in opt.get('files', []) if (base / f).exists()]
        for pat in opt.get('glob', []):
            rel += [p.relative_to(base) for p in base.glob(pat)]
        if 'side_tex' in opt and (base / opt['side_tex']).exists():
            rel += [p.relative_to(base) for p in (base / opt['side_tex']).iterdir() if p.suffix.lower() in ('.jpg', '.jpeg', '.png')]
        return rel
    # a Fab file added to assets/fab/ after the backup (fab-pick) becomes an original too, so it gets packed
    for opt in GROUPS.values():
        for r in group_rel(FAB, opt):
            if not (ORIG / r).exists():
                (ORIG / r).parent.mkdir(parents=True, exist_ok=True); shutil.copy2(FAB / r, ORIG / r)
                print('new original:', r)
    if '--restore' in args:   # only the files this tool writes; golem files belong to tools/golem_pack.py
        n = 0
        for opt in GROUPS.values():
            for r in group_rel(ORIG, opt):
                d = FAB / r; d.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(ORIG / r, d); n += 1
                w = d.with_suffix('.webp')
                if 'side_tex' in opt and str(r).startswith(opt['side_tex']) and w.exists(): w.unlink()
        print(f'restored {n} files in assets/fab from {ORIG}'); return
    groups = [a for a in args if a in GROUPS] or list(GROUPS)
    for g in groups:
        opt = dict(GROUPS[g])
        if 'rest_from' in opt:
            rjs, _ = read_glb(ORIG / opt['rest_from'])
            opt['rest'] = {n['name']: {'translation': n.get('translation', [0, 0, 0]), 'rotation': n.get('rotation', [0, 0, 0, 1]),
                                       'scale': n.get('scale', [1, 1, 1])} for n in rjs['nodes'] if 'name' in n}
        files = [ORIG / f for f in opt.get('files', [])]
        for pat in opt.get('glob', []):
            files += sorted(ORIG.glob(pat))
        side = side_textures(opt['side_tex'], out_fab, opt['tex_max'], files) if 'side_tex' in opt else None
        before = after = 0
        for f in files:
            dst = out_fab / f.relative_to(ORIG)
            pack(f, dst, opt, side)
            before += f.stat().st_size; after += dst.stat().st_size
        print(f'{g}: {len(files)} glb {before / 1048576:.2f} MB -> {after / 1048576:.2f} MB')


main()

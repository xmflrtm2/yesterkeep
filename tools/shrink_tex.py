"""GLB 안에 들어 있는 텍스처를 작게 줄여 다시 담는다 (탑다운 카메라라 캐릭터 텍스처는 512면 충분).

    py -I tools\\shrink_tex.py 512 assets\\fab\\Polyart\\...\\SK_Female_Head.glb [더 많은 glb...]

- 그림 크기 줄이기는 Windows PowerShell의 System.Drawing으로 한다 (따로 설치할 것 없음).
- JPEG는 품질 85로, PNG(알파 있음)는 PNG 그대로 다시 저장한다.
- 원본은 D:\\FabAssets\\glb 라이브러리에 그대로 있으니, 다시 받으려면 fab-pick.ps1로 복사하면 된다.
"""
import base64, json, os, struct, subprocess, sys, tempfile
from pathlib import Path

JSON_CHUNK, BIN_CHUNK = 0x4E4F534A, 0x004E4942

PS = r'''
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing
$jobs = Get-Content -Raw -Encoding UTF8 $jobsPath | ConvertFrom-Json
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]85)
foreach ($j in $jobs) {
  $img = [System.Drawing.Image]::FromFile($j.src)
  $s = [Math]::Min(1.0, $j.max / [Math]::Max($img.Width, $img.Height))
  $w = [int][Math]::Max(1, [Math]::Round($img.Width * $s)); $h = [int][Math]::Max(1, [Math]::Round($img.Height * $s))
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'; $g.CompositingMode = 'SourceCopy'
  $g.DrawImage($img, 0, 0, $w, $h)
  if ($j.png) { $bmp.Save($j.dst, [System.Drawing.Imaging.ImageFormat]::Png) } else { $bmp.Save($j.dst, $jpeg, $ep) }
  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
}
'''


def read_glb(p):
    b = Path(p).read_bytes()
    off, js, bn = 12, None, b''
    while off < len(b):
        cl, ct = struct.unpack_from('<II', b, off); off += 8
        if ct == JSON_CHUNK: js = json.loads(b[off:off + cl])
        elif ct == BIN_CHUNK: bn = b[off:off + cl]
        off += cl
    return js, bn


def write_glb(p, js, bn):
    j = json.dumps(js, separators=(',', ':')).encode('utf-8')
    j += b' ' * (-len(j) % 4)
    bn += b'\0' * (-len(bn) % 4)
    total = 12 + 8 + len(j) + 8 + len(bn)
    with open(p, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<II', len(j), JSON_CHUNK)); f.write(j)
        f.write(struct.pack('<II', len(bn), BIN_CHUNK)); f.write(bn)


def main():
    size = int(sys.argv[1])
    tmp = Path(tempfile.mkdtemp(prefix='yk-tex-'))
    for path in sys.argv[2:]:
        js, bn = read_glb(path)
        before = os.path.getsize(path)
        jobs, views = [], {}
        for i, im in enumerate(js.get('images', [])):
            if 'bufferView' not in im: continue
            bv = js['bufferViews'][im['bufferView']]
            o = bv.get('byteOffset', 0)
            png = 'png' in im.get('mimeType', '')
            src = tmp / ('%d_src.%s' % (i, 'png' if png else 'jpg'))
            dst = tmp / ('%d_dst.%s' % (i, 'png' if png else 'jpg'))
            src.write_bytes(bn[o:o + bv['byteLength']])
            jobs.append({'src': str(src), 'dst': str(dst), 'max': size, 'png': png})
            views[im['bufferView']] = dst
        if not jobs: continue
        jf = tmp / 'jobs.json'; jf.write_text(json.dumps(jobs), encoding='utf-8')
        # .ps1 실행은 실행 정책에 막히므로 -EncodedCommand로 넘긴다
        cmd = "$jobsPath = '%s'\n%s" % (str(jf).replace("'", "''"), PS)
        enc = base64.b64encode(cmd.encode('utf-16-le')).decode('ascii')
        subprocess.run(['powershell', '-NoProfile', '-EncodedCommand', enc], check=True)
        # 버퍼를 다시 짠다: 그림 뷰는 줄인 바이트로, 나머지는 그대로
        out = bytearray()
        for k, bv in enumerate(js['bufferViews']):
            o = bv.get('byteOffset', 0)
            data = views[k].read_bytes() if k in views else bn[o:o + bv['byteLength']]
            out += b'\0' * (-len(out) % 4)
            bv['byteOffset'] = len(out); bv['byteLength'] = len(data)
            out += data
        js['buffers'][0]['byteLength'] = len(out)
        write_glb(path, js, bytes(out))
        print('%6d KB -> %6d KB  %s' % (before // 1024, os.path.getsize(path) // 1024, Path(path).name))


if __name__ == '__main__':
    main()

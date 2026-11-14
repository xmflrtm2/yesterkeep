"""itch 빌드(build/itch/web)를 직접 플레이 서버로 띄운다 — tools/play_server.py와 같은 API(/open /seq /key /shot …).

    py -I tools\\t4_build... 순서:  py -I tools\\build_itch.py  →  py -I tools\\t4_play_build.py 8154 <스크래치 폴더>

play_server.py는 이 게임 폴더를 띄운다. 빌드는 JS를 줄이고 src/dev/를 빼서, 실제로 올리는 파일로 해 봐야 한다 (11/15 T4 2차).
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
WEB = os.path.join(os.path.dirname(HERE), 'build', 'itch', 'web')
if not os.path.isfile(os.path.join(WEB, 'index.html')):
    sys.exit('build/itch/web is missing: run py -I tools\\build_itch.py first')
import play_server  # noqa: E402  (sys.argv의 포트·폴더를 그대로 읽는다)
import asyncio  # noqa: E402

play_server.GAME = WEB  # main()이 이 값으로 정적 서버를 연다
asyncio.run(play_server.Play().main())

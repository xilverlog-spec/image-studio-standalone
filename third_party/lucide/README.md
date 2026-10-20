# Lucide 아이콘 (일부)

- 출처: https://lucide.dev — npm `lucide-static` **1.59.0** (2026-10-20 내려받음, unpkg 에서 아이콘 파일만 개별 다운로드)
- 라이선스: **ISC** (일부 아이콘은 Feather 에서 온 **MIT**) — 전문은 같은 폴더의 `LICENSE`. 복제·수정·배포 모두 가능하고, 저작권 고지와 이 허가문을 함께 두어야 한다.
- 쓰는 방법: `icons/*.svg` 는 원본 그대로이고, `node scripts/tools/gen_iconset.mjs` 가 `src/conceptDiagram/iconset.js`(앱이 읽는 데이터)를 만든다.
- 아이콘을 더하려면: 같은 버전(또는 새 버전)에서 파일을 받아 `icons/` 에 넣고 `scripts/tools/gen_iconset.mjs` 의 목록에 한 줄 추가 → 다시 실행.

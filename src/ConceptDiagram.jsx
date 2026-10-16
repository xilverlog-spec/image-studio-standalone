import React, { useState, useMemo, useRef, useEffect } from 'react';
import { DIAGRAM_TYPES, EXAMPLE_SPECS, buildConceptPrompt, parseJsonLoose, renderSpec, getTextFields, setByPath } from './conceptDiagram/spec';
import { SUBJECT_KINDS, buildReadPrompt, normalizeRead, readToPreview, buildSubjectPrompt, mergeSiteGeometry, aspectFixShapes, groundOf, pickConsensusRead, buildSubjectClassifyPrompt, normalizeSubjectType, routeSubject, SUBJECT_TYPE_LABEL } from './conceptDiagram/subject';
import { checkCoverage } from './conceptDiagram/coverage';
import { buildSketchReadPrompt, normalizeSketchRead, pickConsensusSketch, fuseSketchReads, applySketchRefine, buildSketchAnnotatePrompt, makeSketchSpec, buildFreeformPrompt, normalizeFreeformRead, makeFreeformSpec, buildAxonPrompt, normalizeAxonRead, makeAxonSpec, makeEditSpec, renderSketch } from './conceptDiagram/sketch';

// 손스케치 읽기 결과 저장: 같은 그림을 다시 읽을 때 AI 를 다시 부르지 않는다(무료 Gemini 한도 절약). 최근 8개만, 이 브라우저에만 저장한다
const SK_CACHE_KEY = 'sketchReadCache.v2'; // v2: 이전 빌드(보정 알고리즘이 달랐던 때)에 저장된 낡은 읽기 결과는 쓰지 않는다
const hashStr = (str) => { let h1 = 0x811c9dc5; let h2 = 5381; for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = (Math.imul(h2, 33) + c) | 0; } return `${str.length}:${h1 >>> 0}:${h2 >>> 0}`; }; // 글자 전체를 본다(일부만 보면 서로 다른 그림이 같은 저장값으로 잡힐 수 있다)
const skCacheGet = (k) => { try { const m = JSON.parse(localStorage.getItem(SK_CACHE_KEY) || '{}'); return m[k]?.v || null; } catch { return null; } };
const skCachePut = (k, v) => {
  try {
    const m = JSON.parse(localStorage.getItem(SK_CACHE_KEY) || '{}'); m[k] = { v, t: Date.now() };
    const keep = Object.keys(m).sort((a, b) => m[b].t - m[a].t).slice(0, 8); const out = {}; keep.forEach((x) => { out[x] = m[x]; });
    localStorage.setItem(SK_CACHE_KEY, JSON.stringify(out));
  } catch { /* 저장 공간이 없거나 막혀 있으면 저장 없이 진행 */ }
};
import SketchEditor from './SketchEditor';

// 다이어그램 만들기 — 입력은 두 가지뿐: (1) 텍스트만, (2) 참고 이미지 + 텍스트.
// AI는 구조(JSON)만 정하고 그리기는 코드가 한다(글자 깨짐 없음, SVG 출력). 유료 API와 무관하게 동작한다.
// 유료 LLM을 붙이면 AI_MODELS 에 추가하면 된다.

const AI_MODELS = [
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (무료 · 도면 읽기가 더 정확, 느림)' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini Flash-Lite (무료 · 빠름)' },
];
const MAX_REF_EDGE = 1600;

const inputBase = {
  padding: '7px 9px', borderRadius: '6px', border: '1px solid var(--border-color)',
  background: 'rgba(255,255,255,0.85)', color: 'var(--text-primary)', fontSize: '12.5px', width: '100%', boxSizing: 'border-box',
};
const btn = (primary, disabled) => ({
  padding: '9px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
  border: primary ? '1px solid var(--accent-cyan)' : '1px solid var(--border-color)',
  background: primary ? 'rgba(51,51,153,0.12)' : 'rgba(255,255,255,0.8)',
  color: primary ? 'var(--accent-cyan)' : 'var(--text-secondary)',
});
const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };
const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const readResizedPng = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
  fr.onload = () => {
    const img = new Image();
    img.onerror = () => reject(new Error('이미지 형식을 읽지 못했습니다.'));
    img.onload = () => {
      const k = Math.min(1, MAX_REF_EDGE / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
    };
    img.src = String(fr.result);
  };
  fr.readAsDataURL(file);
});

// 위치를 정확히 읽게 하려고 이미지 위에 10% 간격 붉은 눈금(0~100)을 그려서 AI에게 보낸다(화면에 보이는 이미지는 그대로)
const withGrid = (dataUrl) => new Promise((resolve) => {
  const img = new Image();
  img.onerror = () => resolve(dataUrl);
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const fs = Math.max(11, Math.round(Math.min(img.width, img.height) / 55));
    ctx.font = `bold ${fs}px sans-serif`; ctx.lineWidth = Math.max(1, Math.round(fs / 12));
    for (let i = 0; i <= 10; i++) {
      const x = (img.width * i) / 10; const y = (img.height * i) / 10;
      ctx.strokeStyle = 'rgba(220,38,38,0.55)'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, img.height); ctx.moveTo(0, y); ctx.lineTo(img.width, y); ctx.stroke();
      ctx.fillStyle = 'rgba(220,38,38,0.95)';
      ctx.fillText(String(i * 10), Math.min(img.width - fs * 1.6, x + 2), fs + 1);
      ctx.fillText(String(i * 10), 2, Math.min(img.height - 3, y + fs));
    }
    resolve(c.toDataURL('image/png'));
  };
  img.src = dataUrl;
});

const BOX_FIELDS = [
  ['x', '위치 X', '→ 방향(오른쪽 아래)으로 이동', 0.5, -50],
  ['y', '위치 Y', '← 방향(왼쪽 아래)으로 이동', 0.5, -50],
  ['z', '띄움 Z', '바닥에서 띄운 높이(0이면 바닥에 붙음)', 0.5, 0],
  ['w', '길이 W', '→ 방향 길이', 0.5, 0.5],
  ['d', '깊이 D', '← 방향 길이', 0.5, 0.5],
  ['h', '높이 H', '위쪽 높이', 0.5, 0.5],
];
const round1 = (v) => Math.round(v * 10) / 10;

// 읽은 건물 형태(박스)를 직접 고치는 편집기: 박스를 고르고 위치·크기를 바꾸거나, 박스를 추가·복제·삭제한다.
function BoxEditor({ boxes, selected, onSelect, onChange, onReset, disabled }) {
  const sel = boxes[selected];
  const setField = (k, v, min) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    onChange(boxes.map((b, i) => (i === selected ? { ...b, [k]: round1(Math.max(min, n)) } : b)));
  };
  const add = () => {
    const last = boxes[boxes.length - 1] || { x: 0, y: 0, z: 0, w: 2, d: 2, h: 2 };
    const nb = { x: round1(last.x + last.w + 0.5), y: last.y, z: 0, w: 2, d: 2, h: 2 };
    onChange([...boxes, nb], boxes.length);
  };
  const dup = () => { if (sel) onChange([...boxes, { ...sel, x: round1(sel.x + 0.5), y: round1(sel.y + 0.5) }], boxes.length); };
  const del = () => { if (sel && boxes.length > 1) onChange(boxes.filter((_, i) => i !== selected), Math.max(0, selected - 1)); };
  const small = { ...btn(false, disabled), padding: '5px 8px', fontSize: 12 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.7)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>✏️ 읽은 박스 고치기 (오른쪽 그림에 바로 반영)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {boxes.map((_, i) => (
          <button key={i} style={{ ...small, ...(i === selected ? { background: 'rgba(232,131,58,0.22)', borderColor: '#E8833A', color: '#B45309' } : {}) }} disabled={disabled} onClick={() => onSelect(i)}>{i + 1}번</button>
        ))}
        <button style={small} disabled={disabled} onClick={add} title="새 박스 추가">＋ 추가</button>
      </div>
      {sel && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {BOX_FIELDS.map(([k, label, tip, step, min]) => (
              <label key={k} title={tip} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--text-tertiary, #64748b)' }}>
                {label}
                <input type="number" step={step} min={min} value={sel[k]} disabled={disabled} onChange={(e) => setField(k, e.target.value, min)} style={{ ...inputBase, padding: '4px 6px' }} />
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={small} disabled={disabled} onClick={dup}>복제</button>
            <button style={small} disabled={disabled || boxes.length < 2} onClick={del}>삭제</button>
            <button style={{ ...small, marginLeft: 'auto' }} disabled={disabled} onClick={onReset} title="AI가 처음 읽은 값으로 되돌립니다">되돌리기</button>
          </div>
        </>
      )}
      <p style={{ fontSize: 10.5, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.45 }}>
        단위는 칸(모듈)입니다. 숫자 칸의 ▲▼로 0.5씩 바꿀 수 있습니다. 고른 박스는 주황색으로 보입니다. 다 고치면 ② 다이어그램 만들기를 누르세요.
      </p>
    </div>
  );
}

export default function ConceptDiagram({ addToast, apiFetch }) {
  const [userText, setUserText] = useState('');
  const [subjectImage, setSubjectImage] = useState(null); // 소재 이미지: 이 이미지의 건물·대지·도면을 다이어그램으로
  const [subjectUse, setSubjectUse] = useState('read'); // 'read' = 형태를 읽어서 다시 그림 / 'asis' = 이미지를 그대로 바탕에 깔기
  const [styleImage, setStyleImage] = useState(null); // 스타일 참고 이미지: 이런 느낌·구성으로
  const [forcedType, setForcedType] = useState('auto');
  const [model, setModel] = useState(AI_MODELS[0].id);
  const [busy, setBusy] = useState(false);
  const [staleText, setStaleText] = useState(false); // 소재 이미지를 바꿨는데 설명이 이전 그림에 쓴 것 그대로일 때
  const [genError, setGenError] = useState('');       // 마지막 생성/읽기 실패 사유(실패하면 이전 그림이 그대로 보이므로 화면에 계속 알린다)
  const [result, setResult] = useState(null); // { type, spec, baseImage? }
  const [subjectKind, setSubjectKind] = useState('auto');
  const [autoKind, setAutoKind] = useState(null);     // 자동 판단이 정한 읽기 방식(손스케치·분석 축측도 …)
  const [autoInfo, setAutoInfo] = useState(null);     // 자동 판단 근거 { type, reason }
  const [read, setRead] = useState(null); // 소재 이미지에서 읽은 구조
  const effKind = subjectKind === 'auto' ? (autoKind || (read?.kind && SUBJECT_KINDS[read.kind] ? read.kind : '')) : subjectKind; // 화면 안내에 쓰는 '지금 적용되는' 종류
  const [reading, setReading] = useState(false);
  // 분석 축측도 옵션: 남쪽 방향(도면에서 어느 쪽인지), 벽 높이, 시점(평면을 돌리는 각도)
  const [axonSouth, setAxonSouth] = useState('bottom'); const [axonHeight, setAxonHeight] = useState(0.04); const [axonRot, setAxonRot] = useState(-15); const [axonTexture, setAxonTexture] = useState(true);
  const [axonNote, setAxonNote] = useState(null); // 참고 이미지에서 읽은 구성(그릴 수 있는 것 / 못 그리는 것)
  // 유료 '정밀 읽기' 사용 가능 여부(서버 .env 에 결제 연결된 키·모델이 있을 때만 버튼이 나타난다)
  const [paidVision, setPaidVision] = useState({ available: false });
  // 유료 이미지 생성 공급자(키가 있는 것만)와 누적 사용액. 키가 없으면 유료 버튼은 아예 나타나지 않는다
  const [paidImg, setPaidImg] = useState({ providers: [], usage: null }); const [paidProvider, setPaidProvider] = useState(''); const [paidImgBusy, setPaidImgBusy] = useState(false);
  const [axonVector, setAxonVector] = useState(null); // 유료로 매끈하게 다시 그리기 전의 벡터 결과(되돌리기용)
  const [editAvail, setEditAvail] = useState(null);  // 서버에 'AI 이미지 편집(Qwen)' 환경이 있는지(없으면 자동 판단이 평면 다이어그램으로 대신한다)
  const [editProg, setEditProg] = useState(null);    // 진행 중인 AI 이미지 편집 { stage, percent, sec }
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);
  const paidStepRef = useRef(false); // 이번 '만들기'의 AI 단계를 상위 유료 모델로 부를지
  const refreshPaid = () => {
    apiFetch('/v1/paid/vision-status').then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) setPaidVision(j); }).catch(() => {});
    apiFetch('/v1/image/options').then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) { const ps = (j.paid_providers || []).filter((p) => p.available); setPaidImg({ providers: ps, usage: j.paid_usage || null }); setPaidProvider((cur) => (ps.some((p) => p.id === cur) ? cur : ps[0]?.id || '')); } }).catch(() => {});
  };
  useEffect(() => { refreshPaid(); apiFetch('/v1/image/diagram-edit/options').then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) setEditAvail(j); }).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [readOrig, setReadOrig] = useState(null); // AI 가 처음 읽은 값(편집 되돌리기용)
  const [selBox, setSelBox] = useState(0);
  const subjectFileRef = useRef(null);
  const styleFileRef = useRef(null);

  const rendered = useMemo(() => {
    if (!result) return null;
    try { return { ...renderSpec(result.type, result.spec, result.baseImage ? { baseImage: result.baseImage } : undefined), error: null }; }
    catch (e) { return { svg: '', width: 0, height: 0, error: e.message }; }
  }, [result]);

  const fields = useMemo(() => (result ? getTextFields(result.type, result.spec) : []), [result]);
  // 요청 반영 점검: 요청에서 뽑은 핵심 항목이 결과의 글(제목·칩·주석)에 들어 있는지(글자 수정도 바로 반영)
  const coverage = useMemo(() => (result && !result.isReadPreview && userText.trim() ? checkCoverage(userText, fields.map((f) => f.value)) : []), [result, fields, userText]);
  const readMode = !!subjectImage && subjectUse === 'read';
  const asisMode = !!subjectImage && subjectUse === 'asis';
  const canGenerate = !busy && !reading && !!(userText.trim() || subjectImage || styleImage);

  // 소재 이미지를 바꾸거나 지우면, 이전 이미지로 만든 그림은 지우고 설명이 이전 그림용으로 남았다고 알린다
  const dropOldResult = () => {
    if (result && (result.type === 'sketch' || result.isReadPreview)) { setResult(null); if (userText.trim()) setStaleText(true); }
    setGenError('');
  };
  const pickSubject = async (file) => {
    if (!file) return;
    try { setSubjectImage(await readResizedPng(file)); setRead(null); setAutoKind(null); setAutoInfo(null); setAxonNote(null); setAxonVector(null); dropOldResult(); }
    catch (e) { addToast?.('error', '이미지 불러오기 실패', e.message); }
  };
  const pickStyle = async (file) => {
    if (!file) return;
    try { setStyleImage(await readResizedPng(file)); if (subjectKind === 'auto' && (autoKind === 'plan' || autoKind === 'axon' || autoKind === 'edit')) { setRead(null); setAutoKind(null); setAutoInfo(null); } } // 참고 이미지를 나중에 넣으면 평면도의 자동 판단(평면 다이어그램/분석 축측도)을 다시 한다
    catch (e) { addToast?.('error', '이미지 불러오기 실패', e.message); }
  };

  const toB64 = (img) => img.split(',').pop();
  const callAI = async (content, images = [], opts = {}) => {
    const res = await apiFetch('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: 16000, temperature: 0.35, ...(opts.paid ? { paid: true } : {}),
        messages: [{ role: 'user', content, ...(images.length ? { images: images.map(toB64) } : {}) }],
      }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
    const data = await res.json();
    return parseJsonLoose(data.choices?.[0]?.message?.content);
  };

  const imgDims = (src) => new Promise((resolve) => { const im = new Image(); im.onload = () => resolve([im.width, im.height]); im.onerror = () => resolve(null); im.src = src; });

  // 자유 해석: 평면 도면이 아닌 그림(입체·수채·사진 등)을 틀 없이 이해해서 요소(고정/가변)와 움직임(회전·이동·흐름)으로 읽는다(AI 호출 1회).
  // 설명(1번)이 읽을 때 쓰이므로 설명이 바뀌면 새로 읽는다
  const readFreeform = async ({ fresh = false, paid = false, notice = '' } = {}) => {
    const ask = askText();
    const cacheKey = `ff:${hashStr(subjectImage)}:${hashStr(ask)}${paid ? ':paid' : ''}`;
    let rd = fresh ? null : skCacheGet(cacheKey);
    if (rd) { rd = { ...rd, fromCache: true }; addToast?.('success', '저장된 읽기 결과를 사용했습니다', '같은 그림·같은 설명이라 AI 를 다시 부르지 않았습니다. 새로 읽으려면 "새로 읽기"를 누르세요.'); }
    else {
      const dims = await imgDims(subjectImage); let last = null;
      for (let k = 0; k < 2 && !rd; k++) {
        try { rd = { ...normalizeFreeformRead(await callAI(buildFreeformPrompt(ask), [subjectImage], paid ? { paid: true } : {}), dims), askedText: ask }; } catch (e) { last = e; if (paid) break; }
      }
      if (!rd) throw last || new Error('스케치를 읽지 못했습니다.');
      skCachePut(cacheKey, rd);
      addToast?.('success', paid ? '정밀 읽기(유료)로 읽었습니다' : '그림을 해석했습니다', `${notice}${rd.summary || SUBJECT_KINDS.freeform}`);
    }
    setRead(rd); setReadOrig(rd); setSelBox(0);
    setResult({ type: 'sketch', spec: makeFreeformSpec(rd), isReadPreview: true, ver: Date.now() });
    return rd;
  };

  // 이미지 종류 자동 판별: AI 가 한 번 보고(무료, 결과 저장) 알맞은 읽기 방식으로 보낸다. 실패하면 null → 예전 자동 읽기로 대체
  const resolveAutoKind = async () => {
    const key = `cls:${hashStr(subjectImage)}`; let info = skCacheGet(key);
    if (!info) {
      try { info = normalizeSubjectType(await callAI(buildSubjectClassifyPrompt(), [subjectImage])); skCachePut(key, info); }
      catch { return null; }
    }
    let kind = routeSubject(info.type, { hasRef: !!styleImage, text: userText });
    if (kind === 'edit' && editAvail && editAvail.available === false) { kind = 'plan'; addToast?.('info', 'AI 이미지 편집 환경이 이 서버에 없어 평면 다이어그램으로 만듭니다', '동선·구역 표시는 큰 도면에서 품질이 떨어질 수 있습니다.'); }
    setAutoKind(kind); setAutoInfo(info);
    addToast?.('success', `이미지를 "${SUBJECT_TYPE_LABEL[info.type]}"로 판단했습니다`, `${SUBJECT_KINDS[kind]} 방식으로 ${kind === 'edit' ? '그립니다(무료, 약 3~6분)' : '읽습니다'}. ${info.reason} (바꾸려면 아래 "이미지 종류 직접 지정")`);
    return kind;
  };

  // 분석 축측도: 내 평면 도면의 벽을 이미지에서 직접 뽑아 입체로 세운다(서버, AI 없음, 1초 안팎)
  const fetchAxon = async () => {
    const res = await apiFetch('/v1/image/plan-axon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_base64: subjectImage.split(',').pop(), rot: axonRot, height: axonHeight, texture: axonTexture }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
    const j = await res.json(); return { svg: j.svg, vb: j.vb, proj: j.proj, plan_size: j.plan_size, opts: { rot: axonRot, height: axonHeight, texture: axonTexture } };
  };

  // 소재 이미지 읽기: 구조로 읽고, 읽은 모습을 바로 보여 준다
  const readImage = async (opts) => {
    if (!subjectImage || reading) return null;
    const fresh = !!(opts && opts.fresh === true); // '다시 읽기' 버튼은 저장된 결과를 쓰지 않고 새로 읽는다
    const paid = !!(opts && opts.paid === true);   // '정밀 읽기(유료)': 상위 모델로 한 번만 읽는다(무료로 몰래 대체하지 않는다)
    setReading(true);
    try {
      let kind = subjectKind; let autoRouted = false;
      if (kind === 'auto') { // 종류를 고르지 않았으면 AI 가 한 번 보고 정한다(실패하면 예전 자동 읽기)
        const k0 = await resolveAutoKind(); if (k0) { kind = k0; autoRouted = true; }
      }
      if (kind === 'edit') { // 미리 읽을 것이 없다: '다이어그램 만들기'를 누르면 서버가 도면을 보고 지시문을 쓰고 직접 그린다
        const rd = { kind: 'edit', summary: 'AI 이미지 편집 방식입니다. 도면의 선·글자는 원본 그대로 두고 색과 동선만 얹습니다(무료, 약 3~6분).', askedText: null };
        setRead(rd); setReadOrig(rd); setSelBox(0); addToast?.('info', '이 방식은 미리 읽기가 없습니다', '“다이어그램 만들기”를 누르면 서버가 도면을 보고 직접 그립니다(약 3~6분).'); return rd;
      }
      const useGrid = kind !== 'form' && kind !== 'sketch' && kind !== 'freeform' && kind !== 'axon'; // 손스케치는 눈금 없이 원본 그대로 읽는 편이 위치가 훨씬 정확하다(시험: 도형 겹침 0.46 → 0.85)
      const gridded = useGrid ? await withGrid(subjectImage) : subjectImage;
      if (kind === 'axon') { // 입체 바탕만 먼저 보여 준다(바람·일조 표시와 문구는 '다이어그램 만들기'에서 AI 가 정한다)
        let ax = null;
        try { ax = await fetchAxon(); } catch (e) { if (!autoRouted) throw e; kind = 'plan'; setAutoKind('plan'); addToast?.('info', '벽을 뽑지 못해 평면 다이어그램으로 읽습니다', e.message); }
      if (ax) {
        const rd = { kind: 'axon', axon: ax, title: '', subs: [], winds: [], sun: null, referenceParts: [], unsupported: [], askedText: null };
        setRead(rd); setReadOrig(rd); setSelBox(0); setResult({ type: 'sketch', spec: makeAxonSpec(rd), isReadPreview: true, ver: Date.now() });
        addToast?.('success', '입체 바탕을 만들었습니다', '도면의 벽을 뽑아 입체로 세웠습니다. 바람·일조 표시와 문구는 "다이어그램 만들기"에서 붙입니다.'); return rd;
      }
      }
      if (kind === 'freeform') { const rd = await readFreeform({ fresh, paid }); if (paid) apiFetch('/v1/paid/vision-status').then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) setPaidVision(j); }).catch(() => {}); return rd; }
      if (kind === 'sketch') { // 손스케치: 해석하지 않고 그려진 도형을 있는 그대로 읽고, 읽은 모습을 바로 편집 가능한 상태로 보여 준다
        const cacheKey = hashStr(subjectImage);
        const forceSketch = !!(opts && opts.forceSketch === true); // '평면 스케치로 다시 읽기': 입체 그림으로 판단돼 자유 해석으로 읽던 것을 되돌린다
        if (forceSketch) skCachePut(`${cacheKey}:view3d`, false);
        else if (skCacheGet(`${cacheKey}:view3d`)) return await readFreeform({ fresh, paid, notice: '입체·채색 그림이라 자유 해석으로 읽었습니다. ' });
        const cached = fresh ? null : (skCacheGet(`${cacheKey}:paid`) || skCacheGet(cacheKey)); // 정밀 읽기로 읽은 적이 있으면 그것을 우선
        if (cached) { const cr = { ...cached, fromCache: true }; setRead(cr); setReadOrig(cr); setSelBox(0); setResult({ type: 'sketch', spec: makeSketchSpec(cached, null), isReadPreview: true, ver: Date.now() }); addToast?.('success', '저장된 읽기 결과를 사용했습니다', '같은 그림이라 AI 를 다시 부르지 않았습니다. 새로 읽으려면 "새로 읽기"를 누르세요.'); return cr; }
        // 사진 정리(백엔드): EXIF 방향·기울어짐을 바로잡고 그림 영역만 잘라 읽기 좋은 크기로 만든다. AI 읽기와 잉크 보정이 같은 정리 이미지를 쓰므로 좌표 변환이 필요 없다. 실패하면 원본 그대로
        let work = subjectImage; let prepInfo = null;
        try {
          const pr = await apiFetch('/v1/image/sketch-prepare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_base64: subjectImage.split(',').pop() }) });
          if (pr.ok) { const pj = await pr.json(); if (pj.image_base64) { work = `data:image/png;base64,${pj.image_base64}`; prepInfo = pj.info || null; } }
        } catch { /* 정리 없이 원본으로 읽는다 */ }
        const dims = await imgDims(work);
        // 같은 스케치를 3번 동시에 읽어 중앙값으로 합치고(한 번 크게 빗나간 읽기에 휘둘리지 않게), 실패한 읽기는 다시 시도해 최소 2개를 확보한다. (무료 Gemini 한도를 아끼려고 3회로 제한)
        let skErr = null;
        const one = async () => { try { return normalizeSketchRead(await callAI(buildSketchReadPrompt(), [work]), dims); } catch (e) { skErr = e; return null; } };
        let reads;
        if (paid) { // 유료 정밀 읽기: 상위 모델 한 번(실패하면 사유를 그대로 보여 주고 무료로 대체하지 않는다). 잉크 보정은 그대로 한다
          reads = [normalizeSketchRead(await callAI(buildSketchReadPrompt(), [work], { paid: true }), dims)];
        } else {
          // 첫 읽기 하나로 그림의 종류(평면 도면 / 입체·채색 그림)를 먼저 확인한다. 입체·채색 그림이면 나머지 읽기를 하지 않고 자유 해석으로 넘어간다(한도 절약)
          let first = null;
          for (let k = 0; k < 3 && !first; k++) first = await one();
          if (!first) throw skErr || new Error('스케치를 읽지 못했습니다.');
          reads = [first];
          if (first.view !== '3d') {
            reads = [...reads, ...(await Promise.all([one(), one()])).filter(Boolean)];
            for (let k = 0; k < 2 && reads.length < 2; k++) reads = [...reads, ...(await Promise.all([one(), one()])).filter(Boolean)];
          }
        }
        if (reads.filter((r) => r.view === '3d').length * 2 > reads.length) { // 입체·채색 그림: 평면 도면용 읽기는 맞지 않는다
          skCachePut(`${cacheKey}:view3d`, true);
          return await readFreeform({ fresh, paid, notice: '입체·채색 그림이라 자유 해석으로 읽었습니다. ' });
        }
        let sk = fuseSketchReads(reads, pickConsensusSketch(reads));
        if (!sk) throw skErr || new Error('스케치를 읽지 못했습니다.');
        try { // AI 가 눈대중으로 준 도형 경계·화살표 꼬리를 실제 잉크 위치에 맞춘다(실패하면 AI 값 그대로)
          const rr = await apiFetch('/v1/image/sketch-refine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_base64: work.split(',').pop(), blocks: sk.blocks.map((b) => ({ id: b.id, rect: b.rect, hatched: b.hatched })), arrows: sk.lines.filter((l) => l.kind === 'arrow').map((l) => ({ id: l.id, pts: l.pts, color: l.color })), arcs: sk.lines.filter((l) => l.kind === 'arc').map((l) => ({ id: l.id, pts: l.pts, color: l.color })), flow_hint: sk.lines.filter((l) => l.kind === 'flow').length }) });
          if (rr.ok) sk = applySketchRefine(sk, await rr.json());
        } catch { /* 보정 없이 사용 */ }
        skCachePut(paid ? `${cacheKey}:paid` : cacheKey, sk);
        setRead(sk); setReadOrig(sk); setSelBox(0);
        setResult({ type: 'sketch', spec: makeSketchSpec(sk, null), isReadPreview: true, ver: Date.now() });
        addToast?.('success', paid ? '정밀 읽기(유료)로 읽었습니다' : '스케치를 읽었습니다', `${sk.summary || SUBJECT_KINDS.sketch}${prepInfo?.cropped ? ' (사진에서 그림 부분만 잘라 읽었습니다)' : ''}`);
        if (paid) apiFetch('/v1/paid/vision-status').then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) setPaidVision(j); }).catch(() => {}); // 오늘 사용액 갱신
        return sk;
      }
      let r = null; let lastErr = null;
      for (let attempt = 0; attempt < 2 && !r; attempt++) { // 잘못 읽히면(뭉개짐 등) 한 번 더 읽는다
        try { r = normalizeRead(await callAI(buildReadPrompt(kind, { grid: useGrid }), [gridded]), kind); }
        catch (e) { lastErr = e; }
      }
      if (!r) throw lastErr;
      if (r.kind === 'form') { // 건물 형태는 읽을 때마다 조금씩 달라지므로 두 번 더 읽어서 서로 가장 일치하는 결과를 쓴다(엉뚱하게 읽힌 한 번에 휘둘리지 않게)
        const more = await Promise.all([0, 1].map(async () => {
          try { return normalizeRead(await callAI(buildReadPrompt('form', { grid: useGrid }), [gridded]), 'form'); } catch { return null; }
        }));
        r = pickConsensusRead([r, ...more.filter(Boolean)]);
      }
      if (r.kind === 'plan') { // 평면도: AI 좌표는 가로·세로를 따로 0~100 으로 주므로 가로세로 비율만 바로잡는다(방 모양은 AI 가 읽은 직사각형 그대로)
        try {
          const dim = await new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve([im.width, im.height]); im.onerror = reject; im.src = subjectImage; });
          r = { ...r, shapes: aspectFixShapes(r.shapes, dim[0], dim[1]) };
        } catch { /* 비율 보정 없이 사용 */ }
      }
      if (r.kind === 'site') { // 배치도면 건물·대지 윤곽은 AI 눈대중 대신 이미지 분석으로 원본 모양 그대로 따온다(실패하면 AI가 읽은 모양을 그대로 씀)
        try {
          const res = await apiFetch('/v1/image/site-extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_base64: subjectImage.split(',').pop() }) });
          const cv = res.ok ? await res.json() : null;
          if (cv && Array.isArray(cv.buildings) && cv.buildings.length >= 2) r = mergeSiteGeometry(r, cv);
        } catch { /* AI 읽기 결과 사용 */ }
      }
      setRead(r); setReadOrig(r); setSelBox(0);
      const pv = readToPreview(r, r.kind === 'form' ? 0 : -1);
      renderSpec(pv.type, pv.spec);
      setResult({ ...pv, isReadPreview: true });
      addToast?.('success', '이미지를 읽었습니다', r.summary || SUBJECT_KINDS[r.kind]);
      return r;
    } catch (e) {
      setRead(null);
      addToast?.('error', '이미지 읽기 실패', e.message); setGenError(`이미지 읽기 실패: ${e.message}`);
      return null;
    } finally {
      setReading(false);
    }
  };

  // 소재 이미지를 읽은 구조 + (있으면) 스타일 참고 이미지로 다이어그램 생성
  const generateFromRead = async (read) => {
    if (read.kind === 'axon') { // 입체 바탕(옵션이 바뀌었으면 다시 만들고) + AI 가 바람·일조·문구를 정한다
      let ax = read.axon; if (ax.opts && (ax.opts.rot !== axonRot || ax.opts.height !== axonHeight || ax.opts.texture !== axonTexture)) ax = await fetchAxon();
      const imgs = [subjectImage, ...(styleImage ? [styleImage] : [])]; let rd = null; let last = null;
      const po = paidStepRef.current ? { paid: true } : {}; // 유료로 만들기: 바람·일조·문구를 정하는 AI 단계를 상위 모델로
      for (let k = 0; k < (paidStepRef.current ? 1 : 2) && !rd; k++) { try { rd = normalizeAxonRead(await callAI(buildAxonPrompt(askText(), { south: axonSouth, hasRef: !!styleImage }), imgs, po), ax); } catch (e) { last = e; } }
      if (!rd) throw last || new Error('분석 표시를 읽지 못했습니다.');
      setRead({ ...rd, askedText: askText() }); setAxonNote({ parts: rd.referenceParts, unsupported: rd.unsupported, empty: !userText.trim() });
      return { type: 'sketch', spec: makeAxonSpec(rd), ver: Date.now() };
    }
    if (read.kind === 'freeform') { // 읽을 때 이미 설명을 반영했으므로 그대로 그린다(설명을 바꿨으면 새 설명으로 다시 읽는다)
      const rd = read.askedText === askText() ? read : await readFreeform({ fresh: true });
      return { type: 'sketch', spec: makeFreeformSpec(rd), ver: Date.now() };
    }
    if (read.kind === 'sketch') {
      let ann;
      const po = paidStepRef.current ? { paid: true } : {}; // 유료로 만들기: 이름·설명·바람 방향 정하기를 상위 모델로(실패하면 무료로 몰래 바꾸지 않고 사유를 보여 준다)
      try { ann = await callAI(buildSketchAnnotatePrompt(read, askText()), [], po); }
      catch (e1) { if (paidStepRef.current) throw e1; ann = await callAI(buildSketchAnnotatePrompt(read, askText()), []); } // 응답을 해석하지 못하면 한 번 더(무료일 때만)
      return { type: 'sketch', spec: makeSketchSpec(read, ann), ver: Date.now() };
    }
    const askPrompt = buildSubjectPrompt(read, askText(), !!styleImage);
    let parsed;
    try { parsed = await callAI(askPrompt, styleImage ? [styleImage] : []); }
    catch { parsed = await callAI(askPrompt, styleImage ? [styleImage] : []); } // 응답을 해석하지 못하면(JSON 깨짐 등) 한 번 더 요청한다
    if (read.kind === 'form') {
      const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
      if (!steps.length) throw new Error('단계가 비어 있습니다.');
      // 마지막 단계는 읽은 형태 그대로(AI가 형태를 바꾸지 못하게 고정)
      const last = steps[steps.length - 1];
      last.ground = read.form.ground;
      last.boxes = read.form.boxes.map((b) => ({ ...b }));
      steps.forEach((st) => { if (!st.ground) st.ground = read.form.ground; });
      return { type: 'massing', spec: { title: parsed.title || '', accent: parsed.accent, steps } };
    }
    if (read.kind === 'site') {
      return { type: 'site', spec: { title: parsed.title || '', siteBase: { shapes: read.shapes }, panels: Array.isArray(parsed.panels) ? parsed.panels : [] } };
    }
    return { type: 'layout', spec: { title: parsed.title || '', shapes: read.shapes, panels: Array.isArray(parsed.panels) ? parsed.panels : [] } };
  };

  // 소재 이미지 없음(글/스타일 참고만) 또는 이미지 그대로 바탕
  const generateFromText = async () => {
    const type0 = asisMode ? 'site' : forcedType;
    const images = [...(subjectImage && asisMode ? [subjectImage] : []), ...(styleImage ? [styleImage] : [])];
    const parsed = await callAI(buildConceptPrompt(type0, askText(), { asis: asisMode, style: !!styleImage }), images);
    const guessed = parsed.steps ? 'massing' : parsed.floors ? 'stack' : parsed.nodes ? 'program' : 'site';
    const type = asisMode ? 'site' : forcedType !== 'auto' ? forcedType : (DIAGRAM_TYPES[parsed.type] ? parsed.type : guessed);
    const { type: _drop, ...spec } = parsed;
    return { type, spec, ...(asisMode ? { baseImage: subjectImage } : {}) };
  };

  // '요청 반영 점검'에서 빠진 항목을 넣어 다시 만들 때, 그 항목을 요청 문장 뒤에 덧붙여서 AI에 보낸다
  const mustRef = useRef([]);
  const askText = () => [userText.trim(), mustRef.current.length ? `[반드시 결과의 제목·칩·주석 글자에 그대로 포함할 표현] ${mustRef.current.join(', ')}` : ''].filter(Boolean).join('\n');

  // 도면 위에 표시(AI 이미지 편집): 서버가 (지시문 작성 → 로컬 AI 편집 → 원본 위 합성)을 하는 동안 진행 상황을 보여 주고, 끝나면 그림을 바탕으로 깔고 제목·범례를 편집 가능한 글자로 얹는다
  const runDiagramEdit = async () => {
    setBusy(true); setEditProg({ stage: '시작하는 중', percent: 1, sec: 0 });
    const t0 = Date.now();
    try {
      const res = await apiFetch('/v1/image/diagram-edit/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_base64: toB64(subjectImage), text: askText() }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
      const { job_id: jobId } = await res.json();
      let job = null;
      for (;;) {
        await new Promise((r) => setTimeout(r, 3000));
        if (!aliveRef.current) return;
        const sr = await apiFetch(`/v1/image/diagram-edit/status/${jobId}`);
        if (!sr.ok) throw new Error((await sr.json().catch(() => ({}))).detail || `HTTP ${sr.status}`);
        job = await sr.json();
        setEditProg({ stage: job.stage, percent: job.percent || 0, sec: Math.round((Date.now() - t0) / 1000) });
        if (job.status === 'done') break;
        if (job.status === 'error') throw new Error(job.error || 'AI 이미지 편집에 실패했습니다.');
      }
      const r = job.result; const img = await urlToJpegDataUrl(r.image, 2000);
      setResult({ type: 'sketch', spec: makeEditSpec({ imageUrl: img.url, w: img.w, h: img.h, title: r.title || '', legend: r.legend }), ver: Date.now() });
      addToast?.('success', '다이어그램 생성 완료', `AI 이미지 편집 · ${(r.seconds / 60).toFixed(1)}분 · 도면의 선·글자는 원본 그대로, 색과 동선만 얹었습니다`);
      if (r.instruction_source === 'fallback') addToast?.('info', '도면을 읽는 AI(Gemini)가 혼잡해 일반 지시문으로 그렸습니다', '방 색칠·동선이 덜 정확할 수 있습니다. 잠시 뒤 다시 만들면 더 좋아집니다.');
    } catch (e) { addToast?.('error', '다이어그램 생성 실패', e.message); setGenError(`다이어그램 생성 실패: ${e.message}`); }
    finally { setBusy(false); setEditProg(null); }
  };

  const generate = async (must, gopts) => {
    mustRef.current = Array.isArray(must) ? must : [];
    paidStepRef.current = !!(gopts && gopts.paid === true);
    if (!canGenerate) return;
    setGenError('');
    // 소재 이미지를 '읽어서' 쓰는 경우: 아직 안 읽었으면 여기서 자동으로 읽고 이어서 만든다(미리 읽어 보는 건 선택)
    let readNow = read;
    if (readMode && readNow && subjectKind === 'auto' && autoInfo && ['plan', 'axon', 'edit'].includes(readNow.kind)) { // 설명·참고 이미지를 바꿔서 평면도에 알맞은 방식(평면 다이어그램/분석 축측도/AI 이미지 편집)이 달라졌으면 다시 정한다
      const want = routeSubject(autoInfo.type, { hasRef: !!styleImage, text: userText });
      if (['plan', 'axon', 'edit'].includes(want) && want !== readNow.kind) readNow = null;
    }
    if (readMode && !readNow) {
      readNow = await readImage();
      if (!readNow) return;
    }
    if (readMode && readNow && readNow.kind === 'edit') { await runDiagramEdit(); return; }
    setBusy(true);
    try {
      const next = readMode ? await generateFromRead(readNow) : await generateFromText();
      renderSpec(next.type, next.spec, next.baseImage ? { baseImage: next.baseImage } : undefined); // 그릴 수 있는지 먼저 검증
      setResult(next);
      const what = readMode ? `${SUBJECT_KINDS[readNow.kind]} 기반` : (DIAGRAM_TYPES[next.type]?.label.split(' (')[0] || '다이어그램');
      addToast?.('success', '다이어그램 생성 완료', `${what}${styleImage ? ' + 참고 이미지 스타일' : ''}`);
    } catch (e) {
      addToast?.('error', '다이어그램 생성 실패', e.message); setGenError(`다이어그램 생성 실패: ${e.message}`);
    } finally {
      setBusy(false);
      if (paidStepRef.current) refreshPaid();   // 오늘·누적 사용액 갱신
      paidStepRef.current = false;
    }
  };

  // ── 분석 축측도 '유료로 매끈하게 다시 그리기': 지금 결과(글자 뺀 초안) + 내 도면 + 참고 이미지를 이미지 생성 모델에 보내 새로 그리게 하고, 그 그림을 바탕으로 쓰고 문구는 편집 가능한 글자로 얹는다 ──
  const svgToPngB64 = (svg, w, h) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); const im = new Image();
    im.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(im, 0, 0, w, h); URL.revokeObjectURL(url); resolve(c.toDataURL('image/png').split(',').pop()); };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('초안을 이미지로 바꾸지 못했습니다.')); }; im.src = url;
  });
  const urlToJpegDataUrl = async (url, maxLong = 1600) => {
    const blob = await (await fetch(url)).blob(); const u = URL.createObjectURL(blob);
    try {
      const im = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('생성된 이미지를 읽지 못했습니다.')); i.src = u; });
      const k = Math.min(1, maxLong / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(im, 0, 0, c.width, c.height); return { url: c.toDataURL('image/jpeg', 0.92), w: c.width, h: c.height };
    } finally { URL.revokeObjectURL(u); }
  };
  const polishAxon = async () => {
    const sp = result?.spec; const prov = paidImg.providers.find((p) => p.id === paidProvider) || paidImg.providers[0];
    if (!sp || sp.layout !== 'axon' || !prov || paidImgBusy) return;
    const krw = Math.round((prov.est_cost_usd || 0) * (paidImg.usage?.usd_krw || 1400));
    if (!window.confirm(`유료 이미지 생성(${prov.label})을 1회 실행합니다.\n예상 비용 약 $${(prov.est_cost_usd || 0).toFixed(2)}(약 ${krw.toLocaleString()}원)\n누적 사용 약 ${(paidImg.usage?.total_krw ?? 0).toLocaleString()}원 / 총 한도 ${(paidImg.usage?.total_limit_krw ?? 0).toLocaleString()}원\n\n내 도면·참고 이미지·초안이 외부 서버로 전송됩니다(대외비 자료는 올리지 마세요).\n계속할까요?`)) return;
    setPaidImgBusy(true); setGenError('');
    try {
      const draft = await svgToPngB64(renderSketch({ ...sp, textBlock: null }).svg, 1200, 760);
      const refs = [...(subjectImage ? [{ role: 'plan', base64: toB64(subjectImage) }] : []), ...(styleImage ? [{ role: 'style', base64: toB64(styleImage) }] : [])];
      const prompt = `Redraw image 1 as a polished, professional architectural analysis diagram of a Korean apartment unit. Keep exactly the composition of image 1: a 3D axonometric cutaway of the unit, soft translucent yellow-orange airflow ribbons passing through the unit, and a dashed yellow sun-path arc with a sun icon below it. ${subjectImage ? 'Image 2 is the original floor plan: keep its room layout, wall positions, proportions and the black structural walls exactly; show a light wood floor and subtle furniture.' : ''} ${styleImage ? 'The last image is a style reference: match its clean white background, soft gradients and line weight, but do not copy its content.' : ''} Pure white background. Do NOT draw any text, letters, numbers or logos anywhere. Keep the right 30% of the canvas completely empty white.`;
      const res = await apiFetch('/v1/image/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, provider: prov.id, aspect_ratio: '3:2', input_image_base64: draft, reference_images: refs, external_consent: true }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
      const data = await res.json(); const img = await urlToJpegDataUrl(`/generated/${data.filename}`);
      const rect = [0, 0, 100, (100 * img.h) / img.w];
      const next = { ...sp, base: { svg: `<g><image href="${img.url}" x="0" y="0" width="${img.w}" height="${img.h}"/></g>`, vb: [0, 0, img.w, img.h], rect, isImage: true }, winds: [], memos: [], frame: [-1, -1, 101, rect[3] + 1] };
      if (!sp.base?.isImage) setAxonVector(sp);
      setResult({ type: 'sketch', spec: next, ver: Date.now() });
      addToast?.('success', '유료 이미지 생성 완료', `${prov.label} · 문구는 편집 가능한 글자로 얹었습니다. 마음에 안 들면 "벡터 버전으로 되돌리기"를 누르세요.`);
    } catch (e) { addToast?.('error', '유료 이미지 생성 실패', e.message); setGenError(`유료 이미지 생성 실패: ${e.message}`); }
    finally { setPaidImgBusy(false); refreshPaid(); }
  };

  // 박스 편집: 읽은 값을 바꾸고, 지금 화면이 '읽은 모습 미리보기'면 바로 다시 그린다
  const editBoxes = (boxes, nextSel) => {
    if (!read || read.kind !== 'form') return;
    const sel = nextSel ?? selBox;
    const nr = { ...read, form: { ground: groundOf(boxes), boxes } };
    setRead(nr); setSelBox(sel);
    const pv = readToPreview(nr, sel);
    try { renderSpec(pv.type, pv.spec); setResult({ ...pv, isReadPreview: true }); } catch { /* 그릴 수 없는 값은 무시 */ }
  };
  const pickBox = (i) => {
    setSelBox(i);
    if (read && read.kind === 'form') { const pv = readToPreview(read, i); setResult({ ...pv, isReadPreview: true }); }
  };
  const resetBoxes = () => { if (readOrig) { setRead(readOrig); setSelBox(0); const pv = readToPreview(readOrig, 0); setResult({ ...pv, isReadPreview: true }); } };

  const saveSvg = () => rendered?.svg && saveBlob(new Blob([rendered.svg], { type: 'image/svg+xml' }), `diagram_${stamp()}.svg`);
  const savePng = () => {
    if (!rendered?.svg) return;
    const url = URL.createObjectURL(new Blob([rendered.svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); const sc = result?.spec?.layout === 'image' ? 3 : 2; c.width = rendered.width * sc; c.height = rendered.height * sc; // 도면 이미지는 해상도를 더 높여 저장
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => b && saveBlob(b, `diagram_${stamp()}.png`), 'image/png');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const previewSrc = rendered?.svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(rendered.svg)}` : '';
  const slotTitle = { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' };
  const slotNote = { fontSize: 11, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.5 };
  const dropBtn = { ...btn(false), padding: '14px 10px', borderStyle: 'dashed' };
  const thumb = { width: '100%', maxHeight: 150, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border-color)', background: '#fff' };

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
      <div style={{ width: 340, flexShrink: 0, borderRight: '1px solid var(--border-color)', padding: 14, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', background: 'rgba(220, 228, 242, 0.35)' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 4 }}>다이어그램 만들기</div>
          <p style={{ fontSize: 11.5, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.6 }}>
            설명만 써도 되고, <b>소재 이미지</b>(내 건물·도면)와 <b>스타일 참고 이미지</b>(이런 느낌)를 따로 또는 함께 넣을 수 있습니다. AI가 구성을 정하고 프로그램이 그려서 글자가 깨지지 않습니다.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={slotTitle}>1. 설명</span>
          <textarea value={userText} onChange={(e) => { setUserText(e.target.value); setStaleText(false); }} rows={5} style={{ ...inputBase, resize: 'vertical', fontFamily: 'inherit' }}
            placeholder={effKind === 'axon' ? '예) 전 세대 남향배치로 채광을 확보하고 맞통풍과 수변조망을 극대화\n\n(평면도의 어느 쪽이 남쪽인지는 아래 "남쪽 방향"에서 고르세요)' : '예) 공동주택 단지. 중앙 광장에서 사방으로 퍼지는 보행 흐름, 5가지 테마 정원, 외부공간과 프로그램의 순환 구조\n\n예) 이 건물이 직육면체에서 덜어내고 더해져 최종 형태가 되는 4단계'} />
          {(effKind === 'axon' || (styleImage && subjectImage)) && (
            <p style={{ fontSize: 11.5, margin: 0, lineHeight: 1.5, color: userText.trim() ? 'var(--text-tertiary, #64748b)' : '#9a3412', background: userText.trim() ? 'transparent' : '#fff7ed', padding: userText.trim() ? 0 : '6px 8px', borderRadius: 6 }} data-testid="concept-hint">
              {userText.trim() ? '참고 이미지의 구성(칸 나눔·표현 방식)은 따르고, 내용·문구는 이 설명을 근거로 만듭니다.' : '⚠️ 설명이 비어 있습니다. 참고 이미지의 개념(예: 맞통풍·일조)을 모르면 AI가 임의로 정하니, 만들려는 개념을 한 줄로 적어 주세요. 예) 전 세대 남향배치 및 맞통풍, 수변조망 극대화'}
            </p>
          )}
        </div>

        {staleText && userText.trim() && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 8, border: '1px solid #fdba74', background: '#fff7ed' }} data-testid="stale-text">
            <span style={{ fontSize: 11.5, color: '#9a3412', lineHeight: 1.5 }}>⚠️ 설명이 <b>이전 그림에 쓴 내용 그대로</b>입니다. 이 문장대로 제목과 이름이 붙으니, 새 그림에 맞게 고치거나 지우세요.</span>
            <button style={btn(false)} onClick={() => { setUserText(''); setStaleText(false); }}>설명 지우기</button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={slotTitle}>2. 소재 이미지 (선택) — 이 이미지를 다이어그램으로</span>
          {subjectImage ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <img src={subjectImage} alt="소재 이미지" style={thumb} />
              <button style={btn(false, busy || reading)} disabled={busy || reading} onClick={() => { setSubjectImage(null); setRead(null); dropOldResult(); }}>소재 이미지 제거</button>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['read', '형태를 읽어서'], ['asis', '이미지 그대로 바탕']].map(([id, label]) => (
                  <button key={id} style={{ ...btn(subjectUse === id, busy || reading), flex: 1, padding: '7px 6px', fontSize: 12 }} disabled={busy || reading} onClick={() => setSubjectUse(id)}>{label}</button>
                ))}
              </div>
              {readMode && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.6)' }}>
                  <div style={{ ...slotNote, padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.7)', border: '1px solid var(--border-color)' }} data-testid="auto-kind">
                    {subjectKind === 'auto'
                      ? (autoKind ? <>🤖 <b>자동 판단</b>: {autoInfo ? SUBJECT_TYPE_LABEL[autoInfo.type] : ''} → <b>{SUBJECT_KINDS[autoKind]}</b> 방식으로 {autoKind === 'edit' ? '그립니다(무료, 약 3~6분).' : '읽습니다.'}</> : <>🤖 <b>자동 판단</b>: 이미지를 올리고 만들기(또는 미리 읽기)를 누르면 AI가 종류를 알아서 정합니다.</>)
                      : <>✋ <b>직접 지정</b>: {SUBJECT_KINDS[subjectKind]}</>}
                  </div>
                  <details>
                    <summary style={{ fontSize: 11.5, color: 'var(--text-tertiary, #64748b)', cursor: 'pointer' }}>이미지 종류 직접 지정 (보통은 필요 없습니다)</summary>
                    <select value={subjectKind} onChange={(e) => { setSubjectKind(e.target.value); setRead(null); setAutoKind(null); setAutoInfo(null); }} style={inputBase} disabled={reading || busy}>
                    <option value="auto">이미지 종류: 자동 판단</option>
                    {Object.entries(SUBJECT_KINDS).filter(([id]) => id !== 'other').map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                  </details>
                  {effKind === 'axon' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="axon-options">
                      <p style={slotNote}>내 평면 도면의 벽을 이미지에서 직접 뽑아 입체로 세우고, 그 위에 바람 띠·일조 경로와 오른쪽 문구를 얹습니다. 어두운 벽선이 있는 깨끗한 평면도에서 가장 잘 됩니다.</p>
                      <label style={{ ...slotNote, display: 'flex', flexDirection: 'column', gap: 3 }}>남쪽 방향(도면에서 어느 쪽이 남쪽인가요?)
                        <select value={axonSouth} onChange={(e) => setAxonSouth(e.target.value)} style={inputBase} disabled={reading || busy} data-testid="axon-south">
                          <option value="bottom">도면의 아래쪽</option><option value="top">도면의 위쪽</option><option value="left">도면의 왼쪽</option><option value="right">도면의 오른쪽</option>
                        </select>
                      </label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <label style={{ ...slotNote, flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>벽 높이
                          <select value={axonHeight} onChange={(e) => setAxonHeight(Number(e.target.value))} style={inputBase} disabled={reading || busy}><option value={0.025}>낮게</option><option value={0.04}>보통</option><option value={0.06}>높게</option></select>
                        </label>
                        <label style={{ ...slotNote, flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>시점(회전)
                          <select value={axonRot} onChange={(e) => setAxonRot(Number(e.target.value))} style={inputBase} disabled={reading || busy}><option value={-30}>왼쪽으로 크게</option><option value={-15}>왼쪽으로 조금</option><option value={0}>정면</option><option value={15}>오른쪽으로 조금</option><option value={30}>오른쪽으로 크게</option></select>
                        </label>
                      </div>
                      <label style={{ ...slotNote, display: 'flex', gap: 6, alignItems: 'flex-start', cursor: 'pointer' }}>
                        <input type="checkbox" checked={axonTexture} onChange={(e) => setAxonTexture(e.target.checked)} disabled={reading || busy} style={{ marginTop: 2 }} data-testid="axon-texture" />
                        <span>바닥에 내 도면 그림 입히기(가구·바닥 질감·방 이름이 입체 바닥에 그대로 보입니다. 끄면 벽만 있는 단순한 모형)</span>
                      </label>
                      {axonNote && (
                        <div style={{ ...slotNote, padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.7)' }} data-testid="axon-note">
                          <b>참고 이미지에서 읽은 구성</b>: {axonNote.parts.length ? axonNote.parts.join(' · ') : '(참고 이미지 없음)'}<br />
                          <b>이 도구가 못 그리는 것</b>: {axonNote.unsupported.length ? axonNote.unsupported.join(' · ') : '없음'}
                          {axonNote.empty && <><br /><span style={{ color: '#9a3412' }}>설명이 비어 있어 AI가 개념을 임의로 정했습니다. 설명을 적고 다시 만들어 보세요.</span></>}
                        </div>
                      )}
                    </div>
                  )}
                  {effKind === 'freeform' && <p style={slotNote}>평면 도면이 아닌 그림(입체·투시·수채·사진 등)용입니다. 틀에 맞추지 않고 그림이 말하는 개념을 이해해서, 고정 요소(회색)와 움직이거나 강조된 요소(노랑), 회전·이동·흐름 화살표로 단순하게 다시 그립니다. 설명(1번)이 읽을 때 쓰이므로 설명을 바꾸면 새로 읽습니다. 결과는 클릭해서 바로 고칠 수 있습니다.</p>}
                  {effKind === 'sketch' && <p style={slotNote}>펜으로 그린 개념 스케치용입니다. 그려진 상자·빗금·선을 있는 그대로 읽어 정돈하고, 설명(1번)에 쓴 개념대로 이름과 화살표 방향을 붙입니다. 결과는 클릭해서 바로 고칠 수 있습니다. ‘다이어그램 만들기’를 다시 누르면 새로 만들어 직접 고친 내용은 사라집니다.</p>}
                  <button style={btn(!read, reading || busy)} disabled={reading || busy} onClick={() => readImage({ fresh: true })}>
                    {reading ? '읽는 중… (10~30초)' : read ? '🔄 다시 읽기' : '미리 읽어서 확인하기 (선택)'}
                  </button>
                  {(effKind === 'sketch' || effKind === 'freeform') && paidVision.available && (
                    <button style={{ ...btn(false, reading || busy), marginTop: 6 }} disabled={reading || busy}
                      title={`상위 모델(${paidVision.model})로 한 번 읽습니다. 유료이며 누를 때만 호출됩니다.`}
                      onClick={() => { if (window.confirm(`유료 정밀 읽기를 1회 실행합니다.
예상 비용 약 $${paidVision.est_cost_usd}(약 ${Math.round((paidVision.est_cost_usd || 0) * (paidVision.usage_today?.usd_krw || 1400)).toLocaleString()}원)
누적 사용 약 ${(paidVision.usage_today?.total_krw ?? 0).toLocaleString()}원 / 총 한도 ${(paidVision.usage_today?.total_limit_krw ?? 0).toLocaleString()}원 (오늘 약 $${paidVision.usage_today?.usd ?? 0})
계속할까요?`)) readImage({ fresh: true, paid: true }); }}>
                      🔎 정밀 읽기 (유료 · 약 ${paidVision.est_cost_usd})
                    </button>
                  )}
                  {read && (
                    <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>
                      <b>{SUBJECT_KINDS[read.kind]}</b>로 읽었습니다.{read.summary ? ` ${read.summary}` : ''}<br />
                      오른쪽 그림이 읽은 모습입니다. 다르면 종류를 바꿔 다시 읽거나, 아래에서 직접 고치세요.
                      {read.fromCache && (
                        <><br /><b>저장된 읽기 결과입니다</b>(같은 그림을 전에 읽은 결과라 AI 를 다시 부르지 않았습니다). <button style={{ ...btn(true, reading || busy), padding: '3px 8px', fontSize: 11.5, marginTop: 4 }} disabled={reading || busy} onClick={() => readImage({ fresh: true })} data-testid="reread-fresh">새로 읽기</button></>
                      )}
                      {read.kind === 'freeform' && effKind !== 'freeform' && (
                        <><br />입체·채색 그림으로 판단해 자유 해석으로 읽었습니다. <button style={{ ...btn(false, reading || busy), padding: '3px 8px', fontSize: 11.5, marginTop: 4 }} disabled={reading || busy} onClick={() => readImage({ fresh: true, forceSketch: true })}>평면 스케치로 다시 읽기</button></>
                      )}
                    </p>
                  )}
                  {read && read.kind === 'form' && (
                    <BoxEditor boxes={read.form.boxes} selected={Math.min(selBox, read.form.boxes.length - 1)} onSelect={pickBox} onChange={editBoxes} onReset={resetBoxes} disabled={reading || busy} />
                  )}
                  {!read && <p style={slotNote}>읽기는 ‘다이어그램 만들기’를 누르면 자동으로 먼저 실행됩니다. 읽은 결과를 먼저 확인하고 싶을 때만 위 버튼을 쓰세요.</p>}
                </div>
              )}
              <p style={slotNote}>
                {readMode ? '형태(건물·평면·배치)를 읽고 다시 그려서 그 위에 다이어그램을 만듭니다.' : '올린 이미지를 바탕에 그대로 깔고 그 위에 흐름선·구역·아이콘을 얹습니다. 이미지는 바뀌지 않습니다.'}
              </p>
            </div>
          ) : (
            <button style={dropBtn} onClick={() => subjectFileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pickSubject(e.dataTransfer.files?.[0]); }}>
              🏢 내 건물·평면·배치도 올리기
            </button>
          )}
          <input ref={subjectFileRef} type="file" accept="image/*" hidden onChange={(e) => { pickSubject(e.target.files?.[0]); e.target.value = ''; }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={slotTitle}>3. 스타일 참고 이미지 (선택) — 이런 느낌으로</span>
          {styleImage ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <img src={styleImage} alt="스타일 참고 이미지" style={thumb} />
              <button style={btn(false, busy)} disabled={busy} onClick={() => setStyleImage(null)}>참고 이미지 제거</button>
            </div>
          ) : (
            <button style={dropBtn} onClick={() => styleFileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pickStyle(e.dataTransfer.files?.[0]); }}>
              🖼️ 비슷한 느낌의 이미지 올리기
            </button>
          )}
          <input ref={styleFileRef} type="file" accept="image/*" hidden onChange={(e) => { pickStyle(e.target.files?.[0]); e.target.value = ''; }} />
          <p style={slotNote}>이미지의 칸 구성과 요소를 보고 비슷한 방식으로 표현합니다. 소재 이미지가 있으면 내용·형태는 소재를 따르고, 표현 방식만 참고합니다.</p>
        </div>

        {!subjectImage && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ ...slotTitle, whiteSpace: 'nowrap' }}>종류</span>
          <select value={forcedType} onChange={(e) => setForcedType(e.target.value)} style={inputBase}>
            <option value="auto">자동 (내용 보고 AI가 선택)</option>
            {Object.entries(DIAGRAM_TYPES).map(([id, t]) => <option key={id} value={id}>{t.label}</option>)}
          </select>
        </div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <select value={model} onChange={(e) => setModel(e.target.value)} style={inputBase} title="AI 모델">
            {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <p style={{ fontSize: 11, color: '#C2410C', margin: 0, lineHeight: 1.5 }}>⚠️ 설명과 이미지가 외부(Google Gemini)로 전송됩니다. 대외비 자료는 올리지 마세요.</p>
          <button style={btn(true, !canGenerate)} disabled={!canGenerate} onClick={() => generate()}>
            {reading ? '이미지 읽는 중…' : editProg ? `AI가 그리는 중… ${editProg.percent}%` : busy ? '만드는 중… (10~30초)' : '✨ 다이어그램 만들기'}
          </button>
          {effKind === 'edit' && !editProg && <p style={{ ...slotNote, margin: 0 }} data-testid="edit-note">🖼️ <b>AI 이미지 편집</b> 방식: 무료(이 PC에서 그림)이고 <b>약 3~6분</b> 걸립니다. 도면의 선·글자·치수는 원본 그대로, 색과 동선만 얹습니다. 더 빠른 단순 블록 그림은 “이미지 종류 직접 지정 → 평면도”로 만드세요.</p>}
          {editProg && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} data-testid="edit-progress">
              <div style={{ height: 8, borderRadius: 4, background: 'var(--border-color, #e2e8f0)', overflow: 'hidden' }}><div style={{ width: `${Math.max(2, editProg.percent)}%`, height: '100%', background: '#F28C28', transition: 'width .6s' }} /></div>
              <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{editProg.stage} · {Math.floor(editProg.sec / 60)}분 {editProg.sec % 60}초 경과</span>
            </div>
          )}
          {(((effKind === 'sketch' || effKind === 'axon') && readMode && paidVision.available) || (result?.spec?.layout === 'axon' && paidImg.providers.length > 0)) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 8, border: '1px solid #fcd34d', background: '#fffbeb' }} data-testid="paid-box">
              <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>유료 옵션 (선택 · 누르는 때만 호출 · 누적 총 한도 적용)</span>
              {(paidImg.usage || paidVision.usage_today) && <span style={{ fontSize: 11, color: '#92400e' }} data-testid="paid-usage">누적 약 {((paidImg.usage || paidVision.usage_today).total_krw ?? 0).toLocaleString()}원 / 총 한도 {((paidImg.usage || paidVision.usage_today).total_limit_krw ?? 0).toLocaleString()}원</span>}
              {(effKind === 'sketch' || effKind === 'axon') && readMode && paidVision.available && (
                <button style={btn(false, !canGenerate)} disabled={!canGenerate} data-testid="paid-generate" title={`상위 모델(${paidVision.model})로 AI 단계를 한 번 실행합니다.`}
                  onClick={() => { if (window.confirm(`유료로 만들기를 1회 실행합니다.\nAI 단계(${effKind === 'axon' ? '바람·일조·문구 정하기' : '이름·설명·바람 방향 붙이기'})를 상위 모델(${paidVision.model})로 호출합니다.\n예상 비용 약 $${paidVision.est_cost_usd}(약 ${Math.round((paidVision.est_cost_usd || 0) * (paidVision.usage_today?.usd_krw || 1400)).toLocaleString()}원)\n계속할까요?`)) generate(undefined, { paid: true }); }}>
                  🔎 유료로 만들기 (AI 단계를 상위 모델로 · 약 ${paidVision.est_cost_usd})
                </button>
              )}
              {result?.spec?.layout === 'axon' && paidImg.providers.length > 0 && (
                <>
                  {paidImg.providers.length > 1 && <select value={paidProvider} onChange={(e) => setPaidProvider(e.target.value)} style={inputBase} disabled={paidImgBusy} data-testid="paid-provider">{paidImg.providers.map((p) => <option key={p.id} value={p.id}>{p.label} · 약 ${(p.est_cost_usd || 0).toFixed(2)}/장</option>)}</select>}
                  <button style={btn(false, paidImgBusy || busy)} disabled={paidImgBusy || busy} data-testid="paid-polish" onClick={polishAxon}>
                    {paidImgBusy ? '유료 이미지 생성 중… (약 1분)' : `🎨 유료로 매끈하게 다시 그리기 (이미지 생성 · 약 $${((paidImg.providers.find((p) => p.id === paidProvider) || paidImg.providers[0])?.est_cost_usd || 0).toFixed(2)})`}
                  </button>
                  {axonVector && result?.spec?.base?.isImage && <button style={btn(false, paidImgBusy)} disabled={paidImgBusy} data-testid="paid-restore" onClick={() => { setResult({ type: 'sketch', spec: axonVector, ver: Date.now() }); setAxonVector(null); }}>↩ 벡터 버전으로 되돌리기</button>}
                </>
              )}
            </div>
          )}
        </div>

        {coverage.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="coverage">
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>요청 반영 점검</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {coverage.map((c) => (
                <span key={c.item} style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 999, border: `1px solid ${c.ok ? '#86efac' : '#fca5a5'}`, background: c.ok ? '#f0fdf4' : '#fef2f2', color: c.ok ? '#15803D' : '#B91C1C' }}>
                  {c.ok ? '✓' : '✗'} {c.item}
                </span>
              ))}
            </div>
            {coverage.some((c) => !c.ok)
              ? (
                <>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.5 }}>빨간 항목은 결과의 글에서 찾지 못했습니다(비슷한 표현이 있어도 못 찾을 수 있으니 결과를 직접 확인하세요).</p>
                  <button style={btn(false, busy || reading)} disabled={busy || reading} onClick={() => generate(coverage.filter((c) => !c.ok).map((c) => c.item))}>빠진 항목 넣어서 다시 만들기</button>
                </>
              )
              : <p style={{ fontSize: 11, color: '#15803D', margin: 0 }}>요청한 항목이 모두 결과에 들어 있습니다.</p>}
          </div>
        )}

        {result && result.type !== 'sketch' && fields.length > 0 && (
          <details>
            <summary style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer' }}>글자 수정 (AI 재호출 없이 즉시 반영)</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {fields.map((f) => (
                <label key={f.path.join('.')} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--text-tertiary, #64748b)' }}>
                  {f.label}
                  <input style={inputBase} value={f.value} onChange={(e) => setResult({ ...result, spec: setByPath(result.spec, f.path, e.target.value) })} />
                </label>
              ))}
            </div>
          </details>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border-color)', alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={btn(true, !rendered?.svg)} disabled={!rendered?.svg} onClick={saveSvg}>SVG 저장</button>
          <button style={btn(false, !rendered?.svg)} disabled={!rendered?.svg} onClick={savePng}>PNG 저장</button>
          <span style={{ fontSize: 11.5, color: 'var(--text-tertiary, #64748b)' }}>SVG는 일러스트레이터에서 글자·선까지 그대로 편집됩니다.</span>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 16, background: '#fff' }}>
          {!result && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary, #64748b)', fontSize: 13, textAlign: 'center', lineHeight: 1.7 }}>
              <div>왼쪽에 설명과 이미지를 넣고 <b>다이어그램 만들기</b>를 누르면<br />결과가 여기에 나타납니다.</div>
              <button style={{ ...btn(false), fontSize: 12 }} onClick={() => setResult({ type: 'site', spec: EXAMPLE_SPECS.site })}>예시 먼저 보기</button>
            </div>
          )}
          {genError && (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fef2f2', color: '#B91C1C', fontSize: 12.5, lineHeight: 1.5 }} data-testid="gen-error">
              ⚠️ {genError}{result ? ' — 아래에 보이는 그림은 이번 결과가 아니라 이전 결과입니다.' : ''}
            </div>
          )}
          {rendered?.error && <div style={{ color: '#B91C1C', fontSize: 13 }}>그릴 수 없는 결과입니다: {rendered.error}</div>}
          {result?.type === 'sketch' && rendered?.svg && (
            <SketchEditor key={result.ver} spec={result.spec} onChange={(spec) => setResult((r) => ({ ...r, spec, isReadPreview: false }))} disabled={busy || reading} />
          )}
          {result?.type !== 'sketch' && rendered?.svg && <img src={previewSrc} alt="다이어그램 미리보기" style={{ width: '100%', maxWidth: rendered.width, display: 'block', margin: '0 auto' }} />}
        </div>
      </div>
    </div>
  );
}

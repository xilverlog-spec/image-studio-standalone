import React, { useState, useMemo, useRef } from 'react';
import { DIAGRAM_TYPES, EXAMPLE_SPECS, buildConceptPrompt, parseJsonLoose, renderSpec, getTextFields, setByPath } from './conceptDiagram/spec';
import { SUBJECT_KINDS, buildReadPrompt, normalizeRead, readToPreview, buildSubjectPrompt, mergeSiteGeometry, aspectFixShapes, groundOf } from './conceptDiagram/subject';

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
  const [result, setResult] = useState(null); // { type, spec, baseImage? }
  const [subjectKind, setSubjectKind] = useState('auto');
  const [read, setRead] = useState(null); // 소재 이미지에서 읽은 구조
  const [reading, setReading] = useState(false);
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
  const readMode = !!subjectImage && subjectUse === 'read';
  const asisMode = !!subjectImage && subjectUse === 'asis';
  const canGenerate = !busy && !reading && !!(userText.trim() || subjectImage || styleImage);

  const pickSubject = async (file) => {
    if (!file) return;
    try { setSubjectImage(await readResizedPng(file)); setRead(null); }
    catch (e) { addToast?.('error', '이미지 불러오기 실패', e.message); }
  };
  const pickStyle = async (file) => {
    if (!file) return;
    try { setStyleImage(await readResizedPng(file)); }
    catch (e) { addToast?.('error', '이미지 불러오기 실패', e.message); }
  };

  const toB64 = (img) => img.split(',').pop();
  const callAI = async (content, images = []) => {
    const res = await apiFetch('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: 16000, temperature: 0.35,
        messages: [{ role: 'user', content, ...(images.length ? { images: images.map(toB64) } : {}) }],
      }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
    const data = await res.json();
    return parseJsonLoose(data.choices?.[0]?.message?.content);
  };

  // 소재 이미지 읽기: 구조로 읽고, 읽은 모습을 바로 보여 준다
  const readImage = async () => {
    if (!subjectImage || reading) return null;
    setReading(true);
    try {
      const useGrid = subjectKind !== 'form';
      const gridded = useGrid ? await withGrid(subjectImage) : subjectImage;
      let r = null; let lastErr = null;
      for (let attempt = 0; attempt < 2 && !r; attempt++) { // 잘못 읽히면(뭉개짐 등) 한 번 더 읽는다
        try { r = normalizeRead(await callAI(buildReadPrompt(subjectKind, { grid: useGrid }), [gridded]), subjectKind); }
        catch (e) { lastErr = e; }
      }
      if (!r) throw lastErr;
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
      addToast?.('error', '이미지 읽기 실패', e.message);
      return null;
    } finally {
      setReading(false);
    }
  };

  // 소재 이미지를 읽은 구조 + (있으면) 스타일 참고 이미지로 다이어그램 생성
  const generateFromRead = async (read) => {
    const parsed = await callAI(buildSubjectPrompt(read, userText.trim(), !!styleImage), styleImage ? [styleImage] : []);
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
    const parsed = await callAI(buildConceptPrompt(type0, userText.trim(), { asis: asisMode, style: !!styleImage }), images);
    const guessed = parsed.steps ? 'massing' : 'site';
    const type = asisMode ? 'site' : forcedType !== 'auto' ? forcedType : (DIAGRAM_TYPES[parsed.type] ? parsed.type : guessed);
    const { type: _drop, ...spec } = parsed;
    return { type, spec, ...(asisMode ? { baseImage: subjectImage } : {}) };
  };

  const generate = async () => {
    if (!canGenerate) return;
    // 소재 이미지를 '읽어서' 쓰는 경우: 아직 안 읽었으면 여기서 자동으로 읽고 이어서 만든다(미리 읽어 보는 건 선택)
    let readNow = read;
    if (readMode && !readNow) {
      readNow = await readImage();
      if (!readNow) return;
    }
    setBusy(true);
    try {
      const next = readMode ? await generateFromRead(readNow) : await generateFromText();
      renderSpec(next.type, next.spec, next.baseImage ? { baseImage: next.baseImage } : undefined); // 그릴 수 있는지 먼저 검증
      setResult(next);
      const what = readMode ? `${SUBJECT_KINDS[readNow.kind]} 기반` : (DIAGRAM_TYPES[next.type]?.label.split(' (')[0] || '다이어그램');
      addToast?.('success', '다이어그램 생성 완료', `${what}${styleImage ? ' + 참고 이미지 스타일' : ''}로 만들었습니다.`);
    } catch (e) {
      addToast?.('error', '다이어그램 생성 실패', e.message);
    } finally {
      setBusy(false);
    }
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
      const c = document.createElement('canvas'); c.width = rendered.width * 2; c.height = rendered.height * 2;
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
          <textarea value={userText} onChange={(e) => setUserText(e.target.value)} rows={5} style={{ ...inputBase, resize: 'vertical', fontFamily: 'inherit' }}
            placeholder={'예) 공동주택 단지. 중앙 광장에서 사방으로 퍼지는 보행 흐름, 5가지 테마 정원, 외부공간과 프로그램의 순환 구조\n\n예) 이 건물이 직육면체에서 덜어내고 더해져 최종 형태가 되는 4단계'} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={slotTitle}>2. 소재 이미지 (선택) — 이 이미지를 다이어그램으로</span>
          {subjectImage ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <img src={subjectImage} alt="소재 이미지" style={thumb} />
              <button style={btn(false, busy || reading)} disabled={busy || reading} onClick={() => { setSubjectImage(null); setRead(null); }}>소재 이미지 제거</button>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['read', '형태를 읽어서'], ['asis', '이미지 그대로 바탕']].map(([id, label]) => (
                  <button key={id} style={{ ...btn(subjectUse === id, busy || reading), flex: 1, padding: '7px 6px', fontSize: 12 }} disabled={busy || reading} onClick={() => setSubjectUse(id)}>{label}</button>
                ))}
              </div>
              {readMode && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.6)' }}>
                  <select value={subjectKind} onChange={(e) => { setSubjectKind(e.target.value); setRead(null); }} style={inputBase} disabled={reading || busy}>
                    <option value="auto">이미지 종류: 자동 판단</option>
                    {Object.entries(SUBJECT_KINDS).filter(([id]) => id !== 'other').map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                  <button style={btn(!read, reading || busy)} disabled={reading || busy} onClick={readImage}>
                    {reading ? '읽는 중… (10~30초)' : read ? '🔄 다시 읽기' : '미리 읽어서 확인하기 (선택)'}
                  </button>
                  {read && (
                    <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>
                      <b>{SUBJECT_KINDS[read.kind]}</b>로 읽었습니다.{read.summary ? ` ${read.summary}` : ''}<br />
                      오른쪽 그림이 읽은 모습입니다. 다르면 종류를 바꿔 다시 읽거나, 아래에서 직접 고치세요.
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
          <button style={btn(true, !canGenerate)} disabled={!canGenerate} onClick={generate}>
            {reading ? '이미지 읽는 중…' : busy ? '만드는 중… (10~30초)' : '✨ 다이어그램 만들기'}
          </button>
        </div>

        {result && fields.length > 0 && (
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
          {rendered?.error && <div style={{ color: '#B91C1C', fontSize: 13 }}>그릴 수 없는 결과입니다: {rendered.error}</div>}
          {rendered?.svg && <img src={previewSrc} alt="다이어그램 미리보기" style={{ width: '100%', maxWidth: rendered.width, display: 'block', margin: '0 auto' }} />}
        </div>
      </div>
    </div>
  );
}

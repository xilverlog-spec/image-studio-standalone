import React, { useState, useRef } from 'react';
import { renderMassingLineGroup } from './conceptDiagram/massing';
import { buildReadPrompt, normalizeRead } from './conceptDiagram/subject';
import { parseJsonLoose } from './conceptDiagram/spec';

// 이미지 → 정돈된 선(SVG) 추출. 선을 찾아 수직/±30° 세 방향으로 정렬하고, 외곽/안쪽/점선을 일정한 굵기로 다시 그린다.
// 아이소메트릭 도식에 맞춰져 있다(곡선, 임의 각도의 선, 복잡한 조경 그림은 대상이 아니다). 기본은 완전히 로컬이다.

const MAX_EDGE = 2400;

const inputBase = { padding: '7px 9px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.85)', fontSize: 12.5 };
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

const readPng = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
  fr.onload = () => {
    const img = new Image();
    img.onerror = () => reject(new Error('이미지 형식을 읽지 못했습니다.'));
    img.onload = () => {
      const k = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve({ src: c.toDataURL('image/png'), width: c.width, height: c.height, name: file.name.replace(/\.[^.]+$/, '') });
    };
    img.src = String(fr.result);
  };
  fr.readAsDataURL(file);
});

export default function LineTrace({ addToast, apiFetch }) {
  const [source, setSource] = useState(null);
  const [readText, setReadText] = useState(false);
  const [withFills, setWithFills] = useState(false);
  const [method, setMethod] = useState('auto'); // auto = 이미지를 보고 선 도식/색 면 도식을 자동 판별
  const [skipAi, setSkipAi] = useState(false); // 고급: 빠른 확인용으로 AI 재생성 단계를 건너뛴다(기본은 항상 AI로 깨끗하게 다시 그린 뒤 추출)
  const [progress, setProgress] = useState({ stage: '', done: 0, total: 0 });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { svg, stats, warning }
  const [simplifying, setSimplifying] = useState(null); // 구조로 단순화하는 중인 칸 번호
  const fileRef = useRef(null);

  const pick = async (file) => {
    if (!file) return;
    try { setSource(await readPng(file)); setResult(null); }
    catch (e) { addToast?.('error', '이미지 불러오기 실패', e.message); }
  };

  const run = async () => {
    if (!source || busy) return;
    setBusy(true);
    setResult(null);
    setProgress({ stage: '작업 요청 중', done: 0, total: 0 });
    try {
      // AI 재생성(로컬 FLUX Kontext)은 칸당 수 분이 걸려서 백그라운드 작업으로 돌리고 진행률을 확인한다.
      const res = await apiFetch('/v1/image/linetrace/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: source.src.split(',').pop(), read_text: readText, fills: withFills, redraw: !skipAi, method }),
      });
      const started = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof started.detail === 'string' ? started.detail : '작업을 시작하지 못했습니다.');
      const jobId = started.job_id;
      for (;;) {
        await new Promise((r) => setTimeout(r, 2500));
        const st = await (await fetch(`/v1/image/linetrace/status/${jobId}`)).json();
        if (st.detail) throw new Error(st.detail);
        setProgress({ stage: st.stage, done: st.done || 0, total: st.total || 0 });
        if (st.status === 'done') {
          setResult({ svg: st.svg, stats: st.stats, warnings: st.warnings || [] });
          addToast?.('success',
            st.stats.method === 'color' ? '색 면 도식으로 변환 완료' : st.stats.method === 'perspective' ? '원근 이미지를 선 도면으로 변환 완료' : '선 추출 완료',
            st.stats.method === 'color' ? '색 영역을 그대로 벡터로 변환했습니다.' : st.stats.method === 'perspective' ? 'AI가 선화로 다시 그린 것을 벡터로 바꿨습니다. 건물 세부가 원본과 다를 수 있으니 확인하세요.' : `${st.stats.panels}칸, 선 ${st.stats.lines}개를 정리했습니다.`);
          break;
        }
        if (st.status === 'error') throw new Error(st.error || '선 추출에 실패했습니다.');
      }
    } catch (e) {
      addToast?.('error', '선 추출 실패', e.message);
    } finally {
      setBusy(false);
    }
  };

  // 복잡한 칸(나무·사람·디테일이 많은 장면)을 AI가 건물 구조로 읽어 박스 단선으로 다시 그린다
  const simplifyPanel = async (info) => {
    if (!source || !result || simplifying !== null) return;
    setSimplifying(info.i);
    try {
      const [x0, y0, x1, y1] = info.bbox;
      const img = await new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(new Error('원본을 읽지 못했습니다.')); im.src = source.src; });
      const c = document.createElement('canvas'); c.width = x1 - x0; c.height = y1 - y0;
      c.getContext('2d').drawImage(img, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
      const res = await apiFetch('/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gemini-3.5-flash', max_tokens: 16000, temperature: 0.2, messages: [{ role: 'user', content: buildReadPrompt('form'), images: [c.toDataURL('image/png').split(',').pop()] }] }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
      const data = await res.json();
      const read = normalizeRead(parseJsonLoose(data.choices?.[0]?.message?.content), 'form');
      const inner = renderMassingLineGroup(read.form.boxes, read.form.ground, x1 - x0, y1 - y0, 2.4);
      if (!inner) throw new Error('그릴 형태가 없습니다.');
      const re = new RegExp('<g data-panel="' + info.i + '"[^>]*>[\\s\\S]*?</g>');
      if (!re.test(result.svg)) throw new Error('이 칸을 결과에서 찾지 못했습니다.');
      const svg = result.svg.replace(re, `<g data-panel="${info.i}" data-simplified="1" transform="translate(${x0} ${y0})">${inner}</g>`);
      setResult({ ...result, svg, simplified: [...(result.simplified || []), info.i] });
      addToast?.('success', `칸 ${info.i + 1}을 구조로 단순화했습니다`, read.summary || '박스 덩어리로 다시 그렸습니다.');
    } catch (e) {
      addToast?.('error', '구조 단순화 실패', e.message);
    } finally {
      setSimplifying(null);
    }
  };

  const saveSvg = () => result && saveBlob(new Blob([result.svg], { type: 'image/svg+xml' }), `${source?.name || 'lines'}_lines_${stamp()}.svg`);
  const savePng = () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([result.svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = result.stats.size[0] * 2; c.height = result.stats.size[1] * 2;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => b && saveBlob(b, `${source?.name || 'lines'}_lines_${stamp()}.png`), 'image/png');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const resultSrc = result ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}` : '';

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
      <div style={{ width: 340, flexShrink: 0, borderRight: '1px solid var(--border-color)', padding: 14, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', background: 'rgba(220, 228, 242, 0.35)' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 4 }}>이미지 → 깔끔한 선</div>
          <p style={{ fontSize: 11.5, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.6 }}>
            이미지를 보고 알아서 방식을 고릅니다. <b>선으로 그린 도식</b>(아이소메트릭 등)은 선을 찾아 반듯한 단선으로, <b>색 면으로 칠한 도식·평면도</b>는 색 영역 그대로 벡터로, <b>원근 모델 캡처·렌더</b>는 AI가 선 도면으로 다시 그려 벡터로 바꿉니다.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>1. 원본 이미지</span>
          {source ? (
            <>
              <img src={source.src} alt="원본" style={{ width: '100%', maxHeight: 190, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border-color)', background: '#fff' }} />
              <button style={btn(false, busy)} disabled={busy} onClick={() => { setSource(null); setResult(null); }}>이미지 제거</button>
            </>
          ) : (
            <button style={{ ...btn(false), padding: '22px 10px', borderStyle: 'dashed' }} onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}>
              🖼️ 도식 이미지 선택 (또는 끌어다 놓기)
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        </div>

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={withFills} onChange={(e) => setWithFills(e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            면 색도 함께 (단색)
            <br />
            <span style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)' }}>기본은 질감·면을 모두 무시하고 외곽선 중심의 깔끔한 단선만 추출합니다. 켜면 갈색 볼륨과 회색 음영을 단색 면으로 얹습니다.</span>
          </span>
        </label>

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={readText} onChange={(e) => setReadText(e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            글자를 읽어서 편집 가능한 텍스트로 변환 (선택)
            <br />
            <span style={{ fontSize: 11, color: '#C2410C' }}>켜면 이미지가 외부(Google Gemini)로 전송됩니다. 끄면 글자는 모양 그대로 윤곽선이 되고, 모든 처리가 이 PC 안에서만 이루어집니다.</span>
          </span>
        </label>

        <button style={btn(true, !source || busy)} disabled={!source || busy} onClick={run}>
          {busy ? '처리 중…' : '✨ 깨끗한 선으로 변환'}
        </button>
        {busy && (
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <div>{progress.stage}</div>
            {progress.total > 0 && (
              <div style={{ height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.08)', marginTop: 6, overflow: 'hidden' }}>
                <div style={{ width: `${Math.round((progress.done / progress.total) * 100)}%`, height: '100%', background: 'var(--accent-cyan)' }} />
              </div>
            )}
          </div>
        )}
        <p style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.5 }}>
          변환하면 자동으로 AI(이 PC의 무료 모델)가 먼저 깨끗한 선화로 다시 그리고, 그 결과에서 선을 추출합니다. 칸 하나당 약 3분이 걸립니다.
          AI가 형태를 바꾼 칸은 원본에서 직접 추출합니다. 글자는 원본 그대로 옮깁니다.
        </p>
        <details>
          <summary style={{ fontSize: 11.5, color: 'var(--text-tertiary, #64748b)', cursor: 'pointer' }}>고급</summary>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 6 }}>
            변환 방식
            <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputBase}>
              <option value="auto">자동 (이미지를 보고 판단)</option>
              <option value="lines">선 도식 — 선을 찾아 반듯한 단선으로</option>
              <option value="color">색 면 도식 — 색 영역 그대로 벡터로</option>
              <option value="perspective">원근 모델 캡처·렌더 — AI가 선 도면으로 다시 그려 벡터로 (약 3분)</option>
            </select>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={skipAi} onChange={(e) => setSkipAi(e.target.checked)} style={{ marginTop: 2 }} />
            <span>AI 재생성 건너뛰기 (빠른 확인용, 결과 품질은 낮아질 수 있음)</span>
          </label>
        </details>

        <div style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', lineHeight: 1.6, borderTop: '1px solid var(--border-color)', paddingTop: 10 }}>
          <b>잘 되는 그림</b>: 흰 바탕의 아이소메트릭 매스, 단계도, 직선 위주 도식<br />
          <b>잘 안 되는 그림</b>: 나무·사람 같은 곡선 요소, 사진, 방향이 제각각인 선, 질감이 아주 심한 이미지
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border-color)', alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={btn(true, !result)} disabled={!result} onClick={saveSvg}>SVG 저장</button>
          <button style={btn(false, !result)} disabled={!result} onClick={savePng}>PNG 저장</button>
          {result && (
            <span style={{ fontSize: 11.5, color: 'var(--text-tertiary, #64748b)' }}>
              {result.stats.method === 'color'
                ? '🎨 색 면 도식으로 인식 → 색 영역 그대로 벡터 변환 (글자는 윤곽선 모양)'
                : result.stats.method === 'perspective'
                  ? '🏢 원근 모델 캡처·렌더로 인식 → AI가 선화로 다시 그린 것을 벡터로 변환'
                  : <>
                  {'📐 선 도식으로 인식 · '}{result.stats.panels}칸 · 선 {result.stats.lines}개 · 화살촉 {result.stats.arrows} · 글자줄 {result.stats.text_lines}
                  {result.stats.text_editable ? ` (편집 가능 ${result.stats.text_editable})` : ''}
                  {result.stats.redraw_used ? ` · AI 재생성 ${result.stats.ai_panels}칸 / 원본 직접 ${result.stats.fallback_panels}칸` : ' · AI 재생성 안 함'}
                </>}
            </span>
          )}
          {(result?.stats?.panel_info || []).filter((p) => p.complex && !(result.simplified || []).includes(p.i)).map((p) => (
            <button key={p.i} style={{ ...btn(false, simplifying !== null), padding: '6px 10px', fontSize: 12 }} disabled={simplifying !== null}
              title="나무·사람 같은 디테일이 많아 선이 불완전할 수 있는 칸입니다. AI가 건물 구조를 읽어 박스 단선으로 단순하게 다시 그립니다(Gemini로 이미지 전송)."
              onClick={() => simplifyPanel(p)}>
              {simplifying === p.i ? `칸 ${p.i + 1} 단순화 중…` : `🧱 칸 ${p.i + 1}: AI가 구조를 읽어 단순화`}
            </button>
          ))}
          {result?.warnings?.length > 0 && (
            <span title={result.warnings.join('\n')} style={{ fontSize: 11.5, color: '#C2410C', cursor: 'help' }}>⚠ 안내 {result.warnings.length}건(마우스를 올려보세요)</span>
          )}
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 14, background: '#fff' }}>
          {!source && (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary, #64748b)', fontSize: 13, textAlign: 'center', lineHeight: 1.7 }}>
              왼쪽에서 이미지를 고르고 <b>선 추출하기</b>를 누르면<br />원본과 결과가 나란히 보입니다.
            </div>
          )}
          {source && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>원본</div>
                <img src={source.src} alt="원본 비교" style={{ width: '100%', border: '1px solid #eee' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>추출 결과 (SVG)</div>
                {result
                  ? <img src={resultSrc} alt="선 추출 결과" style={{ width: '100%', border: '1px solid #eee' }} />
                  : <div style={{ aspectRatio: `${source.width} / ${source.height}`, border: '1px dashed #ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12 }}>{busy ? '처리 중…' : '아직 결과가 없습니다'}</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState, useMemo, useRef } from 'react';
import { DIAGRAM_TYPES, EXAMPLE_SPECS, buildConceptPrompt, parseJsonLoose, renderSpec, getTextFields, setByPath } from './conceptDiagram/spec';

// 다이어그램 만들기 — 입력은 두 가지뿐: (1) 텍스트만, (2) 참고 이미지 + 텍스트.
// AI는 구조(JSON)만 정하고 그리기는 코드가 한다(글자 깨짐 없음, SVG 출력). 유료 API와 무관하게 동작한다.
// 유료 LLM을 붙이면 AI_MODELS 에 추가하면 된다.

const AI_MODELS = [{ id: 'gemini-3.1-flash-lite', label: 'Gemini Flash-Lite (무료)' }];
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

export default function ConceptDiagram({ addToast, apiFetch }) {
  const [userText, setUserText] = useState('');
  const [refImage, setRefImage] = useState(null);
  const [forcedType, setForcedType] = useState('auto');
  const [model, setModel] = useState(AI_MODELS[0].id);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { type, spec }
  const fileRef = useRef(null);

  const rendered = useMemo(() => {
    if (!result) return null;
    try { return { ...renderSpec(result.type, result.spec), error: null }; }
    catch (e) { return { svg: '', width: 0, height: 0, error: e.message }; }
  }, [result]);

  const fields = useMemo(() => (result ? getTextFields(result.type, result.spec) : []), [result]);
  const canGenerate = (userText.trim() || refImage) && !busy;

  const pickRef = async (file) => {
    if (!file) return;
    try { setRefImage(await readResizedPng(file)); }
    catch (e) { addToast?.('error', '이미지 불러오기 실패', e.message); }
  };

  const generate = async () => {
    if (!canGenerate) return;
    setBusy(true);
    try {
      const res = await apiFetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, max_tokens: 4000, temperature: 0.4,
          messages: [{
            role: 'user',
            content: buildConceptPrompt(forcedType, userText.trim(), !!refImage),
            ...(refImage ? { images: [refImage.split(',').pop()] } : {}),
          }],
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
      const data = await res.json();
      const parsed = parseJsonLoose(data.choices?.[0]?.message?.content);
      const guessed = parsed.steps ? 'massing' : 'site';
      const type = forcedType !== 'auto' ? forcedType : (DIAGRAM_TYPES[parsed.type] ? parsed.type : guessed);
      const { type: _drop, ...spec } = parsed;
      renderSpec(type, spec); // 그릴 수 있는지 먼저 검증
      setResult({ type, spec });
      addToast?.('success', '다이어그램 생성 완료', `${DIAGRAM_TYPES[type].label.split(' (')[0]}로 만들었습니다.`);
    } catch (e) {
      addToast?.('error', '다이어그램 생성 실패', e.message);
    } finally {
      setBusy(false);
    }
  };

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

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
      <div style={{ width: 340, flexShrink: 0, borderRight: '1px solid var(--border-color)', padding: 14, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', background: 'rgba(220, 228, 242, 0.35)' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 4 }}>다이어그램 만들기</div>
          <p style={{ fontSize: 11.5, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.6 }}>
            설명만 쓰거나, 참고 이미지와 설명을 함께 넣으세요. AI가 구성을 정하고 프로그램이 그려서 글자가 깨지지 않습니다.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>1. 설명</span>
          <textarea value={userText} onChange={(e) => setUserText(e.target.value)} rows={6} style={{ ...inputBase, resize: 'vertical', fontFamily: 'inherit' }}
            placeholder={'예) 공동주택 단지. 중앙 광장에서 사방으로 퍼지는 보행 흐름, 5가지 테마 정원, 외부공간과 프로그램의 순환 구조\n\n예) 직육면체 매스에서 중앙부를 덜어내고 상부에 작은 볼륨을 더해 최종 형태가 되는 4단계'} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>2. 참고 이미지 (선택)</span>
          {refImage ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <img src={refImage} alt="참고 이미지" style={{ width: '100%', maxHeight: 170, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border-color)', background: '#fff' }} />
              <button style={btn(false, busy)} disabled={busy} onClick={() => setRefImage(null)}>참고 이미지 제거</button>
            </div>
          ) : (
            <button style={{ ...btn(false), padding: '16px 10px', borderStyle: 'dashed' }} onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pickRef(e.dataTransfer.files?.[0]); }}>
              🖼️ 비슷한 느낌의 이미지 올리기
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pickRef(e.target.files?.[0]); e.target.value = ''; }} />
          <p style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.5 }}>
            이미지의 칸 구성과 요소를 보고 같은 형식으로 만들고, 내용은 위 설명을 따릅니다.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>종류</span>
          <select value={forcedType} onChange={(e) => setForcedType(e.target.value)} style={inputBase}>
            <option value="auto">자동 (내용 보고 AI가 선택)</option>
            {Object.entries(DIAGRAM_TYPES).map(([id, t]) => <option key={id} value={id}>{t.label}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <select value={model} onChange={(e) => setModel(e.target.value)} style={inputBase} title="AI 모델">
            {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <p style={{ fontSize: 11, color: '#C2410C', margin: 0, lineHeight: 1.5 }}>⚠️ 설명과 참고 이미지가 외부(Google Gemini)로 전송됩니다. 대외비 자료는 올리지 마세요.</p>
          <button style={btn(true, !canGenerate)} disabled={!canGenerate} onClick={generate}>
            {busy ? '만드는 중… (10~30초)' : '✨ 다이어그램 만들기'}
          </button>
        </div>

        {result && fields.length > 0 && (
          <details>
            <summary style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer' }}>글자 수정 (AI 재호출 없이 즉시 반영)</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {fields.map((f) => (
                <label key={f.path.join('.')} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--text-tertiary, #64748b)' }}>
                  {f.label}
                  <input style={inputBase} value={f.value} onChange={(e) => setResult({ type: result.type, spec: setByPath(result.spec, f.path, e.target.value) })} />
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
              <div>왼쪽에 설명(과 참고 이미지)을 넣고 <b>다이어그램 만들기</b>를 누르면<br />결과가 여기에 나타납니다.</div>
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

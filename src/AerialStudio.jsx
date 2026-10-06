import React, { useState, useRef, useEffect } from 'react';
import { ARCH_STYLE_PRESETS } from './archStyles';

// 조감도 탭 — 스케치업 캡처/매스 이미지를 유료 이미지 API(OpenAI, Google)로 실사 조감도로 만든다.
// AI 이미지 탭은 무료 로컬(ComfyUI) 전용이고, 이 탭만 외부 유료 API를 쓴다(2026-10-06 결정).

const ASPECTS = ['16:9', '3:2', '4:3', '1:1', '3:4', '9:16'];
const MAX_EDGE = 2048;

const inputBase = {
  padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)',
  background: 'rgba(255,255,255,0.8)', color: 'var(--text-primary)', fontSize: '12.5px',
};
const chip = (on, disabled) => ({
  padding: '7px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
  border: on ? '2px solid var(--accent-cyan)' : '1px solid var(--border-color)',
  background: on ? 'rgba(51,51,153,0.10)' : 'rgba(255,255,255,0.75)',
  color: on ? 'var(--accent-cyan)' : 'var(--text-secondary)',
});

const fileToResizedDataUrl = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
  fr.onload = () => {
    const img = new Image();
    img.onerror = () => reject(new Error('이미지 형식을 읽지 못했습니다.'));
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = String(fr.result);
  };
  fr.readAsDataURL(file);
});

const buildPrompt = (stylePrompt, extra) =>
  'Transform the attached architectural massing / sketch image into a photorealistic architectural rendering. ' +
  'Keep the building massing, proportions, number of floors, window layout and camera angle exactly as in the input image; ' +
  'do not add, remove or restyle floors. Add realistic materials, lighting, landscaping and sky. ' +
  `Style: ${stylePrompt}.` + (extra.trim() ? ` Additional requirements: ${extra.trim()}` : '');

export default function AerialStudio({ addToast, apiFetch, providers = [], onGenerated }) {
  const fileRef = useRef(null);
  const [image, setImage] = useState(null);
  const [styles, setStyles] = useState([]);
  const [perStyle, setPerStyle] = useState(1);
  const [extra, setExtra] = useState('');
  const [aspect, setAspect] = useState('16:9');
  const [provider, setProvider] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState([]);

  const available = providers.filter((p) => p.available);
  useEffect(() => {
    if (!available.some((p) => p.id === provider)) setProvider(available[0]?.id || '');
  }, [providers]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalJobs = styles.length * perStyle;
  const canGenerate = !!image && styles.length > 0 && !!provider && !busy;

  const onPickFile = async (file) => {
    if (!file) return;
    try { setImage(await fileToResizedDataUrl(file)); }
    catch (e) { addToast?.('error', '이미지 불러오기 실패', e.message); }
  };

  const generate = async () => {
    if (!canGenerate) return;
    const jobs = [];
    styles.forEach((id) => { for (let i = 0; i < perStyle; i++) jobs.push(id); });
    setBusy(true);
    setProgress({ current: 0, total: jobs.length });
    let ok = 0; let lastError = '';
    for (let i = 0; i < jobs.length; i++) {
      const preset = ARCH_STYLE_PRESETS[jobs[i]];
      try {
        const res = await apiFetch('/v1/image/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: buildPrompt(preset.prompt, extra),
            provider,
            aspect_ratio: aspect,
            style: 'architecture',
            input_image_base64: image.split(',').pop(),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '알 수 없는 오류');
        ok++;
        setResults((prev) => [{ id: `${Date.now()}-${i}`, filename: data.filename, label: preset.label, model: data.checkpoint_used }, ...prev]);
        onGenerated?.();
      } catch (e) {
        lastError = e.message;
      }
      setProgress({ current: i + 1, total: jobs.length });
    }
    setBusy(false);
    if (ok > 0) addToast?.('success', '조감도 생성 완료', `${ok}장 생성${ok < jobs.length ? ` (${jobs.length - ok}장 실패)` : ''}`);
    else addToast?.('error', '조감도 생성 실패', lastError);
    if (ok > 0 && ok < jobs.length && lastError) addToast?.('error', '일부 실패 사유', lastError);
  };

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
      <div style={{ width: 340, flexShrink: 0, borderRight: '1px solid var(--border-color)', padding: 14, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', background: 'rgba(220, 228, 242, 0.35)' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>조감도 (유료 AI)</div>
          <p style={{ fontSize: 11.5, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.6 }}>
            스케치업 캡처나 매스 이미지를 올리면 외부 유료 이미지 AI가 실사 조감도로 만들어 줍니다.
          </p>
          <p style={{ fontSize: 11.5, color: '#C2410C', margin: '6px 0 0', lineHeight: 1.5 }}>
            ⚠️ 이미지와 설명이 외부 서버(OpenAI/Google)로 전송되고 장당 과금됩니다. 대외비 도면은 올리지 마세요.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>1. 원본 이미지</span>
          {image ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <img src={image} alt="원본" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border-color)', background: '#fff' }} />
              <button style={chip(false, busy)} disabled={busy} onClick={() => setImage(null)}>이미지 제거</button>
            </div>
          ) : (
            <button
              style={{ ...chip(false), padding: '22px 10px', borderStyle: 'dashed' }}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); onPickFile(e.dataTransfer.files?.[0]); }}
            >
              🖼️ 이미지 선택 (또는 끌어다 놓기)
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onPickFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>2. 스타일 (여러 개 선택 가능)</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {Object.entries(ARCH_STYLE_PRESETS).map(([id, p]) => (
              <button key={id} title={p.desc} style={chip(styles.includes(id))}
                onClick={() => setStyles((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>3. 추가 요구사항 (선택, 한글 가능)</span>
          <textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={3}
            placeholder="예: 10층 오피스 건물, 1층은 유리 로비, 주변에 가로수와 보행자"
            style={{ ...inputBase, resize: 'vertical', fontFamily: 'inherit' }} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>화면 비율</span>
            <select value={aspect} onChange={(e) => setAspect(e.target.value)} style={inputBase}>
              {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>스타일당 장수</span>
            <select value={perStyle} onChange={(e) => setPerStyle(Number(e.target.value))} style={inputBase}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}장</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>AI 엔진</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {providers.map((p) => (
              <button key={p.id} disabled={!p.available} style={{ ...chip(provider === p.id, !p.available), flex: '1 1 auto' }}
                title={p.available ? p.model : 'API 키가 설정되지 않았습니다 (backend/.env)'}
                onClick={() => setProvider(p.id)}>
                {p.label}{p.available ? '' : ' · 키 없음'}
              </button>
            ))}
          </div>
          {available.length === 0 && (
            <p style={{ fontSize: 11.5, color: '#B91C1C', margin: 0, lineHeight: 1.5 }}>
              사용 가능한 유료 API 키가 없습니다. 관리자가 backend/.env 에 OPENAI_API_KEY 또는 GEMINI_IMAGE_API_KEY 를 넣어야 합니다.
            </p>
          )}
        </div>

        <button className="run-btn glow-cyan" style={{ padding: '12px', fontSize: 14, borderRadius: 10, opacity: canGenerate ? 1 : 0.55 }}
          onClick={generate} disabled={!canGenerate}>
          {busy ? `생성 중… (${progress.current}/${progress.total})` : `✨ 조감도 생성${totalJobs ? ` (${totalJobs}장, 유료)` : ''}`}
        </button>
      </div>

      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 16 }}>
        {results.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary, #64748b)', fontSize: 13, textAlign: 'center', lineHeight: 1.7 }}>
            왼쪽에서 이미지와 스타일을 고르고 생성하면<br />결과가 여기에 쌓입니다. 결과는 AI 이미지 탭의 보관함에도 저장됩니다.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {results.map((r) => (
              <div key={r.id} className="glass-card" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <a href={`/generated/${r.filename}`} target="_blank" rel="noreferrer">
                  <img src={`/generated/${r.filename}`} alt={r.label} style={{ width: '100%', borderRadius: 6, display: 'block' }} />
                </a>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span><strong>{r.label}</strong> · {r.model}</span>
                  <a href={`/generated/${r.filename}`} download style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>저장</a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

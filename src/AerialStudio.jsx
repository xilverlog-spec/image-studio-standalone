import React, { useState, useRef, useEffect } from 'react';
import { ARCH_STYLE_PRESETS } from './archStyles';

// 조감도 탭 — 스케치업 캡처/매스/3D 모델 이미지를 유료 이미지 API(OpenAI, Google)로 실사 조감도로 만든다.
// AI 이미지 탭은 무료 로컬(ComfyUI) 전용이고, 이 탭만 외부 유료 API를 쓴다(2026-10-06 결정).
// 2026-10-07: 프롬프트 미리보기(한글→영어 확장), 참조 이미지 여러 장(역할 지정), 형태 보존 점수, 비용 표시·하루 한도, 외부 전송 동의.

// 조감도 탭에 맞지 않는 프리셋(실내 투시도)은 뺀다. archStyles.js 원본은 건축물 탭도 쓰므로 건드리지 않는다.
const AERIAL_PRESETS = Object.fromEntries(Object.entries(ARCH_STYLE_PRESETS).filter(([id]) => id !== 'interior'));

// 로컬 SDXL용 키워드 나열("8k", "award-winning" 등)은 문장으로 이해하는 유료 모델에는 불필요하므로 지운다.
const cleanStylePrompt = (s) => s
  .replace(/,?\s*(8k resolution|8k|award-winning design|award-winning)\b/gi, '')
  .replace(/\bvilla\b/gi, 'building')
  .replace(/\s{2,}/g, ' ')
  .replace(/^[,\s]+|[,\s]+$/g, '');

const ASPECTS = ['16:9', '3:2', '4:3', '1:1', '3:4', '9:16'];
const ASPECT_VALUE = { '16:9': 16 / 9, '3:2': 3 / 2, '4:3': 4 / 3, '1:1': 1, '3:4': 3 / 4, '9:16': 9 / 16 };
const MAX_EDGE = 2048;
const REF_MAX_EDGE = 1280;
const MAX_REFS = 3;
const REF_ROLES = [
  { id: 'material', label: '재질' },
  { id: 'mood', label: '분위기' },
  { id: 'site', label: '대지·주변' },
];
// 형태 점수 기준(0~100): 입력의 뼈대 선이 결과에 얼마나 남았는지
const scoreInfo = (s) => (s == null ? { text: '점수 없음', color: '#64748b' }
  : s >= 55 ? { text: `형태 ${s} · 양호`, color: '#15803D' }
    : s >= 35 ? { text: `형태 ${s} · 주의`, color: '#C2410C' }
      : { text: `형태 ${s} · 변형 의심`, color: '#B91C1C' });
const AUTO_RETRY_BELOW = 35;

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
const label = { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' };
const hint = { fontSize: 11.5, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.55 };

const fileToResizedDataUrl = (file, maxEdge) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
  fr.onload = () => {
    const img = new Image();
    img.onerror = () => reject(new Error('이미지 형식을 읽지 못했습니다.'));
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({ dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height });
    };
    img.src = String(fr.result);
  };
  fr.readAsDataURL(file);
});

const nearestAspect = (w, h) => {
  const r = w / h;
  return ASPECTS.reduce((best, a) => (Math.abs(Math.log(ASPECT_VALUE[a] / r)) < Math.abs(Math.log(ASPECT_VALUE[best] / r)) ? a : best), ASPECTS[0]);
};

const readConsent = () => { try { return sessionStorage.getItem('aerial_consent') === '1'; } catch { return false; } };

export default function AerialStudio({ addToast, apiFetch, providers = [], onGenerated }) {
  const fileRef = useRef(null);
  const refFileRef = useRef(null);
  const [image, setImage] = useState(null);          // { dataUrl, width, height }
  const [refs, setRefs] = useState([]);               // [{ id, dataUrl, role }]
  const [styles, setStyles] = useState([]);
  const [perStyle, setPerStyle] = useState(1);
  const [extra, setExtra] = useState('');
  const [commonPrompt, setCommonPrompt] = useState('');
  const [promptBusy, setPromptBusy] = useState(false);
  const [aspect, setAspect] = useState('16:9');
  const [provider, setProvider] = useState('');
  const [consent, setConsent] = useState(readConsent);
  const [autoRetry, setAutoRetry] = useState(false);
  const [sortBy, setSortBy] = useState('recent');
  const [usage, setUsage] = useState(null);           // { usd, count, limit_usd }
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState([]);

  const available = providers.filter((p) => p.available);
  useEffect(() => {
    if (!available.some((p) => p.id === provider)) setProvider(available[0]?.id || '');
  }, [providers]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    apiFetch('/v1/image/options').then((r) => r.json()).then((d) => d.paid_usage && setUsage(d.paid_usage)).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const providerInfo = providers.find((p) => p.id === provider);
  const unitCost = providerInfo?.est_cost_usd || 0;
  const totalJobs = styles.length * perStyle;
  const estTotal = unitCost * totalJobs;
  const canGenerate = !!image && styles.length > 0 && !!provider && consent && !busy && !promptBusy;

  const setConsentSaved = (v) => {
    setConsent(v);
    try { sessionStorage.setItem('aerial_consent', v ? '1' : '0'); } catch { /* 저장 불가여도 이번 화면에서는 동작 */ }
  };

  const onPickFile = async (file) => {
    if (!file) return;
    try {
      const r = await fileToResizedDataUrl(file, MAX_EDGE);
      setImage(r);
      setAspect(nearestAspect(r.width, r.height));   // 입력과 비율이 달라지면 형태 점수를 매길 수 없어서 가장 가까운 비율로 맞춘다
    } catch (e) { addToast?.('error', '이미지 불러오기 실패', e.message); }
  };

  const onPickRef = async (file) => {
    if (!file || refs.length >= MAX_REFS) return;
    try {
      const r = await fileToResizedDataUrl(file, REF_MAX_EDGE);
      setRefs((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, dataUrl: r.dataUrl, role: 'material' }]);
    } catch (e) { addToast?.('error', '참조 이미지 불러오기 실패', e.message); }
  };

  const buildCommonPrompt = async () => {
    setPromptBusy(true);
    try {
      const res = await apiFetch('/v1/image/aerial-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extra, ref_roles: refs.map((r) => r.role) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '프롬프트를 만들지 못했습니다');
      setCommonPrompt(data.prompt);
      return data.prompt;
    } catch (e) {
      addToast?.('error', '프롬프트 생성 실패', e.message);
      return '';
    } finally { setPromptBusy(false); }
  };

  const oneGeneration = async (prompt, stylePrompt) => {
    const res = await apiFetch('/v1/image/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `${prompt} Style: ${stylePrompt}.`,
        provider,
        aspect_ratio: aspect,
        style: 'architecture',
        input_image_base64: image.dataUrl.split(',').pop(),
        reference_images: refs.map((r) => ({ role: r.role, base64: r.dataUrl.split(',').pop() })),
        external_consent: consent,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(typeof data.detail === 'string' ? data.detail : '알 수 없는 오류'); err.status = res.status; throw err; }
    if (data.usage_today) setUsage(data.usage_today);
    return data;
  };

  const generate = async () => {
    if (!canGenerate) return;
    const limitLeft = usage && usage.limit_usd > 0 ? usage.limit_usd - usage.usd : null;
    const retryNote = autoRetry ? `\n(형태 점수가 ${AUTO_RETRY_BELOW} 미만이면 1회 자동 재생성되어 최대 ${(unitCost * totalJobs * 2).toFixed(2)}달러까지 늘 수 있습니다)` : '';
    const msg = `${totalJobs}장 생성합니다. 예상 비용 약 $${estTotal.toFixed(2)} (${providerInfo?.label}, 추정치이며 실제 청구액과 다를 수 있습니다).`
      + (limitLeft != null ? `\n오늘 남은 한도 약 $${Math.max(0, limitLeft).toFixed(2)}.` : '') + retryNote + '\n진행할까요?';
    if (!window.confirm(msg)) return;

    setBusy(true);
    let prompt = commonPrompt;
    if (!prompt.trim()) prompt = await buildCommonPrompt();
    if (!prompt) { setBusy(false); return; }

    const jobs = [];
    styles.forEach((id) => { for (let i = 0; i < perStyle; i++) jobs.push(id); });
    setProgress({ current: 0, total: jobs.length });
    let ok = 0; let lastError = ''; let stop = false;
    for (let i = 0; i < jobs.length && !stop; i++) {
      const preset = AERIAL_PRESETS[jobs[i]];
      const stylePrompt = cleanStylePrompt(preset.prompt);
      try {
        let data = await oneGeneration(prompt, stylePrompt);
        let retried = false;
        if (autoRetry && data.form_score != null && data.form_score < AUTO_RETRY_BELOW) {
          const again = await oneGeneration(prompt, stylePrompt);
          retried = true;
          if ((again.form_score ?? -1) >= (data.form_score ?? -1)) data = again;   // 점수가 더 높은 쪽을 남긴다
        }
        ok++;
        setResults((prev) => [{
          id: `${Date.now()}-${i}`, filename: data.filename, label: preset.label, model: data.checkpoint_used,
          score: data.form_score, note: data.form_note, cost: data.est_cost_usd * (retried ? 2 : 1), t: Date.now(),
        }, ...prev]);
        onGenerated?.();
      } catch (e) {
        lastError = e.message;
        if (e.status === 429) stop = true;   // 하루 한도에 걸렸으면 더 시도하지 않는다
      }
      setProgress({ current: i + 1, total: jobs.length });
    }
    setBusy(false);
    if (ok > 0) addToast?.('success', '조감도 생성 완료', `${ok}장 생성${ok < jobs.length ? ` (${jobs.length - ok}장 실패)` : ''}`);
    else addToast?.('error', '조감도 생성 실패', lastError);
    if (ok > 0 && ok < jobs.length && lastError) addToast?.('error', '일부 실패 사유', lastError);
  };

  const shown = sortBy === 'score'
    ? [...results].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    : results;

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
      <div style={{ width: 360, flexShrink: 0, borderRight: '1px solid var(--border-color)', padding: 14, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', background: 'rgba(220, 228, 242, 0.35)' }}>
        <div>
          <div style={{ ...label, fontSize: 13, marginBottom: 4 }}>조감도 (유료 AI)</div>
          <p style={hint}>스케치업 캡처, 매스, 3D 모델 이미지를 올리면 외부 유료 이미지 AI가 형태를 지킨 실사 조감도로 만들어 줍니다.</p>
          <p style={{ ...hint, color: '#C2410C', marginTop: 6 }}>
            ⚠️ 이미지와 설명이 외부 서버(OpenAI/Google)로 전송되고 장당 과금됩니다. 대외비 도면은 올리지 마세요.
          </p>
          {usage && (
            <p style={{ ...hint, marginTop: 6 }} data-testid="aerial-usage">
              오늘 사용 약 ${usage.usd.toFixed(2)}{usage.limit_usd > 0 ? ` / 한도 $${usage.limit_usd.toFixed(0)}` : ''} ({usage.count}장, 추정치)
            </p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={label}>1. 원본 이미지 (형태 기준)</span>
          {image ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <img src={image.dataUrl} alt="원본" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border-color)', background: '#fff' }} />
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
          <span style={label}>2. 참조 이미지 (선택, 최대 {MAX_REFS}장)</span>
          <p style={hint}>재질·분위기·대지 참고를 역할별로 넣으면 그 역할만 가져오고 건물 모양은 바꾸지 않도록 지시합니다.</p>
          {refs.map((r) => (
            <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <img src={r.dataUrl} alt="참조" style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border-color)' }} />
              <select value={r.role} disabled={busy} style={{ ...inputBase, flex: 1 }}
                onChange={(e) => setRefs((prev) => prev.map((x) => (x.id === r.id ? { ...x, role: e.target.value } : x)))}>
                {REF_ROLES.map((o) => <option key={o.id} value={o.id}>{o.label} 참고</option>)}
              </select>
              <button style={{ ...chip(false, busy), padding: '5px 8px' }} disabled={busy} onClick={() => setRefs((prev) => prev.filter((x) => x.id !== r.id))}>삭제</button>
            </div>
          ))}
          {refs.length < MAX_REFS && (
            <button style={{ ...chip(false, busy), borderStyle: 'dashed' }} disabled={busy} onClick={() => refFileRef.current?.click()}>＋ 참조 이미지 추가</button>
          )}
          <input ref={refFileRef} type="file" accept="image/*" hidden onChange={(e) => { onPickRef(e.target.files?.[0]); e.target.value = ''; }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={label}>3. 스타일 (여러 개 선택 가능)</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {Object.entries(AERIAL_PRESETS).map(([id, p]) => (
              <button key={id} title={p.desc} style={chip(styles.includes(id))}
                onClick={() => setStyles((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={label}>4. 추가 요구사항 (선택, 한글 가능)</span>
          <textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={3}
            placeholder="예: 10층 오피스 건물, 1층은 유리 로비, 주변에 가로수와 보행자, 해질녘"
            style={{ ...inputBase, resize: 'vertical', fontFamily: 'inherit' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={label}>5. 최종 프롬프트 (영어, 직접 고칠 수 있음)</span>
            <button style={{ ...chip(false, busy || promptBusy), padding: '4px 8px', fontSize: 11.5 }} disabled={busy || promptBusy} onClick={buildCommonPrompt}>
              {promptBusy ? '만드는 중…' : commonPrompt ? '다시 만들기' : '프롬프트 만들기'}
            </button>
          </div>
          <textarea value={commonPrompt} onChange={(e) => setCommonPrompt(e.target.value)} rows={7} disabled={busy}
            placeholder={'"프롬프트 만들기"를 누르면 형태 고정 문구, 참조 이미지 역할, 한글 요청의 영어 확장이 합쳐져 여기에 나타납니다. 비워 두고 생성하면 자동으로 만들어서 씁니다.\n선택한 스타일 문구는 각 장마다 뒤에 붙습니다.'}
            style={{ ...inputBase, resize: 'vertical', fontFamily: 'inherit', fontSize: 11.5, lineHeight: 1.5 }} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={label}>화면 비율</span>
            <select value={aspect} onChange={(e) => setAspect(e.target.value)} style={inputBase}>
              {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={label}>스타일당 장수</span>
            <select value={perStyle} onChange={(e) => setPerStyle(Number(e.target.value))} style={inputBase}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}장</option>)}
            </select>
          </div>
        </div>
        {image && aspect !== nearestAspect(image.width, image.height) && (
          <p style={{ ...hint, color: '#C2410C' }}>입력과 화면 비율이 달라서 형태 보존 점수를 계산하지 못할 수 있습니다.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={label}>AI 엔진</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {providers.map((p) => (
              <button key={p.id} disabled={!p.available} style={{ ...chip(provider === p.id, !p.available), flex: '1 1 auto' }}
                title={p.available ? `${p.model} · 장당 약 $${(p.est_cost_usd || 0).toFixed(2)}(추정)` : 'API 키가 설정되지 않았습니다 (backend/.env)'}
                onClick={() => setProvider(p.id)}>
                {p.label}{p.available ? ` · ~$${(p.est_cost_usd || 0).toFixed(2)}/장` : ' · 키 없음'}
              </button>
            ))}
          </div>
          {available.length === 0 && (
            <p style={{ ...hint, color: '#B91C1C' }}>
              사용 가능한 유료 API 키가 없습니다. 관리자가 backend/.env 에 OPENAI_API_KEY 또는 GEMINI_IMAGE_API_KEY 를 넣어야 합니다.
            </p>
          )}
        </div>

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsentSaved(e.target.checked)} style={{ marginTop: 3 }} />
          <span>이 이미지와 설명이 외부 서버(OpenAI/Google)로 전송되는 것에 동의합니다. (이번 접속 동안 유지)</span>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={autoRetry} onChange={(e) => setAutoRetry(e.target.checked)} style={{ marginTop: 3 }} />
          <span>형태 점수가 낮으면(&lt;{AUTO_RETRY_BELOW}) 1회 자동 재생성하고 더 나은 쪽을 남김 (추가 비용)</span>
        </label>

        <button className="run-btn glow-cyan" style={{ padding: '12px', fontSize: 14, borderRadius: 10, opacity: canGenerate ? 1 : 0.55 }}
          onClick={generate} disabled={!canGenerate}>
          {busy ? `생성 중… (${progress.current}/${progress.total})` : `✨ 조감도 생성${totalJobs ? ` (${totalJobs}장, 약 $${estTotal.toFixed(2)})` : ''}`}
        </button>
        {!consent && image && styles.length > 0 && <p style={{ ...hint, color: '#B91C1C', marginTop: -6 }}>외부 전송 동의에 체크해야 생성할 수 있습니다.</p>}
      </div>

      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 16 }}>
        {results.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary, #64748b)', fontSize: 13, textAlign: 'center', lineHeight: 1.7 }}>
            왼쪽에서 이미지와 스타일을 고르고 생성하면<br />결과가 여기에 쌓입니다. 결과는 AI 이미지 탭의 보관함에도 저장됩니다.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
              정렬
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={inputBase}>
                <option value="recent">최신순</option>
                <option value="score">형태 점수 높은 순</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
              {shown.map((r) => {
                const si = scoreInfo(r.score);
                return (
                  <div key={r.id} className="glass-card" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <a href={`/generated/${r.filename}`} target="_blank" rel="noreferrer">
                      <img src={`/generated/${r.filename}`} alt={r.label} style={{ width: '100%', borderRadius: 6, display: 'block' }} />
                    </a>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
                      <span><strong>{r.label}</strong> · {r.model}</span>
                      <a href={`/generated/${r.filename}`} download style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>저장</a>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                      <span title={r.note || '입력 이미지의 뼈대 선이 결과에 남은 정도(0~100)'} style={{ color: si.color, fontWeight: 700 }}>{si.text}</span>
                      <span style={{ color: 'var(--text-tertiary, #64748b)' }}>약 ${r.cost?.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

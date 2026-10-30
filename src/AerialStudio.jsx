import React, { useState, useRef, useEffect, useMemo } from 'react';
import { PENDING_KEY, pendingAdd, pendingRemove, pendingFresh, matchRecovered, decidePending, recoveredEntry, mergeFromHistory, recoveryHave, collectRecovered, belongsToProject, scopedKey, onlyPaid } from './aerialRecover';
import { pickPaidProvider } from './aerialEngine';

// 조감도 탭 — 모델링(스케치업 캡처·매스·3D 모델) 이미지를 실사 렌더로 만든다.
// 작업 방식 3가지: 분위기 렌더(시간대·날씨 비교) / 입면 비교(형태는 두고 재료만 바꿔 여러 안) / 레퍼런스 적용(원하는 사진의 재료·분위기를 내 건물에).
// 엔진: 유료 API(Google 먼저, 없으면 OpenAI)만 쓰고 고르는 칸은 없다(2026-10-27). 쓸 수 있는 유료 엔진이 없으면(키 없음·프로젝트 외부 전송 금지) 생성을 막고 이유를 안내한다.
// 선택지·문구는 백엔드(aerial_modes.py)가 한 곳에서 내려준다.

const ASPECTS = ['16:9', '3:2', '4:3', '1:1', '3:4', '9:16'];
const ASPECT_VALUE = { '16:9': 16 / 9, '3:2': 3 / 2, '4:3': 4 / 3, '1:1': 1, '3:4': 3 / 4, '9:16': 9 / 16 };
const MAX_EDGE = 2048;
const REF_MAX_EDGE = 1280;
const MAX_REFS = 3;
const SAVED_KEY = 'aerial_results_v1';
const MAX_SAVED = 60;
// 분위기는 선택 사항이다(아무것도 안 고르면 프롬프트 내용만으로 1장). 입면 비교는 입면 후보를 골라야 한다.
const DEFAULT_PICKS = { render: [], facade: ['glass', 'redbrick', 'timber'], reference: [] };
const VARIANT_OPTIONAL = (mode) => mode !== 'facade';

// 형태 점수 기준(0~100): 입력의 뼈대 선이 결과에 얼마나 남았는지
const scoreInfo = (s) => (s == null ? { text: '점수 없음', color: '#64748b' }
  : s >= 40 ? { text: `형태 ${s} · 양호`, color: 'var(--ok)' }
    : s >= 25 ? { text: `형태 ${s} · 주의`, color: 'var(--warn)' }
      : { text: `형태 ${s} · 변형 의심`, color: 'var(--err)' });
// 실측(무료 엔진 6장): 형태가 잘 지켜진 결과 40~53, 형태가 무너진 결과 3~33
const AUTO_RETRY_BELOW = 25;

const inputBase = {
  padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--line-strong)',
  background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '12.5px',
};
const chip = (on, disabled) => ({
  padding: '7px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
  border: on ? '2px solid var(--accent-cyan)' : '1px solid var(--line-strong)',
  background: on ? 'rgba(51,51,153,0.10)' : 'rgba(255,255,255,0.75)',
  color: on ? 'var(--accent-cyan)' : 'var(--text-secondary)',
});
const label = { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' };
const hint = { fontSize: 11.5, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.55 };
const col = { display: 'flex', flexDirection: 'column', gap: 6 };
// 왼쪽 패널: 다이어그램 탭과 같은 수준 — 연한 바탕색 위에 굵은 제목 + 흰 입력창(또렷한 테두리). 항목마다 박스는 두지 않는다
const cardPad = {};
const card = { ...col, gap: 8 };

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
      resolve({ dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, resized: scale < 1, srcWidth: img.width, srcHeight: img.height });
    };
    img.src = String(fr.result);
  };
  fr.readAsDataURL(file);
});

const urlToDataUrl = async (url) => {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
    fr.readAsDataURL(blob);
  });
};

// 비교용으로 원본을 작게(긴 변 900px, JPEG) 만든다 — 결과마다 들고 있어도 메모리가 크지 않다.
const makeThumb = (dataUrl) => new Promise((resolve) => {
  const img = new Image();
  img.onerror = () => resolve(null);
  img.onload = () => {
    const s = Math.min(1, 900 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    resolve(c.toDataURL('image/jpeg', 0.85));
  };
  img.src = dataUrl;
});

const nearestAspect = (w, h) => {
  const r = w / h;
  return ASPECTS.reduce((best, a) => (Math.abs(Math.log(ASPECT_VALUE[a] / r)) < Math.abs(Math.log(ASPECT_VALUE[best] / r)) ? a : best), ASPECTS[0]);
};

const readConsent = () => { try { return sessionStorage.getItem('aerial_consent') === '1'; } catch { return false; } };
const readSavedFor = (project) => { // 프로젝트별 키. 예전(프로젝트 구분 없던) 저장값은 그 프로젝트 폴더의 파일만 골라 쓴다
  try {
    const own = localStorage.getItem(scopedKey(SAVED_KEY, project));
    if (own) return JSON.parse(own);
    return (JSON.parse(localStorage.getItem(SAVED_KEY) || '[]') || []).filter((r) => r && belongsToProject(r.filename, project));
  } catch { return []; }
};
const writeSavedFor = (list, project) => { try { localStorage.setItem(scopedKey(SAVED_KEY, project), JSON.stringify(list.slice(0, MAX_SAVED))); } catch { /* 저장 불가여도 화면에서는 동작 */ } };
const CLEARED_KEY = 'aerial_cleared_at_v1';   // '목록 비우기'를 누른 시각 — 이보다 앞선 서버 기록은 목록에 다시 올리지 않는다
const readClearedFor = (project) => { try { return Number(localStorage.getItem(scopedKey(CLEARED_KEY, project))) || 0; } catch { return 0; } };
const writeClearedFor = (t, project) => { try { localStorage.setItem(scopedKey(CLEARED_KEY, project), String(t)); } catch { /* 저장 불가여도 화면에서는 동작 */ } };
const readPendingFor = (project) => { try { return JSON.parse(localStorage.getItem(scopedKey(PENDING_KEY, project)) || '[]'); } catch { return []; } };
const writePendingFor = (list, project) => { try { localStorage.setItem(scopedKey(PENDING_KEY, project), JSON.stringify(list)); } catch { /* 저장 불가여도 화면에서는 동작 */ } };

// 원본(왼쪽)과 결과(오른쪽)를 가운데 선을 끌어 비교한다.
function CompareSlider({ before, after }) {
  const [pos, setPos] = useState(50);
  return (
    <div style={{ position: 'relative', lineHeight: 0, borderRadius: 6, overflow: 'hidden', userSelect: 'none' }}>
      <img src={after} alt="결과" style={{ width: '100%', display: 'block' }} />
      <img src={before} alt="원본" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos}%`, width: 2, background: '#fff', boxShadow: '0 0 4px rgba(0,0,0,0.5)' }} />
      <input type="range" min="0" max="100" value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="원본·결과 비교"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 6, width: '100%', opacity: 0.85 }} />
      <span style={{ position: 'absolute', left: 8, top: 6, fontSize: 11, color: '#fff', background: 'rgba(0,0,0,0.55)', padding: '1px 6px', borderRadius: 4 }}>원본</span>
      <span style={{ position: 'absolute', right: 8, top: 6, fontSize: 11, color: '#fff', background: 'rgba(0,0,0,0.55)', padding: '1px 6px', borderRadius: 4 }}>결과</span>
    </div>
  );
}

// isEasyMode(앱 상단 이지/프로 스위치): 이지 = 이미지 + 글만 넣고 바로 생성(나머지는 기본값). 프로 = 작업 방식·참조 사진 역할·입면·분위기 등 전부 지정. 엔진은 두 모드 모두 유료 전용.
export default function AerialStudio({ addToast, apiFetch, onGenerated, isEasyMode = false, project = '' }) {
  // 이 프로젝트의 저장값만 읽고 쓴다(프로젝트를 바꾸면 App 이 이 화면을 새로 띄운다)
  const readSaved = () => onlyPaid(readSavedFor(project)); const writeSaved = (l) => writeSavedFor(l, project); const readCleared = () => readClearedFor(project); const writeCleared = (t) => writeClearedFor(t, project);
  const readPending = () => readPendingFor(project); const writePending = (l) => writePendingFor(l, project);
  const easy = !!isEasyMode;
  const fileRef = useRef(null);
  const refFileRef = useRef(null);
  const easyFileRef = useRef(null);
  const topRef = useRef(null);
  const [opts, setOpts] = useState(null);             // { modes, facades, atmospheres, ref_roles, providers, external_allowed }
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyPw, setPolicyPw] = useState('');
  const [policyBusy, setPolicyBusy] = useState(false);
  const [modeSel, setMode] = useState('render');
  const [picks, setPicks] = useState(DEFAULT_PICKS);
  const [imageSel, setImage] = useState(null);        // 프로: { dataUrl, width, height, resized, srcWidth, srcHeight }
  const [easyImgs, setEasyImgs] = useState([]);        // 이지: 여러 장 첨부 [{ id, dataUrl, ... }] — 첫 번째가 원본, 나머지는 참조(최대 3장)
  const [refsSel, setRefs] = useState([]);            // [{ id, dataUrl, role }]
  const [perVariant, setPerVariant] = useState(1);
  const [extra, setExtra] = useState('');
  const [commonPrompt, setCommonPrompt] = useState('');
  const [extraEn, setExtraEn] = useState('');
  const [promptEdited, setPromptEdited] = useState(false);
  const [refMeta, setRefMeta] = useState({ roles: [], hints: [], notes: [] });   // aerial-prompt 가 정리한 참조별 역할·가져올 것·분석 요약(짧은 지시문용)
  const [builtFor, setBuiltFor] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptBusy, setPromptBusy] = useState(false);
  const [aspect, setAspect] = useState('16:9');
  const [keepForm, setKeepForm] = useState(85);
  const [keepSiteSel, setKeepSite] = useState(true);   // 부지·주변은 원본 그대로 두고 건물만 바꾼다
  const [depths, setDepths] = useState({});            // 방식별 변경 폭. 입면 비교: material 재료만 | redesign 재디자인(형태 약 70%) / 레퍼런스: ref_apply 그대로 입히기 | ref_propose 참고해서 새로 제안
  const [consent, setConsent] = useState(readConsent);
  const [autoRetry, setAutoRetry] = useState(true);
  const [sortBy, setSortBy] = useState('recent');
  const [usage, setUsage] = useState(null);           // { usd, count, limit_usd }
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState(readSaved);
  const resultsRef = useRef(results); resultsRef.current = results;
  const liveTickets = useRef(new Set());          // 이번 접속에서 보낸 요청의 번호표(되찾기 대상이 아니다)
  const [recovering, setRecovering] = useState(0);  // 새로고침 전에 시작해 서버에서 확인 중인 작업 수
  const [thumbs, setThumbs] = useState({});           // 결과 id → 원본 썸네일(이번 접속에서만)
  const [compareOn, setCompareOn] = useState({});     // 결과 id → 슬라이더 비교 펼침
  const [picked, setPicked] = useState([]);           // 나란히 비교용 선택 id
  const [sideBySide, setSideBySide] = useState(false);
  const [editText, setEditText] = useState({});
  const [editBusy, setEditBusy] = useState('');
  const ticketRef = useRef('');   // 지금 서버에 보낸 요청의 대기 번호표
  const [queue, setQueue] = useState({ position: 0, total: 0 });
  const [nowTick, setNowTick] = useState(0);

  // 이지 모드에서는 프로 설정(작업 방식, 참조 사진, 입면·분위기 선택, 엔진, 부지 옵션)을 전부 무시하고 기본값으로 만든다.
  const mode = easy ? 'render' : modeSel;
  const image = easy ? (easyImgs[0] || null) : imageSel;
  const refs = easy ? easyImgs.slice(1).map((x) => ({ id: x.id, dataUrl: x.dataUrl, role: 'facade', hint: '' })) : refsSel;   // 이지: 역할은 서버가 글에서 읽어 낸다(infer_roles)
  const keepSite = easy ? true : keepSiteSel;
  const modeInfo = opts?.modes.find((m) => m.id === mode);
  const providers = opts?.providers || [];
  const provider = pickPaidProvider(providers, opts?.external_allowed);   // 쓸 수 있는 유료 엔진 하나(Google 먼저). 없으면 ''
  const providerInfo = providers.find((p) => p.id === provider);
  const paid = !!providerInfo && !providerInfo.free;
  const retryOn = autoRetry && !easy;   // 이지 모드엔 끄는 칸이 없어서, 몰래 두 번 과금되지 않도록 자동 재생성을 쓰지 않는다(프로는 칸이 있고 기본 켜짐)
  const variantList = mode === 'facade' ? opts?.facades : opts?.atmospheres;
  const picked0 = easy ? [] : (picks[mode] || []);
  const chosen = picked0.length === 0 && VARIANT_OPTIONAL(mode) ? [''] : picked0;   // 분위기를 안 고르면 변형 문구 없이 1가지로 만든다
  const totalJobs = chosen.length * perVariant;
  const unitCost = providerInfo?.est_cost_usd || 0;
  const estTotal = unitCost * totalJobs;
  const perImageMin = 1;   // 유료 이미지 한 장에 걸리는 시간(분, 대략) — 진행 표시의 남은 시간용
  const refsNeeded = !!modeInfo?.needs_ref;
  const refsOk = !refsNeeded || refs.length > 0;
  const canGenerate = !!image && totalJobs > 0 && !!provider && refsOk && (!paid || consent) && !busy && !promptBusy;

  const loadOptions = () => apiFetch('/v1/image/aerial-options').then((r) => r.json()).then((d) => {
    if (d.status !== 'success') return;
    setOpts(d);
  }).catch(() => {});

  useEffect(() => {
    loadOptions();
    apiFetch('/v1/image/options').then((r) => r.json()).then((d) => d.paid_usage && setUsage(d.paid_usage)).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 프로젝트의 외부 전송 허용 여부를 바꾼다(프로젝트 비밀번호 필요). 금지하면 유료 엔진과 Gemini 호출이 서버에서 막힌다.
  const changeExternalPolicy = async (allowed) => {
    if (!policyPw) { addToast?.('error', '비밀번호 필요', '프로젝트 비밀번호를 입력하세요.'); return; }
    setPolicyBusy(true);
    try {
      const proj = (await (await apiFetch('/v1/projects/external-policy')).json()).project;
      const res = await fetch('/v1/projects/external-policy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: proj, password: policyPw, allowed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '설정을 바꾸지 못했습니다');
      setPolicyPw(''); setPolicyOpen(false);
      addToast?.('success', '프로젝트 설정 변경', allowed ? '외부 서버 전송을 허용했습니다.' : '외부 서버 전송을 금지했습니다. 유료 엔진과 Gemini는 이 프로젝트에서 쓸 수 없습니다.');
      await loadOptions();
    } catch (e) { addToast?.('error', '설정 변경 실패', e.message); }
    setPolicyBusy(false);
  };

  useEffect(() => {
    if (!busy) return undefined;
    const t = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  // 결과 목록은 새로고침해도 남긴다(파일은 서버 보관함에 있으므로 이름과 설정만 저장).
  useEffect(() => { writeSaved(results); }, [results]);

  // 서버에 쌓인 지난 조감도(서버 생성 이력 중 조감도 파일)를 열 때 한 번 합친다 — 주소가 다르거나 다른 PC 에서 열어도 같은 결과가 보이도록. 못 읽어도 이 브라우저의 목록은 그대로 쓴다.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await apiFetch('/v1/image/history?limit=500');   // 조감도 아닌 이미지가 섞여 있어 넉넉히 받아 조감도만 고른다
        if (!r.ok || !alive) return;
        const gens = (await r.json()).generations || [];
        if (alive) setResults((prev) => mergeFromHistory(prev, gens, readCleared()));
      } catch { /* 서버 기록을 못 읽어도 이 브라우저의 목록은 그대로 */ }
    })();
    return () => { alive = false; };
  }, [apiFetch]);

  // 생성·수정 중에는 4초마다 내 순서를 묻는다(다른 직원이 먼저 누른 작업이 있으면 그만큼 기다린다)
  useEffect(() => {
    if (!busy && !editBusy) { setQueue({ position: 0, total: 0 }); return undefined; }
    let alive = true;
    const poll = async () => {
      if (!ticketRef.current) return;
      try {
        const res = await apiFetch(`/v1/image/aerial/queue?ticket=${encodeURIComponent(ticketRef.current)}`);
        if (res.ok && alive) setQueue(await res.json());
      } catch { /* 다음 주기에 다시 */ }
    };
    const id = setInterval(poll, 4000);
    poll();
    return () => { alive = false; clearInterval(id); };
  }, [busy, editBusy, apiFetch]);

  // 새로고침 전에 시작한 작업의 결과 되찾기: 서버는 끝까지 만들어 파일·이력에 저장하므로, 남은 진행 중 메모를 서버 줄(번호표)·이력과 맞춰 본다.
  useEffect(() => {
    let alive = true; let timer = null; const gone = {}; const claimed = new Set();
    const step = async () => {
      const now = Date.now();
      writePending(pendingFresh(readPending(), now));                                           // 오래되거나 망가진 메모 정리
      const list = pendingFresh(readPending(), now).filter((r) => !liveTickets.current.has(r.ticket));
      if (!alive) return;
      setRecovering(list.length);
      if (!list.length) return;
      let gens = null;
      for (const rec of list) {
        let pos = 0;
        try { const r = await apiFetch(`/v1/image/aerial/queue?ticket=${encodeURIComponent(rec.ticket)}`); if (!r.ok) continue; pos = Number((await r.json()).position) || 0; } catch { continue; }
        let match = null;
        if (pos === 0) {
          if (gens === null) { try { const r = await apiFetch('/v1/image/history?limit=80'); gens = r.ok ? ((await r.json()).generations || []) : null; } catch { gens = null; } }
          if (gens === null) continue;
          match = matchRecovered(rec, gens, recoveryHave(resultsRef.current), claimed);
        }
        const d = decidePending(rec, pos, match, Date.now(), gone[rec.ticket] ?? null);
        gone[rec.ticket] = d.goneSince;
        if (!alive) return;
        if (d.action === 'collect') {
          claimed.add(match.id); writePending(pendingRemove(readPending(), rec.ticket));
          setResults((prev) => collectRecovered(prev, recoveredEntry(rec, match, Date.now())));
          addToast?.('success', '새로고침 전에 시작한 조감도를 되찾았습니다', `${rec.label || '조감도'} — 서버에서 끝난 결과를 결과 목록에 넣었습니다.`);
          onGenerated?.();
        } else if (d.action === 'lost') {
          writePending(pendingRemove(readPending(), rec.ticket));
          addToast?.('info', '새로고침 전에 시작한 조감도 작업이 끝나지 않았습니다', '서버가 재시작됐거나 생성에 실패했을 수 있습니다. 다시 만들어 주세요.');
        }
      }
      if (alive) timer = setTimeout(step, 5000);
    };
    step();
    return () => { alive = false; clearTimeout(timer); };
  }, [apiFetch]); // eslint-disable-line react-hooks/exhaustive-deps

  const setConsentSaved = (v) => {
    setConsent(v);
    try { sessionStorage.setItem('aerial_consent', v ? '1' : '0'); } catch { /* 저장 불가여도 이번 화면에서는 동작 */ }
  };

  const onPickFile = async (file) => {
    if (!file) return;
    try {
      const r = await fileToResizedDataUrl(file, MAX_EDGE);
      if (easy) setEasyImgs([{ id: `${Date.now()}-0`, ...r }]);   // 이지: 원본을 새로 지정(기존 참조는 비운다)
      else setImage(r);
      setAspect(nearestAspect(r.width, r.height));   // 입력과 비율이 달라지면 형태 점수를 매길 수 없어서 가장 가까운 비율로 맞춘다
    } catch (e) { addToast?.('error', '이미지 불러오기 실패', e.message); }
  };

  // 이지: 한 번에 여러 장 첨부. 첫 번째가 원본(형태 기준), 나머지는 참조. 원본 1장 + 참조 최대 MAX_REFS장.
  const onPickEasyFiles = async (fileList) => {
    const files = [...(fileList || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    const room = 1 + MAX_REFS - easyImgs.length;
    if (room <= 0) { addToast?.('error', '더 넣을 수 없음', `이미지는 원본 1장 + 참조 ${MAX_REFS}장까지입니다.`); return; }
    if (files.length > room) addToast?.('info', '일부만 넣었습니다', `이미지는 총 ${1 + MAX_REFS}장까지라 ${room}장만 추가하고 나머지는 제외했습니다.`);
    const added = [];
    for (const f of files.slice(0, room)) {
      try {
        const isFirst = easyImgs.length + added.length === 0;
        const r = await fileToResizedDataUrl(f, isFirst ? MAX_EDGE : REF_MAX_EDGE);
        added.push({ id: `${Date.now()}-${easyImgs.length + added.length}`, ...r });
      } catch (e) { addToast?.('error', '이미지 불러오기 실패', e.message); }
    }
    if (!added.length) return;
    if (easyImgs.length === 0) setAspect(nearestAspect(added[0].width, added[0].height));
    setEasyImgs((prev) => [...prev, ...added]);
  };
  const moveEasyImg = (idx, dir) => setEasyImgs((prev) => {
    const j = idx + dir;
    if (j < 0 || j >= prev.length) return prev;
    const next = [...prev]; [next[idx], next[j]] = [next[j], next[idx]];
    return next;
  });

  const onPickRef = async (file) => {
    if (!file || refs.length >= MAX_REFS) return;
    try {
      const r = await fileToResizedDataUrl(file, REF_MAX_EDGE);
      setRefs((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, dataUrl: r.dataUrl, role: mode === 'reference' ? 'facade' : 'material', hint: '' }]);
    } catch (e) { addToast?.('error', '참조 이미지 불러오기 실패', e.message); }
  };

  const togglePick = (id) => setPicks((p) => ({ ...p, [mode]: (p[mode] || []).includes(id) ? p[mode].filter((x) => x !== id) : [...(p[mode] || []), id] }));
  const optionalVariants = VARIANT_OPTIONAL(mode);

  const modeDepths = (opts?.depths || []).filter((d) => d.mode === mode);
  const activeDepth = modeDepths.length ? (depths[mode] || opts?.default_depth?.[mode] || modeDepths[0].id) : 'material';
  const pickDepth = (d) => {
    setDepths((prev) => ({ ...prev, [mode]: d }));
    const keep = opts?.depths?.find((x) => x.id === d)?.keep_form;
    if (keep) setKeepForm(keep);   // 빠른 초안 엔진의 형태 유지 슬라이더도 같이 맞춘다
  };
  const redesigned = activeDepth === 'redesign' || activeDepth === 'ref_propose';

  const promptKey = useMemo(() => JSON.stringify([mode, activeDepth, keepSite, extra.trim(), refs.map((r) => `${r.id}:${r.role}:${(r.hint || '').trim()}`), easy]), [mode, activeDepth, keepSite, extra, refs, easy]);
  const promptStale = !!commonPrompt && builtFor !== promptKey;

  const buildCommonPrompt = async () => {
    setPromptBusy(true);
    try {
      const res = await apiFetch('/v1/image/aerial-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extra, ref_roles: refs.map((r) => r.role), ref_images: refs.map((r) => r.dataUrl.split(',').pop()), ref_hints: refs.map((r) => r.hint || ''), infer_roles: easy && refs.length > 0, keep_site: keepSite, mode, depth: activeDepth }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '프롬프트를 만들지 못했습니다');
      setCommonPrompt(data.prompt); setExtraEn(data.extra_en || ''); setPromptEdited(false); setBuiltFor(promptKey);
      setRefMeta({ roles: data.ref_roles_used || [], hints: data.ref_hints_en || [], notes: data.ref_notes || [] });
      return { prompt: data.prompt, extraEn: data.extra_en || '', meta: { roles: data.ref_roles_used || [], hints: data.ref_hints_en || [], notes: data.ref_notes || [] } };
    } catch (e) {
      addToast?.('error', '프롬프트 생성 실패', e.message);
      return null;
    } finally { setPromptBusy(false); }
  };

  const postJson = async (path, body) => {
    const res = await apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(typeof data.detail === 'string' ? data.detail : '알 수 없는 오류'); err.status = res.status; throw err; }
    if (data.usage_today) setUsage(data.usage_today);
    return data;
  };

  const newTicket = () => { ticketRef.current = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; return ticketRef.current; };

  // 진행 중 메모: 시작할 때 남기고, 요청이 끝나면(성공·실패 모두) 지운다. 새로고침으로 화면이 사라지면 지워지지 않고 남아 다시 열렸을 때 되찾는 근거가 된다.
  const track = (rec, p) => {
    liveTickets.current.add(rec.ticket);
    writePending(pendingAdd(readPending(), rec));
    return p.finally(() => { liveTickets.current.delete(rec.ticket); writePending(pendingRemove(readPending(), rec.ticket)); });
  };

  const oneGeneration = (variant, prompt, ex, meta = refMeta, label = '') => { const ticket = newTicket(); return track({ ticket, t0: Date.now(), label, mode, kind: 'gen', paid }, postJson('/v1/image/aerial/generate', {
    ticket,
    mode, variant, depth: activeDepth, common_prompt: prompt, extra_en: ex, provider, aspect_ratio: aspect, keep_form: keepForm,
    input_image_base64: image.dataUrl.split(',').pop(),
    reference_images: refs.map((r) => ({ role: r.role, base64: r.dataUrl.split(',').pop() })),
    external_consent: consent,
    prompt_style: promptEdited ? 'long' : 'auto',   // 사용자가 프롬프트를 직접 고쳤으면 그 글을 그대로 쓰는 긴 방식으로 보낸다
    ref_roles: meta.roles, ref_hints_en: meta.hints, ref_notes: meta.notes,
  })); };

  const addResult = (data, extraFields) => {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, filename: data.filename, model: data.checkpoint_used,
      score: data.form_score, note: data.form_note, cost: data.est_cost_usd || 0, seed: data.seed_used, sec: data.elapsed_sec,
      prompt: data.prompt_used, mode, t: Date.now(), ...extraFields,
    };
    setResults((prev) => [entry, ...prev]);
    return entry;
  };

  const generate = async () => {
    if (!canGenerate) return;
    if (paid) {
      const limitLeft = usage && usage.limit_usd > 0 ? usage.limit_usd - usage.usd : null;
      const retryNote = retryOn ? `\n(형태 점수가 ${AUTO_RETRY_BELOW} 미만이면 1회 자동 재생성되어 최대 $${(unitCost * totalJobs * 2).toFixed(2)}까지 늘 수 있습니다)` : '';
      const msg = `${totalJobs}장 생성합니다. 예상 비용 약 $${estTotal.toFixed(2)} (${providerInfo?.label}, 추정치이며 실제 청구액과 다를 수 있습니다).`
        + (limitLeft != null ? `\n오늘 남은 한도 약 $${Math.max(0, limitLeft).toFixed(2)}.` : '') + retryNote + '\n진행할까요?';
      if (!window.confirm(msg)) return;
    }

    setBusy(true);
    let prompt = commonPrompt; let ex = extraEn; let meta = refMeta;
    if (!prompt.trim() || (promptStale && !promptEdited)) {
      const built = await buildCommonPrompt();
      if (!built) { setBusy(false); return; }
      prompt = built.prompt; ex = built.extraEn; meta = built.meta;
    }
    const thumb = await makeThumb(image.dataUrl);

    const jobs = [];
    chosen.forEach((id) => { for (let i = 0; i < perVariant; i++) jobs.push(id); });
    setProgress({ current: 0, total: jobs.length });
    const labelOf = (id) => { const v = id === '' ? '분위기 지정 없음' : ((mode === 'facade' ? opts.facades : opts.atmospheres).find((x) => x.id === id)?.label || id); return redesigned ? `${v} · ${mode === 'reference' ? '참고 제안' : '재디자인'}` : v; };
    let ok = 0; let lastError = ''; let stop = false;
    for (let i = 0; i < jobs.length && !stop; i++) {
      try {
        let data = await oneGeneration(jobs[i], prompt, ex, meta, labelOf(jobs[i]));
        let retried = false;
        if (retryOn && data.form_score != null && data.form_score < AUTO_RETRY_BELOW) {
          const again = await oneGeneration(jobs[i], prompt, ex, meta, labelOf(jobs[i]));
          retried = true;
          if ((again.form_score ?? -1) >= (data.form_score ?? -1)) data = again;   // 점수가 더 높은 쪽을 남긴다
        }
        ok++;
        const entry = addResult(data, { label: labelOf(jobs[i]), cost: (data.est_cost_usd || 0) * (retried ? 2 : 1) });
        if (thumb) setThumbs((t) => ({ ...t, [entry.id]: thumb }));
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

  // 결과를 이어서 고친다: 결과 이미지 + 수정 지시 → 새 결과(원본은 그대로 남는다)
  const editResult = async (r) => {
    const text = (editText[r.id] || '').trim();
    if (!text || editBusy) return;
    const editProvider = provider;
    const ep = providers.find((p) => p.id === editProvider);
    if (!ep?.available) { addToast?.('error', '수정할 수 없음', '수정에 쓸 엔진을 사용할 수 없습니다.'); return; }
    if (!ep.free && !window.confirm(`약 $${(ep.est_cost_usd || 0).toFixed(2)}가 듭니다(추정). 수정할까요?`)) return;
    setEditBusy(r.id);
    try {
      const img = await urlToDataUrl(`/generated/${r.filename}`);
      const editTicket = newTicket();
      const data = await track({ ticket: editTicket, t0: Date.now(), label: `수정: ${text.slice(0, 14)}`, mode, kind: 'edit', paid: !ep.free }, postJson('/v1/image/aerial/edit', {
        image_base64: img.split(',').pop(), instruction: text, provider: editProvider, aspect_ratio: aspect, external_consent: consent, ticket: editTicket,
      }));
      const entry = addResult(data, { label: `수정: ${text.slice(0, 14)}`, parent: r.id });
      const th = await makeThumb(img);
      if (th) setThumbs((t) => ({ ...t, [entry.id]: th }));
      setEditText((t) => ({ ...t, [r.id]: '' }));
      onGenerated?.();
    } catch (e) { addToast?.('error', '수정 실패', e.message); }
    setEditBusy('');
  };

  const useAsInput = async (r) => {
    try {
      const url = await urlToDataUrl(`/generated/${r.filename}`);
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], 'result.png', { type: blob.type || 'image/png' });
      await onPickFile(file);
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      addToast?.('info', '원본으로 지정', '이 결과가 새 원본이 되었습니다. 방식·스타일을 바꿔 다시 만들 수 있습니다.');
    } catch (e) { addToast?.('error', '불러오기 실패', e.message); }
  };

  const togglePicked = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 4 ? p : [...p, id]));

  const shown = sortBy === 'score'
    ? [...results].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    : results;
  const pickedResults = picked.map((id) => results.find((r) => r.id === id)).filter(Boolean);
  const elapsedHint = busy ? ` · 약 ${Math.max(0, Math.round(perImageMin * (progress.total - progress.current)))}분 남음` : '';

  // 이지·프로 둘 다 쓰는 부분
  const imageBlock = (
    <div style={card}>
      <span style={label}>1. 원본 이미지 (형태 기준)</span>
      {image ? (
        <div style={col}>
          <img src={image.dataUrl} alt="원본" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border-color)', background: '#fff' }} />
          {image.resized && <p style={hint}>큰 이미지라 긴 변 {MAX_EDGE}px로 줄여서 사용합니다 ({image.srcWidth}×{image.srcHeight} → {image.width}×{image.height}).</p>}
          <button style={chip(false, busy)} disabled={busy} onClick={() => setImage(null)}>이미지 제거</button>
        </div>
      ) : (
        <button
          style={{ ...chip(false), padding: '22px 10px', borderStyle: 'dashed' }}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onPickFile(e.dataTransfer.files?.[0]); }}
        >
          이미지 선택 (또는 끌어다 놓기)
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onPickFile(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );

  // 이지: 여러 장을 한 번에 첨부하고, 첫 번째가 원본·나머지가 참조. 번호표와 순서 바꾸기로 원본/참조가 뒤바뀌는 실수를 막는다.
  // 유료 엔진을 골랐을 때만 보이는 외부 전송 동의와 사용액(이지·프로 공통)
  const paidNotice = (
    <>
      {paid && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsentSaved(e.target.checked)} style={{ marginTop: 3 }} data-testid="aerial-consent" />
          <span style={{ color: 'var(--warn)' }}>이 이미지와 설명이 외부 서버(OpenAI/Google)로 전송되는 것에 동의합니다. 대외비 도면은 올리지 마세요. (이번 접속 동안 유지)</span>
        </label>
      )}
      {paid && usage && (
        <p style={hint} data-testid="aerial-usage">
          오늘 유료 사용 약 ${usage.usd.toFixed(2)}{usage.limit_usd > 0 ? ` / 하루 한도 $${usage.limit_usd.toFixed(0)}` : ''} ({usage.count}회, 추정치)
          {usage.total_limit_krw > 0 && <> · <b>누적 약 {(usage.total_krw || 0).toLocaleString()}원 / 총 한도 {usage.total_limit_krw.toLocaleString()}원</b> (남은 약 {(usage.remaining_krw || 0).toLocaleString()}원)</>}
        </p>
      )}
    </>
  );

  const easyImageBlock = (
    <div style={card}>
      <span style={label}>1. 이미지 첨부 (여러 장 가능)</span>
      <p style={hint}>첫 번째 이미지가 <strong>원본(형태 기준)</strong>이고, 나머지는 <strong>참조</strong>입니다. 원본 1장 + 참조 최대 {MAX_REFS}장까지 넣을 수 있습니다.</p>
      {easyImgs.map((im, i) => (
        <div key={im.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 6, borderRadius: 8, border: i === 0 ? '2px solid var(--accent-cyan)' : '1px solid var(--border-color)', background: 'var(--surface)' }} data-testid="easy-img">
          <img src={im.dataUrl} alt={i === 0 ? '원본' : `참조 ${i + 1}`} style={{ width: i === 0 ? 120 : 72, height: i === 0 ? 80 : 54, objectFit: 'cover', borderRadius: 6, background: '#fff' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: i === 0 ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}>{i === 0 ? '이미지 1 · 원본(형태 기준)' : `이미지 ${i + 1} · 참조`}</div>
            {i === 0 && im.resized && <div style={hint}>긴 변 {MAX_EDGE}px로 줄여 사용</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button style={{ ...chip(false, busy || i === 0), padding: '1px 7px', fontSize: 11 }} disabled={busy || i === 0} title="앞으로" onClick={() => moveEasyImg(i, -1)}>▲</button>
            <button style={{ ...chip(false, busy || i === easyImgs.length - 1), padding: '1px 7px', fontSize: 11 }} disabled={busy || i === easyImgs.length - 1} title="뒤로" onClick={() => moveEasyImg(i, 1)}>▼</button>
          </div>
          <button style={{ ...chip(false, busy), padding: '4px 8px', fontSize: 11.5 }} disabled={busy} onClick={() => setEasyImgs((prev) => prev.filter((x) => x.id !== im.id))}>삭제</button>
        </div>
      ))}
      {easyImgs.length < 1 + MAX_REFS && (
        <button
          style={{ ...chip(false), padding: easyImgs.length ? '10px' : '22px 10px', borderStyle: 'dashed' }}
          onClick={() => easyFileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onPickEasyFiles(e.dataTransfer.files); }}
        >
          {easyImgs.length ? '＋ 이미지 더 넣기 (참조)' : '이미지 선택 (여러 장 가능, 끌어다 놓기)'}
        </button>
      )}
      <input ref={easyFileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { onPickEasyFiles(e.target.files); e.target.value = ''; }} />
    </div>
  );

  const generateButton = (
    <>
      <button className="run-btn glow-cyan" style={{ padding: '12px', fontSize: 14, borderRadius: 'var(--r-btn)', opacity: canGenerate ? 1 : 0.55 }}
        onClick={generate} disabled={!canGenerate}>
        {busy
          ? `생성 중… (${progress.current}/${progress.total})${elapsedHint}`
          : `조감도 생성${totalJobs && paid ? ` (${totalJobs}장, 약 $${estTotal.toFixed(2)})` : ''}`}
      </button>
      {busy && queue.position > 1 && <p style={{ ...hint, color: 'var(--warn)' }}>다른 작업이 먼저 진행 중입니다. 내 앞에 {queue.position - 1}건 대기 중이며, 앞 작업이 끝나면 자동으로 시작합니다. 창을 닫지 마세요.</p>}
      {busy && queue.position === 1 && queue.total > 1 && <p style={hint}>지금 내 작업을 만들고 있습니다. 뒤에 {queue.total - 1}건이 기다리고 있습니다.</p>}
      {!paid ? null : (!consent && image && totalJobs > 0 && <p style={{ ...hint, color: 'var(--err)', marginTop: -6 }}>외부 전송 동의에 체크해야 생성할 수 있습니다.</p>)}
      {opts && !providerInfo && (
        <p style={{ ...hint, color: 'var(--err)' }} data-testid="aerial-no-engine">
          {opts.external_allowed === false
            ? '이 프로젝트는 외부 서버 전송이 금지되어 있어 조감도를 만들 수 없습니다. 프로 모드의 \'프로젝트 외부 전송 설정\'에서 허용으로 바꿀 수 있습니다(프로젝트 비밀번호 필요).'
            : '조감도는 유료 엔진(Google)만 씁니다. 지금은 사용할 수 있는 유료 엔진이 없습니다. 관리자가 backend/.env 에 결제가 연결된 API 키를 넣어야 합니다.'}
        </p>
      )}
    </>
  );

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
      <div style={{ width: 380, flexShrink: 0, borderRight: '1px solid var(--border-color)', padding: 14, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', background: 'var(--bg)' }}>
        {easy ? (
          <>
            <div ref={topRef} /> {/* 생성 뒤 맨 위로 스크롤하는 자리(안내 문구는 뺐다) */}
            {easyImageBlock}
            <div style={card}>
              <span style={label}>2. 만들고 싶은 모습 (한글 가능)</span>
              {easyImgs.length > 1 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={hint}>글에 넣기:</span>
                  {easyImgs.slice(1).map((_, i) => (
                    <button key={i} style={{ ...chip(false, busy), padding: '3px 8px', fontSize: 11.5 }} disabled={busy} data-testid="easy-chip"
                      onClick={() => setExtra((t) => `${t}${t && !/\s$/.test(t) ? ' ' : ''}이미지 ${i + 2}`)}>이미지 {i + 2}</button>
                  ))}
                </div>
              )}
              <textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={6} data-testid="easy-prompt"
                placeholder={easyImgs.length > 1
                  ? '예) 이미지 2에서는 재질을 참고하고, 이미지 3에서는 건물 외관(입면 디자인)을 참고해서 이미지 1을 실사 조감도로 만들어 줘. 화창한 오후, 건물이 잘 보이게.'
                  : '예) 이 건물은 카페입니다. 화창한 오후, 건물이 잘 보이는 밝은 자연광. 테라스에 손님들이 앉아 있어요.\n건물 용도, 시간대·날씨, 재료, 주변 분위기를 자유롭게 적어 주세요.'}
                style={{ ...inputBase, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }} />
              {easyImgs.length > 1 && (
                <p style={hint}>
                  참조 사진마다 <strong>무엇을 가져올지</strong> 적어 주세요(예: "이미지 2에서는 재질", "이미지 3에서는 건물 외관(입면 디자인)"). 건물 모양은 항상 이미지 1을 그대로 유지하고, 참조에서는 재료·질감·분위기·입면 느낌만 가져옵니다.
                </p>
              )}
              {easyImgs.length > 1 && !/(이미지|사진)\s*\d|\d\s*번/.test(extra) && (
                <p style={{ ...hint, color: 'var(--warn)' }} data-testid="easy-noroles">참조 사진에서 가져올 것이 글에 없습니다. 이 경우 사진의 재료와 입면 느낌을 자동으로 읽어서 반영합니다. 원하는 것이 있으면 위 예시처럼 적어 주세요.</p>
              )}
            </div>
            <div style={card}>
              <span style={label}>만들 장수</span>
              <select value={perVariant} onChange={(e) => setPerVariant(Number(e.target.value))} style={inputBase}>
                {[1, 2, 3].map((n) => <option key={n} value={n}>{n}장</option>)}
              </select>
            </div>
            {paidNotice}
            <p style={hint}>사진마다 역할 지정, 입면·분위기 여러 개 한 번에 비교 같은 세부 설정은 상단의 <strong>프로 모드</strong>에서 쓸 수 있습니다.</p>
          </>
        ) : (
          <>
        <div ref={topRef} style={card}>
          <div style={{ ...label, fontSize: 13, marginBottom: 4 }}>조감도 · 프로 모드</div>
          <p style={hint}>스케치업 캡처·매스·3D 모델 이미지를 올리면 형태를 지킨 실사 렌더로 만들어 줍니다. 유료 엔진(Google)으로 만들며 장당 비용이 듭니다.</p>
        </div>

        <div style={card}>
          <span style={label}>작업 방식</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {(opts?.modes || []).map((m) => (
              <button key={m.id} style={{ ...chip(mode === m.id, busy), flex: 1 }} disabled={busy} title={m.desc} onClick={() => setMode(m.id)}>{m.label}</button>
            ))}
          </div>
          {modeInfo && <p style={hint}>{modeInfo.desc}</p>}
        </div>

        {imageBlock}

        <div style={card}>
          <span style={label}>2. 참조 이미지 {refsNeeded ? '(필수' : '(선택'}, 최대 {MAX_REFS}장)</span>
          <p style={hint}>
            {mode === 'reference'
              ? '원하는 느낌의 사진을 넣고 역할을 고르세요. "입면"은 그 사진의 입면 재료·패턴을 내 건물에 입히고, 건물 모양은 바꾸지 않습니다.'
              : '재질·분위기·대지 참고를 역할별로 넣으면 그 역할만 가져오고 건물 모양은 바꾸지 않도록 지시합니다.'}
          </p>
          {refs.map((r) => (
            <div key={r.id} style={col}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <img src={r.dataUrl} alt="참조" style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border-color)' }} />
                <select value={r.role} disabled={busy} style={{ ...inputBase, flex: 1 }}
                  onChange={(e) => setRefs((prev) => prev.map((x) => (x.id === r.id ? { ...x, role: e.target.value } : x)))}>
                  {(opts?.ref_roles || []).map((o) => <option key={o.id} value={o.id}>{o.label} 참고</option>)}
                </select>
                <button style={{ ...chip(false, busy), padding: '5px 8px' }} disabled={busy} onClick={() => setRefs((prev) => prev.filter((x) => x.id !== r.id))}>삭제</button>
              </div>
              <input value={r.hint || ''} disabled={busy} data-testid="ref-hint"
                onChange={(e) => setRefs((prev) => prev.map((x) => (x.id === r.id ? { ...x, hint: e.target.value } : x)))}
                placeholder="이 사진에서 가져올 것 (선택) 예: 노출콘크리트 회색 질감, 큰 유리창 비례"
                style={{ ...inputBase, fontSize: 12 }} />
            </div>
          ))}
          {refs.length > 0 && <p style={hint}>"가져올 것"을 적으면 그 내용이 사진 자동 분석보다 우선합니다. 건물 모양은 항상 원본을 유지합니다. 비워 두면 자동으로 분석합니다.</p>}
          {refs.length < MAX_REFS && (
            <button style={{ ...chip(false, busy), borderStyle: 'dashed' }} disabled={busy} onClick={() => refFileRef.current?.click()}>＋ 참조 이미지 추가</button>
          )}
          <input ref={refFileRef} type="file" accept="image/*" hidden onChange={(e) => { onPickRef(e.target.files?.[0]); e.target.value = ''; }} />
          {refsNeeded && refs.length === 0 && <p style={{ ...hint, color: 'var(--err)' }}>이 방식은 참조 이미지가 1장 이상 필요합니다.</p>}
        </div>

        {modeDepths.length > 0 && (
          <div style={card}>
            <span style={label}>{mode === 'facade' ? '입면을 얼마나 바꿀까요' : '참조를 어떻게 쓸까요'}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {modeDepths.map((d) => (
                <button key={d.id} style={{ ...chip(activeDepth === d.id, busy), flex: 1 }} disabled={busy} onClick={() => pickDepth(d.id)}>{d.label}</button>
              ))}
            </div>
            <p style={hint}>{modeDepths.find((d) => d.id === activeDepth)?.desc}</p>
          </div>
        )}

        <div style={card}>
          <span style={label}>3. {mode === 'facade' ? '입면 후보 (여러 개 선택 → 한 번에 비교)' : '분위기 비교 (선택 사항)'}</span>
          {optionalVariants && (
            <p style={hint}>분위기는 아래 4번 요구사항에 글로 써도 됩니다(예: "해질녘, 비 온 뒤"). 여러 시간대·날씨를 한 번에 나란히 비교하고 싶을 때만 여기서 고르세요. 아무것도 안 고르면 요구사항 내용대로 1장 만듭니다.</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {(variantList || []).map((v) => (
              <button key={v.id} style={chip(chosen.includes(v.id))} disabled={busy} onClick={() => togglePick(v.id)}>{v.label}</button>
            ))}
          </div>
        </div>

        <label style={{ ...cardPad, display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={keepSite} onChange={(e) => setKeepSite(e.target.checked)} disabled={busy} style={{ marginTop: 3 }} data-testid="keep-site" />
          <span>
            부지·주변을 원본 그대로 두도록 요청 (지형·도로·울타리·이웃 건물은 두고 건물만 바꾸도록 지시합니다)
            <br /><span style={{ color: 'var(--warn)' }}>보장되지는 않습니다. 추가 요구사항에 오션뷰·광장처럼 부지를 바꾸는 내용이 있으면 그쪽이 우선되어 주변이 바뀝니다.</span>
          </span>
        </label>

        <div style={card}>
          <span style={label}>4. 추가 요구사항 (선택, 한글 가능)</span>
          <textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={3}
            placeholder="예: 1층은 유리 로비, 주변에 가로수와 보행자, 입구 앞 광장에 사람들"
            style={{ ...inputBase, resize: 'vertical', fontFamily: 'inherit' }} />
        </div>

        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button style={{ ...chip(false), padding: '4px 8px', fontSize: 11.5 }} onClick={() => setShowPrompt((v) => !v)}>
              {showPrompt ? '▼' : '▶'} 프롬프트 보기·수정 (고급)
            </button>
            {showPrompt && (
              <button style={{ ...chip(false, busy || promptBusy), padding: '4px 8px', fontSize: 11.5 }} disabled={busy || promptBusy} onClick={buildCommonPrompt}>
                {promptBusy ? '만드는 중…' : commonPrompt ? '다시 만들기' : '프롬프트 만들기'}
              </button>
            )}
          </div>
          {showPrompt && (
            <>
              <textarea value={commonPrompt} onChange={(e) => { setCommonPrompt(e.target.value); setPromptEdited(true); }} rows={7} disabled={busy}
                placeholder={'"프롬프트 만들기"를 누르면 형태 고정 문구, 참조 이미지 역할, 한글 요청의 영어 확장이 합쳐져 나타납니다. 비워 두고 생성하면 자동으로 만들어서 씁니다.\n선택한 분위기·입면 문구는 장마다 뒤에 붙습니다. 유료 엔진이 이 문장을 그대로 씁니다.'}
                style={{ ...inputBase, resize: 'vertical', fontFamily: 'inherit', fontSize: 11.5, lineHeight: 1.5 }} />
              {promptStale && !promptEdited && <p style={{ ...hint, color: 'var(--warn)' }}>요구사항·참조 역할이 바뀌었습니다. 생성할 때 자동으로 다시 만듭니다.</p>}
            </>
          )}
        </div>

        <div style={{ ...cardPad, display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, ...col, gap: 4 }}>
            <span style={label}>항목당 장수</span>
            <select value={perVariant} onChange={(e) => setPerVariant(Number(e.target.value))} style={inputBase}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}장</option>)}
            </select>
          </div>
          {paid && (
            <div style={{ flex: 1, ...col, gap: 4 }}>
              <span style={label}>화면 비율</span>
              <select value={aspect} onChange={(e) => setAspect(e.target.value)} style={inputBase}>
                {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}
        </div>
        {paid && image && aspect !== nearestAspect(image.width, image.height) && (
          <p style={{ ...hint, color: 'var(--warn)' }}>입력과 화면 비율이 달라서 형태 보존 점수를 계산하지 못할 수 있습니다.</p>
        )}

        <div style={card}>
          <span style={label}>AI 엔진</span>
          {providerInfo ? (
            <div style={{ ...chip(true, false), cursor: 'default', textAlign: 'left' }} data-testid="aerial-engine" title={providerInfo.model}>
              <div>{providerInfo.label} · ~${(providerInfo.est_cost_usd || 0).toFixed(2)}/장</div>
              <div style={{ fontWeight: 400, fontSize: 11, marginTop: 2 }}>{providerInfo.note}</div>
            </div>
          ) : (
            <p style={hint}>사용할 수 있는 유료 엔진이 없습니다.</p>
          )}
          {opts?.external_allowed === false && (
            <p style={{ ...hint, color: 'var(--err)' }} data-testid="external-locked">이 프로젝트는 외부 서버 전송이 금지되어 있습니다. 유료 엔진은 쓸 수 없고, 한글 요구사항도 이 PC의 모델로만 변환합니다.</p>
          )}
          <button style={{ ...chip(false), padding: '4px 8px', fontSize: 11.5, alignSelf: 'flex-start' }} onClick={() => setPolicyOpen((v) => !v)} data-testid="policy-toggle">
            {policyOpen ? '▼' : '▶'} 프로젝트 외부 전송 설정
          </button>
          {policyOpen && (
            <div style={{ ...col, padding: 8, border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--surface)' }}>
              <p style={hint}>대외비 프로젝트는 외부 전송을 금지하세요. 금지하면 이 프로젝트에서는 유료 엔진, Gemini(구글 서버) 호출이 서버에서 막힙니다. 바꾸려면 프로젝트 비밀번호가 필요합니다.</p>
              <input type="password" value={policyPw} onChange={(e) => setPolicyPw(e.target.value)} placeholder="프로젝트 비밀번호" style={inputBase} autoComplete="off" />
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ ...chip(opts?.external_allowed === false, policyBusy), flex: 1 }} disabled={policyBusy} onClick={() => changeExternalPolicy(false)}>외부 전송 금지</button>
                <button style={{ ...chip(opts?.external_allowed !== false, policyBusy), flex: 1 }} disabled={policyBusy} onClick={() => changeExternalPolicy(true)}>외부 전송 허용</button>
              </div>
            </div>
          )}
        </div>

        {paidNotice}
        <label style={{ ...cardPad, display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={autoRetry} onChange={(e) => setAutoRetry(e.target.checked)} style={{ marginTop: 3 }} />
          <span>형태 점수가 낮으면(&lt;{AUTO_RETRY_BELOW}) 1회 자동 재생성하고 더 나은 쪽을 남김{paid ? ' (추가 비용)' : ' (시간이 더 걸림)'}</span>
        </label>

          </>
        )}
        {generateButton}
        <span hidden>{nowTick}</span>
      </div>

      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 16 }}>
        {recovering > 0 && (
          <div data-testid="aerial-recovering" style={{ marginBottom: 10, padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
            새로고침 전에 시작한 조감도 작업 {recovering}건을 서버에서 확인하는 중입니다. 서버에서 끝났다면 아래 결과에 자동으로 추가됩니다.
          </div>
        )}
        {results.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary, #64748b)', fontSize: 13, textAlign: 'center', lineHeight: 1.7 }}>
            왼쪽에서 이미지와 방식을 고르고 생성하면<br />결과가 여기에 쌓입니다. 새로고침하거나 다른 PC에서 열어도 이 탭의 결과는 남아 있습니다.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
              <span>
                {picked.length >= 2
                  ? <button style={{ ...chip(true), padding: '5px 10px' }} onClick={() => setSideBySide(true)}>선택한 {picked.length}장 나란히 비교</button>
                  : '카드의 "비교 선택"을 2~4장 체크하면 나란히 볼 수 있습니다.'}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                정렬
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={inputBase}>
                  <option value="recent">최신순</option>
                  <option value="score">형태 점수 높은 순</option>
                </select>
                <button style={{ ...chip(false), padding: '5px 10px' }} onClick={() => { if (window.confirm('이 화면의 결과 목록을 비웁니다. (파일은 서버에 남고, 이후에 만든 결과부터 다시 쌓입니다)')) { writeCleared(Date.now()); setResults([]); setPicked([]); } }}>목록 비우기</button>
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
              {shown.map((r) => {
                const si = scoreInfo(r.score);
                const th = thumbs[r.id];
                return (
                  <div key={r.id} className="glass-card" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {compareOn[r.id] && th
                      ? <CompareSlider before={th} after={`/generated/${r.filename}`} />
                      : (
                        <a href={`/generated/${r.filename}`} target="_blank" rel="noreferrer">
                          <img src={`/generated/${r.filename}`} alt={r.label} style={{ width: '100%', borderRadius: 6, display: 'block' }} />
                        </a>
                      )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
                      <span><strong>{r.label}</strong> · {r.model}</span>
                      <a href={`/generated/${r.filename}`} download style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>저장</a>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                      <span title={r.note || '입력 이미지의 뼈대 선이 결과에 남은 정도(0~100)'} style={{ color: si.color, fontWeight: 700 }}>{si.text}</span>
                      <span style={{ color: 'var(--text-tertiary, #64748b)' }}>
                        {r.cost > 0 ? `약 $${r.cost.toFixed(2)}` : (r.cost === 0 ? '무료' : '비용 기록 없음')}{r.sec ?` · ${r.sec}초` : ''}{r.seed != null ? ` · 시드 ${r.seed}` : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <label style={{ fontSize: 11.5, display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
                        <input type="checkbox" checked={picked.includes(r.id)} onChange={() => togglePicked(r.id)} /> 비교 선택
                      </label>
                      {th && <button style={{ ...chip(!!compareOn[r.id]), padding: '3px 8px', fontSize: 11.5 }} onClick={() => setCompareOn((c) => ({ ...c, [r.id]: !c[r.id] }))}>원본과 비교</button>}
                      <button style={{ ...chip(false, busy), padding: '3px 8px', fontSize: 11.5 }} disabled={busy} onClick={() => useAsInput(r)}>이 결과를 원본으로</button>
                      {r.prompt && <button style={{ ...chip(false), padding: '3px 8px', fontSize: 11.5 }} onClick={() => { navigator.clipboard?.writeText(r.prompt); addToast?.('info', '프롬프트 복사', '이 결과에 쓴 프롬프트를 복사했습니다.'); }}>프롬프트 복사</button>}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input value={editText[r.id] || ''} onChange={(e) => setEditText((t) => ({ ...t, [r.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') editResult(r); }}
                        placeholder="이어서 수정: 예) 1층 유리를 더 크게, 나무 추가" style={{ ...inputBase, flex: 1, fontSize: 12 }} disabled={!!editBusy} />
                      <button style={{ ...chip(false, !!editBusy || !(editText[r.id] || '').trim()), padding: '4px 10px' }} disabled={!!editBusy || !(editText[r.id] || '').trim()} onClick={() => editResult(r)}>
                        {editBusy === r.id ? '수정 중…' : '수정'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {sideBySide && (
        <div role="dialog" aria-label="나란히 비교" onClick={() => setSideBySide(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.88)', zIndex: 50, padding: 20, overflow: 'auto' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(2, pickedResults.length)}, 1fr)`, gap: 14, maxWidth: 1600, margin: '0 auto' }}>
            {pickedResults.map((r) => (
              <div key={r.id} style={{ background: '#fff', borderRadius: 8, padding: 8 }}>
                <img src={`/generated/${r.filename}`} alt={r.label} style={{ width: '100%', display: 'block', borderRadius: 4 }} />
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>{r.label} <span style={{ fontWeight: 400, color: '#64748b' }}>· {scoreInfo(r.score).text}</span></div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <button style={{ ...chip(true), padding: '8px 18px' }} onClick={() => setSideBySide(false)}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}

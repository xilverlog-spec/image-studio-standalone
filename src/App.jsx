import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  Image as ImageIcon,
  Image,
  RefreshCw,
  Trash2,
  Wand2,
  Sliders,
  MessageSquare,
  Send,
  Compass,
  Paperclip,
  X,
  Star,
  Download,
  Plus,
  AlertTriangle,
  Edit3,
  ChevronDown,
  ChevronUp,
  Check,
  History,
  Clock,
  Maximize2,
  Zap,
  Upload,
  Layers,
  Paintbrush,
  ChevronsLeftRight
} from 'lucide-react';

// 상대경로로 호출 — vite.config.js의 dev 서버 proxy(/v1, /generated → localhost:5000)를 통해
// 백엔드로 전달된다. 이렇게 하면 LAN이든 터널(ngrok/cloudflared 등 외부 링크)이든 프론트엔드
// 주소 하나만 열면 API 호출도 자동으로 같은 곳을 통해 나간다 — 백엔드 포트를 따로 노출할 필요가 없다.
const API_BASE_URL = '';

const DESIGNER_SYSTEM_PROMPT =
  '너는 이미지 생성 스튜디오의 전담 디자이너 "조니 아이구"다. ' +
  '친근하지만 정중한 한국어 존댓말(높임말)로, 인사말이나 "알겠습니다" 같은 군더더기 없이 바로 핵심만 2~3문장으로 답한다. ' +
  '사용자 말을 반복하거나 요약하지 않고, 질문은 한 번에 하나만 한다. ' +
  '사용자가 참고 이미지를 첨부하면 실제로 보고 스타일/구도/분위기를 짧게 언급하며 반응한다. ' +
  '이미지는 직접 생성하지 않는다 — 사용자가 "이 대화로 생성 준비하기" 버튼을 눌러야 생성된다.';

const ARCH_STYLE_PRESETS = {
  modern: {
    label: "모던 & 미니멀",
    desc: "콘크리트, 글라스, 철골 조화",
    prompt: "modern minimalist architecture, concrete and glass villa, black metal frames, neat grass garden, architectural photography, 8k resolution"
  },
  wood: {
    label: "친환경 목조 & 석조",
    desc: "석재 데크와 우디 외벽 마감",
    prompt: "eco-friendly luxury residence, natural wooden panels, stone walls, warm integration with surrounding forest landscape, award-winning design, architectural photography"
  },
  night: {
    label: "화려한 야경",
    desc: "극적인 간접조명과 따뜻한 불빛",
    prompt: "dramatic night view rendering of architectural villa, cozy interior lights glowing through big glass windows, modern exterior lighting, dark blue night sky, warm ambiance, architectural photography"
  },
  interior: {
    label: "내추럴 실내 투시도",
    desc: "자연광이 쏟아지는 아늑한 실내",
    prompt: "modern interior design rendering, living room view, large floor-to-ceiling windows, natural sunlight casting soft shadows, minimal oak furniture, realistic indoor plants, 8k"
  },
  rainy: {
    label: "비 오는 날 (시네마틱)",
    desc: "차분하고 무드 있는 기후 효과",
    prompt: "architectural rendering on a rainy day, wet dark asphalt reflection, misty moody atmosphere, raindrops, warm glowing windows, cinematic lighting, realistic texture"
  },
  sunny: {
    label: "화창한 한낮",
    desc: "선명한 그림자와 조경 디테일",
    prompt: "architectural photography, bright sunny day, clear blue sky, crisp shadows, green trees landscape garden, commercial real estate shot, 8k resolution"
  }
};

// ── "퇴근 모드"(야간 배치)에서 디자인 다양성을 만드는 재료 풀 ──
// 같은 스타일 프리셋이라도 재질/파사드 형태/조명을 매번 무작위로 섞어 넣어야
// "시드만 다른 비슷한 그림"이 아니라 실제로 서로 다른 디자인 시안처럼 보인다.
const NIGHT_BATCH_MATERIALS = [
  "board-formed concrete facade", "natural stone cladding", "dark charred wood (shou sugi ban) siding",
  "brushed aluminum and glass curtain wall", "warm oak wood paneling", "white stucco with steel trim",
  "corten steel weathered panels", "brick masonry with black mortar", "polished travertine stone",
  "matte black metal panels with large glazing"
];
const NIGHT_BATCH_FORMS = [
  "single flat-roof rectangular volume", "cantilevered upper floor extending over the garden",
  "stacked offset boxes massing", "curved organic facade", "split-level massing with a central courtyard",
  "pitched mono-slope roof form", "symmetrical gabled roof form", "L-shaped floor plan wrapping a pool",
  "modular container-inspired massing", "terraced stepped massing following the site slope"
];
const NIGHT_BATCH_LIGHTING = [
  "golden hour warm sunlight", "overcast soft diffused daylight", "blue hour twilight with interior lights glowing",
  "bright midday clear sky", "misty morning atmosphere", "dramatic side lighting with long shadows"
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Fooocus 원본 Image Prompt 슬롯 타입별 기본값 (modules/flags.py default_parameters).
// 프로 모드에서 슬롯 타입을 바꿀 때 이 기본값으로 Stop At/Weight를 리셋한다.
const FOOOCUS_SLOT_DEFAULTS = {
  PyraCanny: { stopAt: 0.5, weight: 1.0 },
  CPDS: { stopAt: 0.5, weight: 1.0 },
  ImagePrompt: { stopAt: 0.5, weight: 0.6 },
};
const FOOOCUS_SLOT_TYPES = ['PyraCanny', 'CPDS', 'ImagePrompt'];
const FOOOCUS_SLOT_TYPE_LABELS = {
  PyraCanny: 'PyraCanny (엣지)',
  CPDS: 'CPDS (명암 구조)',
  ImagePrompt: 'ImagePrompt (재질/분위기)',
};

// 이지 모드의 "강조" 옵션 → IP-Adapter stop_at 매핑. 확산 초반에만 적용하면(값이 낮으면)
// 전체적인 색감/구도 위주로, 후반까지 적용하면(값이 높으면) 질감/디테일까지 반영된다.
const BLEND_EMPHASIS_STOP_AT = { balanced: 0.5, color: 0.35, material: 0.75 };
const BLEND_EMPHASIS_OPTIONS = [
  { value: 'balanced', label: '균형있게' },
  { value: 'color', label: '색감 위주' },
  { value: 'material', label: '질감/재질 위주' },
];

// ── Toast 알림 시스템 ──────────────────────────────────────────────
let toastIdCounter = 0;

function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`toast toast-${t.type}${t.closing ? ' closing' : ''}`}
          onAnimationEnd={() => t.closing && removeToast(t.id)}
        >
          <div style={{ flexShrink: 0, marginTop: '1px' }}>
            {t.type === 'error' && <AlertTriangle size={16} style={{ color: 'var(--accent-rose)' }} />}
            {t.type === 'success' && <Check size={16} style={{ color: '#22c55e' }} />}
            {t.type === 'info' && <Sparkles size={16} style={{ color: 'var(--accent-cyan)' }} />}
          </div>
          <div className="toast-content">
            {t.title && <div className="toast-title">{t.title}</div>}
            <div>{t.message}</div>
          </div>
          <button className="toast-close" onClick={() => removeToast(t.id, true)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// 결과물을 "전/후" 비교로 볼 수 있는 드래그 슬라이더. beforeSrc 위에 afterSrc를 얹고,
// 드래그 위치만큼 afterSrc를 clip-path로 잘라내 왼쪽엔 전, 오른쪽엔 후가 보이게 한다.
function BeforeAfterSlider({ beforeSrc, afterSrc, maxHeight = '72vh' }) {
  const [pos, setPos] = useState(50); // 0~100, 왼쪽(전)이 차지하는 비율
  const containerRef = useRef(null);
  const isDraggingRef = useRef(false);

  const updateFromClientX = (clientX) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(100, Math.max(0, ratio)));
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!isDraggingRef.current) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      updateFromClientX(clientX);
    };
    const onUp = () => { isDraggingRef.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseDown={(e) => { isDraggingRef.current = true; updateFromClientX(e.clientX); }}
      onTouchStart={(e) => { isDraggingRef.current = true; updateFromClientX(e.touches[0].clientX); }}
      style={{
        position: 'relative', width: '100%', maxHeight, borderRadius: 'var(--radius-md)',
        overflow: 'hidden', boxShadow: 'var(--shadow-pop)', cursor: 'ew-resize', userSelect: 'none', lineHeight: 0
      }}
    >
      <img src={afterSrc} alt="후" draggable={false} style={{ width: '100%', maxHeight, objectFit: 'contain', display: 'block' }} />
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={beforeSrc} alt="전" draggable={false} style={{ width: '100%', maxHeight, objectFit: 'contain', display: 'block' }} />
      </div>
      <div style={{ position: 'absolute', top: '10px', left: '10px', padding: '3px 9px', borderRadius: '5px', background: 'rgba(13,13,38,0.7)', color: 'white', fontSize: '12px', fontWeight: 600, pointerEvents: 'none' }}>전</div>
      <div style={{ position: 'absolute', top: '10px', right: '10px', padding: '3px 9px', borderRadius: '5px', background: 'rgba(13,13,38,0.7)', color: 'white', fontSize: '12px', fontWeight: 600, pointerEvents: 'none' }}>후</div>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos}%`, width: '2px', background: 'white', boxShadow: '0 0 6px rgba(0,0,0,0.5)', pointerEvents: 'none' }} />
      <div style={{
        position: 'absolute', top: '50%', left: `${pos}%`, transform: 'translate(-50%, -50%)',
        width: '32px', height: '32px', borderRadius: '50%', background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none'
      }}>
        <ChevronsLeftRight size={16} style={{ color: 'var(--accent-cyan)' }} />
      </div>
    </div>
  );
}

function App() {
  // Toast 상태
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((type, title, message, duration = 6000) => {
    const id = ++toastIdCounter;
    const safeTitle = typeof title === 'string' ? title : String(title || '');
    const safeMsg = typeof message === 'string' ? message : (typeof message === 'object' ? JSON.stringify(message) : String(message || ''));
    setToasts(prev => [...prev, { id, type, title: safeTitle, message: safeMsg, closing: false }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, closing: true } : t));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id, immediate) => {
    if (immediate) {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, closing: true } : t));
    } else {
      setToasts(prev => prev.filter(t => t.id !== id));
    }
  }, []);

  // 좌측 탭: 대화형 / 프롬프트 직접 입력
  const [studioTab, setStudioTab] = useState('chat');

  // 멀티 대화 세션 목록 (과거 대화 히스토리 완전 보존)
  const [chatSessions, setChatSessions] = useState(() => {
    try {
      const saved = localStorage.getItem('studio_chat_sessions_v2');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [currentSessionId, setCurrentSessionId] = useState(() => `session-${Date.now()}`);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);

  // 현재 대화 세션의 메시지 목록
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const chatEndRef = useRef(null);
  // 참고 이미지 첨부 (전송 전 미리보기용 dataURL). 실제 전송 시엔 접두사를 뗀 순수 base64만 보낸다.
  const [chatAttachedImage, setChatAttachedImage] = useState(null);
  const [isDraggingOverChat, setIsDraggingOverChat] = useState(false);
  const chatFileInputRef = useRef(null);

  const [directPrompt, setDirectPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAutoTuning, setIsAutoTuning] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ percent: 0, status: 'idle' });
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [isSuggestingPrompt, setIsSuggestingPrompt] = useState(false);
  const [promptSuggestion, setPromptSuggestion] = useState('');
  const [autoTuneResult, setAutoTuneResult] = useState(null);
  // ── "이미지 수정" 탭(img2img) 전용 상태 ──
  // "프롬프트 입력" 탭과 완전히 분리된 상태다 — 같은 텍스트 상자를 공유하면 "이건 새로 만드는
  // 프롬프트인지 기존 이미지 수정 지시인지" 헷갈린다는 피드백이 있어 탭째로 분리했다.
  const [editInstruction, setEditInstruction] = useState('');
  const [editSuggestion, setEditSuggestion] = useState('');
  const [isSuggestingEdit, setIsSuggestingEdit] = useState(false);
  const [isDraggingOverEdit, setIsDraggingOverEdit] = useState(false);
  // dataURL(미리보기용). 전송 시엔 접두사를 뗀 순수 base64만 보낸다.
  const [promptAttachedImages, setPromptAttachedImages] = useState([]); // 최대 4개까지
  // 낮을수록 원본을 많이 보존, 1.0이면 원본과 거의 무관한 새 그림이 된다.
  const [img2imgStrength, setImg2imgStrength] = useState(0.6);
  // 2026-08-28: FLUX.1 Kontext 도입 — "재해석"이 아니라 "지시문을 그대로 이해해서 편집"하는
  // 전용 모델이라 기본적으로 이걸 쓴다. 끄면 기존 denoise 기반 img2img로 폴백.
  const [useKontextEdit, setUseKontextEdit] = useState(true);
  const [isKontextEditing, setIsKontextEditing] = useState(false);
  // "사람을 추가해줘" 같은 지시에서 원본 보존 강도를 자동으로 올렸을 때 사용자에게 보여줄 안내문.
  const [strengthAutoNotice, setStrengthAutoNotice] = useState('');
  const promptFileInputRef = useRef(null);

  // ── "이미지 수정" 탭 전용 상태 ──
  const [editMode, setEditMode] = useState('architecture'); // 'architecture' | 'inpaint' | 'outpaint' | 'nightBatch'
  const [archImage, setArchImage] = useState(null);
  const [inpaintEditImage, setInpaintEditImage] = useState(null);
  const [outpaintEditImage, setOutpaintEditImage] = useState(null);
  const [isArchPromptRefining, setIsArchPromptRefining] = useState(false);

  // ── "퇴근 모드"(야간 배치 생성) 전용 상태 ──
  // 2026-09-02: 매스 모델 하나로 "가능한 한 다양한 디자인 시안"을 대량으로 뽑아두고 싶다는
  // 요청 — 시간은 상관없고(퇴근~다음날 출근 사이, 최대 12시간+) 다양성이 핵심이라, 스타일뿐
  // 아니라 재질/형태/조명 같은 디스크립터를 매 장마다 무작위로 조합해 프롬프트 자체를 바꾼다.
  const [nightBatchCount, setNightBatchCount] = useState(50);
  const [nightBatchSelectedStyles, setNightBatchSelectedStyles] = useState(Object.keys(ARCH_STYLE_PRESETS));
  const [nightBatchPrompt, setNightBatchPrompt] = useState('');
  const [nightBatchKeepStructure, setNightBatchKeepStructure] = useState(60);
  const [nightBatchRunning, setNightBatchRunning] = useState(false);
  const [nightBatchProgress, setNightBatchProgress] = useState({ current: 0, total: 0, failed: 0 });
  const nightBatchStopRef = useRef(false);

  // ── "이미지 블렌딩" 탭 전용 상태 ──
  const [blendBaseImage, setBlendBaseImage] = useState(null);
  const [blendReferenceImages, setBlendReferenceImages] = useState([]); // 최대 4장
  const [blendInfluence, setBlendInfluence] = useState(50);
  // 2026-09-02: Fooocus의 실제 Image Prompt 방식(Structure+Reference)으로 블렌딩을 교체 —
  // 이지 모드에서 쓰는 간단한 on/off (기존 이미지의 형태를 ControlNet으로 고정할지).
  const [blendStructureEnabled, setBlendStructureEnabled] = useState(true);
  const [blendStructureType, setBlendStructureType] = useState('PyraCanny'); // 'PyraCanny' | 'CPDS'
  // 이지 모드에서 참조 이미지의 어떤 특성을 더 강하게 반영할지 (IP-Adapter의 stop_at을 조절해 구현 —
  // 값이 낮으면 확산 초반(전체 색감·구도)에만 적용되고, 값이 높으면 후반(질감·디테일)까지 적용됨).
  const [blendEmphasis, setBlendEmphasis] = useState('balanced'); // 'balanced' | 'color' | 'material'
  // 프로 모드 전용: Fooocus의 Image Prompt 패널처럼 슬롯(최대 4개)마다 타입/Stop At/Weight를
  // 독립적으로 가진다. {image: dataURL, type: 'PyraCanny'|'CPDS'|'ImagePrompt'|'FaceSwap', stopAt, weight}
  const [blendSlots, setBlendSlots] = useState([]);
  const blendSlotInputRef = useRef(null);
  const [blendPrompt, setBlendPrompt] = useState('');
  const [isBlendPromptRefining, setIsBlendPromptRefining] = useState(false);
  // 프로 모드 전용: "기존 이미지 감도" — 0에 가까울수록 기존 이미지를 많이 유지하고,
  // 100에 가까울수록 완전히 새로 그린다(denoise로 변환해서 백엔드에 전달).
  const [blendDenoise, setBlendDenoise] = useState(100);
  // 프로 모드 전용: 기존 이미지도 슬롯처럼 Stop At/Weight를 갖는다 — 블렌딩 시 base image를
  // PyraCanny 구조 슬롯으로 자동 포함시켜, ControlNet 강도/적용 구간을 직접 조절할 수 있게 한다.
  const [blendBaseStopAt, setBlendBaseStopAt] = useState(0.5);
  const [blendBaseWeight, setBlendBaseWeight] = useState(1.0);
  const [isDraggingOverBlend, setIsDraggingOverBlend] = useState(false);
  const [isDraggingOverBlendRef, setIsDraggingOverBlendRef] = useState(false);
  const [isDraggingOverBlendSlot, setIsDraggingOverBlendSlot] = useState(false);
  const [isBlending, setIsBlending] = useState(false);
  const blendBaseInputRef = useRef(null);
  const blendRefInputRef = useRef(null);

  // ── 건축 실사화(Arch-Viz) 특화 모드 전용 상태 ──
  // 2026-08-31: "실사화 1장"보다 "매스 모델 하나로 초기 컨셉 디자인을 여러 개 뽑기"가
  // 실제 주 용도에 더 맞는다는 피드백으로, 스타일 단일선택 → 다중선택 배치 생성으로 전환.
  const [editSubMode, setEditSubMode] = useState('arch'); // 'arch'가 기본값, 'edit'이 일반 수정, 'inpaint'가 인페인트/아웃페인트
  const [archSelectedStyles, setArchSelectedStyles] = useState([]); // 기본: 선택 없음, 사용자가 직접 선택
  const [archVariationsPerStyle, setArchVariationsPerStyle] = useState(1); // 스타일 하나당 몇 장씩 뽑을지
  const [archBatchProgress, setArchBatchProgress] = useState({ current: 0, total: 0 });
  const [archPrompt, setArchPrompt] = useState('');
  const [archKeepStructure, setArchKeepStructure] = useState(75); // 형태(매스) 보존율 (기본 75%)

  // ── 인페인트 / 아웃페인트 (2026-08-31, Fooocus 기능 이식) 전용 상태 ──
  const [inpaintImage, setInpaintImage] = useState(null); // dataURL 미리보기
  const [inpaintSubMode, setInpaintSubMode] = useState('inpaint'); // 'inpaint' | 'outpaint'
  const [inpaintPrompt, setInpaintPrompt] = useState('');
  const [brushSize, setBrushSize] = useState(50);
  const [outpaintDirections, setOutpaintDirections] = useState({ left: false, top: false, right: false, bottom: false });
  const [outpaintAmount, setOutpaintAmount] = useState(256);
  const [isInpainting, setIsInpainting] = useState(false);
  const [isInpaintPromptRefining, setIsInpaintPromptRefining] = useState(false);
  const inpaintFileInputRef = useRef(null);
  const inpaintCanvasRef = useRef(null);
  const inpaintImgElRef = useRef(null);
  const isPaintingMaskRef = useRef(false); // 드래그 중 매 프레임 리렌더를 피하려고 state 대신 ref로 관리


  // 옵션 설정
  const [imagePerformance, setImagePerformance] = useState('quality');
  // 기본값을 정사각형(1:1)으로: 16:9처럼 옆으로 넓은 비율은 인물이 프레임에서 차지하는
  // 비중이 작아져 얼굴이 더 뭉개지기 쉽다 — 얼굴 품질 피드백으로 기본 비율을 변경.
  const [imageAspectRatio, setImageAspectRatio] = useState('1:1');
  const [imageBatchCount, setImageBatchCount] = useState(1);
  const [styleOverride, setStyleOverride] = useState(null);
  const [checkpointOverride, setCheckpointOverride] = useState(null);
  // 빈 문자열/null이면 매번 랜덤 시드. 값이 있으면 그 시드로 고정해서 같은 결과를 재현한다.
  const [seedOverride, setSeedOverride] = useState('');
  const [lastSeedUsed, setLastSeedUsed] = useState(null);
  // true면 handleGenerate가 AI 자동 튜닝(프롬프트 재해석)을 건너뛴다 — 갤러리에서 "이 설정으로
  // 다시 만들기"로 이미 완성된 프롬프트를 불러왔을 때만 켜진다. 사용자가 프롬프트를 직접
  // 수정하면 다시 꺼져서 평소처럼 자동 튜닝을 탄다.
  const [skipAutoTune, setSkipAutoTune] = useState(false);
  // 시드 UI 토글 — 기본은 접혀 있고 필요할 때만 펼침
  const [showSeedControl, setShowSeedControl] = useState(false);

  // 기본 모드 (ComfyUI 기본 생성)
  const qualityMode = 'standard';  // Easy Mode - ComfyUI 기본
  const [qualityPreset, setQualityPreset] = useState('quality');  // 'speed' | 'quality' | 'extreme_quality'
  const [sharpness, setSharpness] = useState(2.0);  // 0.0 | 1.0 | 2.0
  const [adm_guidance, setAdm_guidance] = useState(true);
  const [promptEnhance, setPromptEnhance] = useState(true);
  const [showAdvancedQualitySettings, setShowAdvancedQualitySettings] = useState(false);

  // 옵션 메타데이터 & 갤러리
  const [imageOptions, setImageOptions] = useState({
    performance_presets: {},
    aspect_ratios: {
      '1:1': { label: '정사각형 (1:1)' },
      '16:9': { label: '와이드 (16:9)' },
      '9:16': { label: '세로 와이드 (9:16)' },
      '4:3': { label: '표준 (4:3)' },
      '3:4': { label: '세로 표준 (3:4)' },
      '3:2': { label: '사진 (3:2)' }
    },
    styles: {
      'fooocus_enhance': { label: '🎨 Fooocus 강화' },
      'sai-cinematic': { label: '🎬 영화 스타일' },
      'sai-photographic': { label: '📸 사진' },
      'sai-anime': { label: '🎌 애니메이션' },
      'sai-pixel-art': { label: '🔲 픽셀 아트' },
      'sai-3d-model': { label: '🎭 3D 모델' },
      'sai-line-art': { label: '✏️ 라인 아트' },
      'sai-watercolor': { label: '🎨 수채화' },
      'sai-sketch': { label: '🖍️ 스케치' },
      'sai-neon-punk': { label: '⚡ 네온펑크' },
      'sai-fantasy-art': { label: '🐉 판타지 아트' },
      'sai-comic-book': { label: '💭 만화책' },
      'sai-origami': { label: '📄 종이접기' },
      'sai-ukiyo-e': { label: '🗾 우키요에' }
    },
    samplers: [],
    schedulers: []
  });
  const [availableCheckpoints, setAvailableCheckpoints] = useState([]);
  const [studioGallery, setStudioGallery] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // 이지 모드 (Easy Mode) vs 프로 모드 (Pro Mode)
  // 초보자 유저를 위한 복잡한 옵션 자동 숨김 상태
  const [isEasyMode, setIsEasyMode] = useState(true);

  // 화면비 visual 가이드 렌더러
  const renderAspectVisual = (aspectId) => {
    const dims = {
      '1:1': { w: 16, h: 16 },
      '4:3': { w: 20, h: 15 },
      '3:4': { w: 15, h: 20 },
      '16:9': { w: 24, h: 13.5 },
      '9:16': { w: 13.5, h: 24 },
      '2:1': { w: 28, h: 14 },
      '3:2': { w: 22, h: 14.5 }
    }[aspectId] || { w: 16, h: 16 };
    return (
      <div style={{
        width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <div className="aspect-ratio-visual" style={{ width: `${dims.w}px`, height: `${dims.h}px` }} />
      </div>
    );
  };

  useEffect(() => {
    loadImageOptions();
    loadStudioGallery();
  }, []);

  // 퇴근 모드 실행 중 실수로 탭을 닫으면 순차 생성이 그대로 끊긴다 — 확인 없이 닫히지 않게 막는다.
  useEffect(() => {
    if (!nightBatchRunning) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [nightBatchRunning]);

  // 실시간 생성 & 업스케일 진행률(Progress) 폴링
  useEffect(() => {
    let interval;
    if (isGenerating || isUpscaling || isInpainting) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(API_BASE_URL + '/v1/image/progress');
          if (res.ok) {
            const data = await res.json();
            if (data.progress) {
              setGenerationProgress(data.progress);
            }
          }
        } catch (e) {}
      }, 200);
    } else {
      setGenerationProgress({ percent: 0, status: 'idle' });
    }
    return () => clearInterval(interval);
  }, [isGenerating, isUpscaling]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (chatMessages.length === 0) return;

    setChatSessions(prev => {
      const firstUserMsg = chatMessages.find(m => m.role === 'user')?.content || '새로운 대화';
      const title = firstUserMsg.replace(/^\(참고 이미지 첨부\)$/, '참고 이미지 기반 대화').slice(0, 26) + (firstUserMsg.length > 26 ? '...' : '');
      const existingIdx = prev.findIndex(s => s.id === currentSessionId);
      
      let updated;
      if (existingIdx >= 0) {
        updated = prev.map((s, idx) => idx === existingIdx ? { ...s, title, updatedAt: Date.now(), messages: chatMessages } : s);
      } else {
        updated = [{ id: currentSessionId, title, updatedAt: Date.now(), messages: chatMessages }, ...prev];
      }
      
      try {
        localStorage.setItem('studio_chat_sessions_v2', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  }, [chatMessages, currentSessionId]);

  const loadImageOptions = async () => {
    try {
      const [optRes, ckptRes] = await Promise.all([
        fetch(API_BASE_URL + '/v1/image/options'),
        fetch(API_BASE_URL + '/v1/image/checkpoints'),
      ]);
      if (optRes.ok) {
        const backendOptions = await optRes.json();
        // Backend 데이터와 기본값 merge (Backend가 없으면 기본값 사용)
        setImageOptions(prev => ({
          performance_presets: backendOptions.performance_presets || prev.performance_presets,
          aspect_ratios: { ...prev.aspect_ratios, ...backendOptions.aspect_ratios },
          styles: { ...prev.styles, ...backendOptions.styles },
          samplers: backendOptions.samplers || prev.samplers,
          schedulers: backendOptions.schedulers || prev.schedulers
        }));
      }
      if (ckptRes.ok) {
        const ckptData = await ckptRes.json();
        setAvailableCheckpoints(ckptData.checkpoints || []);
      }
    } catch (err) {
      console.error('옵션 로드 실패:', err);
    }
  };

  const loadStudioGallery = async () => {
    try {
      const res = await fetch(API_BASE_URL + '/v1/image/history');
      if (res.ok) {
        const data = await res.json();
        setStudioGallery(data.generations || []);
      }
    } catch (err) {
      console.error('갤러리 로드 실패:', err);
    }
  };

  const toggleFavorite = async (item) => {
    const nextFavorite = !item.isFavorite;
    // 서버 응답을 기다리지 않고 먼저 화면을 갱신해서 클릭이 즉각 반응하는 것처럼 보이게 한다.
    setStudioGallery(prev => prev.map(g => g.id === item.id ? { ...g, isFavorite: nextFavorite } : g));
    setSelectedImage(prev => (prev && prev.id === item.id) ? { ...prev, isFavorite: nextFavorite } : prev);
    try {
      const res = await fetch(`/v1/image/history/${item.id}/favorite`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorite: nextFavorite })
      });
      if (!res.ok) throw new Error('즐겨찾기 변경 실패');
    } catch (err) {
      console.error('즐겨찾기 변경 실패:', err);
      // 실패하면 되돌린다
      setStudioGallery(prev => prev.map(g => g.id === item.id ? { ...g, isFavorite: item.isFavorite } : g));
      setSelectedImage(prev => (prev && prev.id === item.id) ? { ...prev, isFavorite: item.isFavorite } : prev);
    }
  };

  const deleteHistoryItem = async (id) => {
    try {
      const res = await fetch(`/v1/image/history/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setStudioGallery(prev => prev.filter(item => item.id !== id));
        if (selectedImage?.id === id) setSelectedImage(null);
      }
    } catch (err) {
      console.error('이력 삭제 실패:', err);
    }
  };

  // 이미지 파일을 dataURL로 읽어 주어진 setter에 담는다 — 대화 탭 첨부/img2img 첨부가 공유.
  const readImageFileInto = (file, setter) => {
    if (!file || !file.type?.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setter(reader.result);
    reader.readAsDataURL(file);
  };

  const addPromptAttachedImage = (file) => {
    if (!file || !file.type?.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPromptAttachedImages(prev => {
        const updated = [...prev, reader.result];
        // 최대 4개까지만 유지
        if (updated.length > 4) {
          return updated.slice(-4);
        }
        return updated;
      });
    };
    reader.readAsDataURL(file);
  };

  const removePromptAttachedImage = (index) => {
    setPromptAttachedImages(prev => prev.filter((_, i) => i !== index));
  };

  // ── 대화형 탭 ──────────────────────────────────────────────
  const loadImageFileAsChatAttachment = (file) => readImageFileInto(file, setChatAttachedImage);

  const handleChatImageSelect = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    loadImageFileAsChatAttachment(file);
  };

  const handleChatDrop = (e) => {
    e.preventDefault();
    setIsDraggingOverChat(false);
    loadImageFileAsChatAttachment(e.dataTransfer.files?.[0]);
  };

  // 과거 생성 이력의 프롬프트/스타일/체크포인트/시드를 프롬프트 탭에 그대로 불러와 재사용한다.
  // (시드까지 같으면 거의 동일한 결과를 재현할 수 있다 — Fooocus의 "설정 불러오기"와 동일한 개념)
  //
  // 2026-08-27: handleGenerate는 원래 매번 AI 자동 튜닝을 거쳐 프롬프트를 새로 재해석한다 —
  // 그런데 이미 완성된 영문 프롬프트를 다시 넣어도 이 재해석 때문에 매번 다른 문구로
  // 바뀌어 "설정을 그대로 불러왔는데 완전히 다른 그림이 나온다"는 문제가 있었다. 재사용
  // 시엔 skipAutoTune을 켜서 이 재해석 단계를 건너뛰고 프롬프트/체크포인트를 그대로 쓴다.
  const reuseGenerationSettings = (item) => {
    setDirectPrompt(item.prompt || '');
    setStyleOverride(item.style || null);
    setCheckpointOverride(item.checkpoint || null);
    setSeedOverride(item.seed !== null && item.seed !== undefined ? String(item.seed) : '');
    if (item.aspectRatio) setImageAspectRatio(item.aspectRatio);
    setSkipAutoTune(true);
    setStudioTab('prompt');
    setSelectedImage(null);
  };

  // 갤러리 이미지를 이미지 수정(img2img) 탭에 바로 로드한다.
  const attachGalleryImageToEdit = async (item) => {
    try {
      const res = await fetch(`/generated/${item.imageFilename}`);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        setPromptAttachedImage(reader.result);
        setStudioTab('edit');
        setSelectedImage(null);
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error('갤러리 이미지 수정 탭 로드 실패:', err);
    }
  };

  // 1-클릭 4K 초고화질 업스케일러 처리
  const handle4KUpscale = async (item) => {
    if (!item || isUpscaling) return;
    setIsUpscaling(true);
    addToast('info', '4K 업스케일 렌더링', '이미지를 4K 해상도로 선명하게 리터칭 및 확장하는 중...');
    try {
      const res = await fetch(API_BASE_URL + '/v1/image/upscale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: item.imageFilename, image_filename: item.imageFilename, scale_by: 2.0 })
      });
      if (res.ok) {
        addToast('success', '4K 업스케일 완료!', '4K 초고화질 이미지가 보관함에 추가되었습니다.');
        await loadStudioGallery();
        setSelectedImage(null);
      } else {
        const err = await res.json().catch(() => ({ detail: '업스케일 응답 파싱 중 에러가 발생했습니다.' }));
        const errMsg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail || err);
        addToast('error', '4K 업스케일 실패', errMsg);
      }
    } catch (err) {
      addToast('error', '연결 오류', String(err.message || err));
    } finally {
      setIsUpscaling(false);
    }
  };

  // 생성된 이미지를 사용자 PC에 실제 파일로 저장한다.
  const downloadImage = async (item) => {
    try {
      const res = await fetch(`/generated/${item.imageFilename}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.imageFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('다운로드 실패:', err);
    }
  };

  // 새 대화 시작 (기존 대화는 과거 기록에 보존되고 새 세션 생성)
  const startNewChat = () => {
    const newId = `session-${Date.now()}`;
    setCurrentSessionId(newId);
    setChatMessages([]);
    setChatInput('');
    setChatAttachedImage(null);
    setIsChatting(false);
    setShowHistoryDrawer(false);
  };

  // 과거 대화 목록에서 특정 세션을 선택하여 불러온다.
  const loadChatSession = (session) => {
    setCurrentSessionId(session.id);
    setChatMessages(session.messages || []);
    setChatInput('');
    setChatAttachedImage(null);
    setShowHistoryDrawer(false);
  };

  // 선택한 과거 대화 세션 한 건만 지운다.
  const deleteChatSession = (sessionId, e) => {
    e.stopPropagation();
    setChatSessions(prev => {
      const filtered = prev.filter(s => s.id !== sessionId);
      try {
        localStorage.setItem('studio_chat_sessions_v2', JSON.stringify(filtered));
      } catch (err) {}
      return filtered;
    });
    if (currentSessionId === sessionId) {
      startNewChat();
    }
  };

  const sendChatMessage = async () => {
    const text = chatInput.trim();
    if ((!text && !chatAttachedImage) || isChatting) return;
    const userMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text || '(참고 이미지 첨부)',
      image: chatAttachedImage,
      // Ollama에 보낼 땐 "data:image/png;base64," 접두사를 떼고 순수 base64만 넘긴다.
      imageB64: chatAttachedImage ? chatAttachedImage.split(',').pop() : undefined
    };
    const nextMessages = [...chatMessages, userMsg];
    setChatMessages(nextMessages);
    setChatInput('');
    setChatAttachedImage(null);
    setIsChatting(true);
    try {
      const res = await fetch(API_BASE_URL + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4:e4b',
          max_tokens: 3000,
          temperature: 0.5,
          messages: [
            { role: 'system', content: DESIGNER_SYSTEM_PROMPT },
            ...nextMessages.map(m => ({
              role: m.role,
              content: m.content,
              ...(m.imageB64 ? { images: [m.imageB64] } : {})
            }))
          ]
        })
      });
      if (!res.ok) throw new Error('대화 요청 실패');
      const data = await res.json();
      const reply = (data.choices?.[0]?.message?.content || '').trim();
      setChatMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: reply || '(응답이 비어있습니다)' }]);
    } catch (err) {
      console.error('대화 오류:', err);
      setChatMessages(prev => [...prev, { id: `e-${Date.now()}`, role: 'assistant', content: '⚠️ 응답을 받지 못했습니다. Ollama가 켜져 있는지 확인해주세요.' }]);
    } finally {
      setIsChatting(false);
    }
  };

  // 지금까지의 대화 전체를 읽어 최종 영문 프롬프트 하나로 정리해 생성 탭으로 넘긴다.
  // 이 함수 자체는 이미지를 생성하지 않는다 — 프롬프트 탭으로 넘기기만 한다.
  const compileConversationToPrompt = async () => {
    const logs = chatMessages.filter(m => m.content?.trim());
    if (logs.length === 0) {
      alert('아직 나눈 대화가 없습니다 — 먼저 대화로 원하는 이미지를 설명해주세요.');
      return;
    }
    setIsCompiling(true);
    try {
      const transcript = logs.map(m => `${m.role === 'user' ? '사용자' : '디자이너'}: ${m.content}`).join('\n');
      const res = await fetch(API_BASE_URL + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4:e4b',
          max_tokens: 3000,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: 'You are an expert AI prompt engineer. Below is a full back-and-forth conversation between a user '
                + 'and an image-generation assistant, where the user\'s request may have been refined or changed across '
                + 'multiple turns. Read the ENTIRE conversation and figure out what the user\'s FINAL, most up-to-date '
                + 'intent is (later turns override earlier ones when they conflict). Then output ONE detailed, '
                + 'comma-separated English Stable Diffusion prompt capturing that final intent: subject, environment, '
                + 'lighting, mood, and photorealistic rendering tags as appropriate. Output ONLY the comma-separated '
                + 'English tags — no greetings, no explanations, no meta-commentary about the conversation.'
            },
            { role: 'user', content: transcript }
          ]
        })
      });
      if (!res.ok) throw new Error('컴파일 요청 실패');
      const data = await res.json();
      const compiled = (data.choices?.[0]?.message?.content || '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/^["'`]+|["'`]+$/g, '')
        .trim();
      if (!compiled) throw new Error('빈 결과를 받았습니다');
      setDirectPrompt(compiled);
      // reuseGenerationSettings와 동일한 이유: 여기서 만든 것도 이미 완성된 영문 프롬프트라,
      // 생성 시 자동 튜닝이 다시 재해석하면 대화에서 정리한 내용과 다른 그림이 나온다.
      setSkipAutoTune(true);
      setStudioTab('prompt');
    } catch (e) {
      console.error('대화 컴파일 실패:', e);
      alert('대화를 프롬프트로 정리하는 데 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsCompiling(false);
    }
  };

  // ── 프롬프트 탭 ──────────────────────────────────────────────
  const handlePromptImageSelect = (e) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(file => addPromptAttachedImage(file));
    }
    e.target.value = '';
  };

  const handlePromptImageDrop = (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files) {
      Array.from(files).forEach(file => addPromptAttachedImage(file));
    }
  };

  const handleEditImageDrop = (e) => {
    e.preventDefault();
    setIsDraggingOverEdit(false);
    addPromptAttachedImage(e.dataTransfer.files?.[0]);
  };

  // ── 인페인트 / 아웃페인트 ──────────────────────────────────────
  const handleInpaintImageSelect = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    readImageFileInto(file, setInpaintImage);
  };

  const handleInpaintImageDrop = (e) => {
    e.preventDefault();
    setIsDraggingOverEdit(false);
    readImageFileInto(e.dataTransfer.files?.[0], setInpaintImage);
  };

  // 이미지가 로드되면 마스크 캔버스를 그 이미지의 실제 픽셀 크기로 초기화하고
  // 이미지를 그린 후 투명한 마스크 레이어를 위에 올린다.
  // 화면에는 CSS로 축소해서 보여주지만, 브러시 좌표는 항상 원본 픽셀 기준으로 찍어야
  // 서버로 보내는 마스크가 원본 이미지와 정확히 같은 해상도·정렬을 유지한다.
  const initInpaintMaskCanvas = () => {
    const img = inpaintImgElRef.current;
    const canvas = inpaintCanvasRef.current;
    if (!img || !canvas) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    // 이미지 그리기
    ctx.drawImage(img, 0, 0);
    // 마스크 레이어를 위에 올림 (검은색 - 선택 안 됨)
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
  };

  const clearInpaintMask = () => {
    const canvas = inpaintCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const getMaskCanvasPoint = (e) => {
    const canvas = inpaintCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const paintMaskAt = (x, y) => {
    const canvas = inpaintCanvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const handleMaskPointerDown = (e) => {
    isPaintingMaskRef.current = true;
    const p = getMaskCanvasPoint(e);
    paintMaskAt(p.x, p.y);
  };
  const handleMaskPointerMove = (e) => {
    if (!isPaintingMaskRef.current) return;
    const p = getMaskCanvasPoint(e);
    paintMaskAt(p.x, p.y);
  };
  const handleMaskPointerUp = () => { isPaintingMaskRef.current = false; };

  const toggleOutpaintDirection = (dir) => {
    setOutpaintDirections(prev => ({ ...prev, [dir]: !prev[dir] }));
  };

  const handleInpaintGenerateWithImage = async (imageBase64, mode) => {
    if (!imageBase64 || isInpainting) return;
    const hasOutpaintDirection = Object.values(outpaintDirections).some(Boolean);
    if (mode === 'outpaint' && !hasOutpaintDirection) return;

    setIsInpainting(true);
    try {
      const body = {
        image_base64: imageBase64.split(',').pop(),
        prompt: inpaintPrompt,
        style: 'photograph',
        num_steps: imageOptions.performance_presets?.[imagePerformance]?.steps || 25,
        guidance_scale: imageOptions.performance_presets?.[imagePerformance]?.cfg || 4.5,
        seed: seedOverride !== '' ? Number(seedOverride) : undefined,
      };
      if (mode === 'inpaint') {
        body.mask_base64 = inpaintCanvasRef.current.toDataURL('image/png').split(',').pop();
      } else {
        body.expand_left = outpaintDirections.left ? outpaintAmount : 0;
        body.expand_top = outpaintDirections.top ? outpaintAmount : 0;
        body.expand_right = outpaintDirections.right ? outpaintAmount : 0;
        body.expand_bottom = outpaintDirections.bottom ? outpaintAmount : 0;
      }

      const res = await fetch(API_BASE_URL + '/v1/image/inpaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.seed_used !== undefined) setLastSeedUsed(data.seed_used);
        loadStudioGallery();
        addToast('success', mode === 'inpaint' ? '인페인트 완료' : '아웃페인트 완료', '이미지가 생성되었습니다.');
      } else {
        const err = await res.json().catch(() => ({}));
        addToast('error', '생성 실패', err.detail || '알 수 없는 오류가 발생했습니다.');
      }
    } catch (err) {
      addToast('error', '연결 오류', `백엔드 서버에 연결할 수 없습니다: ${err.message}`);
    } finally {
      setIsInpainting(false);
    }
  };


  // 편집 지시문 다듬기 — 프롬프트 탭의 "다듬기"와 시스템 프롬프트가 다르다. 여기선 전체 장면을
  // 상세 묘사하면 안 된다(원본 구도를 낮은 denoise로 보존하는 img2img라 프롬프트가 길고 장황해지면
  // 오히려 원본과 어긋난다) — "무엇을 바꿀지"만 짧고 명확한 영어로 다듬는다.
  const suggestEditInstructionImprovement = async () => {
    if (!editInstruction.trim() || isSuggestingEdit) return;
    setIsSuggestingEdit(true);
    setEditSuggestion('');
    try {
      const res = await fetch(API_BASE_URL + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4:e4b',
          max_tokens: 500,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: 'You are helping refine a SHORT image-editing instruction for an img2img pipeline that preserves '
                + 'the original photo\'s composition. The user describes only what should CHANGE (e.g. time of day, weather, '
                + 'season, color, one object). Translate to English if needed and make it a bit more specific, but keep it '
                + 'SHORT (under 15 words) and focused only on the change — do NOT describe the whole scene, do NOT add '
                + 'unrelated details. Output ONLY the refined instruction text.'
            },
            { role: 'user', content: editInstruction }
          ]
        })
      });
      if (res.ok) {
        const data = await res.json();
        const suggestion = (data.choices?.[0]?.message?.content || '')
          .replace(/```[\s\S]*?```/g, '')
          .replace(/^["'`]+|["'`]+$/g, '')
          .trim();
        if (suggestion) setEditSuggestion(suggestion);
      }
    } catch (e) {
      console.error('편집 지시문 다듬기 실패:', e);
    } finally {
      setIsSuggestingEdit(false);
    }
  };

  const suggestPromptImprovement = async () => {
    if (!directPrompt.trim() || isSuggestingPrompt) return;
    setIsSuggestingPrompt(true);
    setPromptSuggestion('');
    try {
      const res = await fetch(API_BASE_URL + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4:e4b',
          max_tokens: 3000,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: 'You are an AI Image Prompt Enhancer. The user provided a draft prompt or design concept. '
                + 'Refine it into a high-quality, comma-separated English Stable Diffusion/SDXL prompt (photorealistic, '
                + '8k resolution, cinematic lighting, detailed composition). Output ONLY the refined English prompt text.'
            },
            { role: 'user', content: directPrompt }
          ]
        })
      });
      if (res.ok) {
        const data = await res.json();
        const suggestion = (data.choices?.[0]?.message?.content || '')
          .replace(/```[\s\S]*?```/g, '')
          .replace(/^["'`]+|["'`]+$/g, '')
          .trim();
        if (suggestion) setPromptSuggestion(suggestion);
      }
    } catch (e) {
      console.error('프롬프트 제안 실패:', e);
    } finally {
      setIsSuggestingPrompt(false);
    }
  };

  const refineArchPrompt = async () => {
    if (!archPrompt.trim() || isArchPromptRefining) return;
    setIsArchPromptRefining(true);
    try {
      const res = await fetch(API_BASE_URL + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4:e4b',
          max_tokens: 3000,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: 'You are an expert architectural visualization prompt engineer. The user provided a description of architectural style or modifications. '
                + 'Enhance it into a detailed, professional architectural rendering prompt for image generation. '
                + 'Focus on: architectural style, materials, lighting, composition, photorealistic quality, 8k resolution, professional rendering. '
                + 'Output ONLY the refined prompt text in Korean and English mixed format.'
            },
            { role: 'user', content: archPrompt }
          ]
        })
      });
      if (res.ok) {
        const data = await res.json();
        const refined = (data.choices?.[0]?.message?.content || '')
          .replace(/```[\s\S]*?```/g, '')
          .replace(/^["'`]+|["'`]+$/g, '')
          .trim();
        if (refined) setArchPrompt(refined);
      }
    } catch (e) {
      console.error('건축 프롬프트 개선 실패:', e);
    } finally {
      setIsArchPromptRefining(false);
    }
  };

  const refineInpaintPrompt = async () => {
    if (!inpaintPrompt.trim() || isInpaintPromptRefining) return;
    setIsInpaintPromptRefining(true);
    try {
      const res = await fetch(API_BASE_URL + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4:e4b',
          max_tokens: 3000,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: 'You are an expert image editing prompt engineer. The user provided a description of changes to make to an image. '
                + 'Enhance it into a detailed, professional image editing prompt for AI image generation. '
                + 'Focus on: specific details to modify, style consistency, quality improvements, realistic textures, lighting, composition. '
                + 'Output ONLY the refined prompt text in Korean and English mixed format.'
            },
            { role: 'user', content: inpaintPrompt }
          ]
        })
      });
      if (res.ok) {
        const data = await res.json();
        const refined = (data.choices?.[0]?.message?.content || '')
          .replace(/```[\s\S]*?```/g, '')
          .replace(/^["'`]+|["'`]+$/g, '')
          .trim();
        if (refined) setInpaintPrompt(refined);
      }
    } catch (e) {
      console.error('부분 수정 프롬프트 개선 실패:', e);
    } finally {
      setIsInpaintPromptRefining(false);
    }
  };

  const refineBlendPrompt = async () => {
    if (!blendPrompt.trim() || isBlendPromptRefining) return;
    setIsBlendPromptRefining(true);
    try {
      const res = await fetch(API_BASE_URL + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4:e4b',
          max_tokens: 3000,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: 'You are an expert prompt engineer for AI image blending. The user provided a short description '
                + 'of what they want the blended result to emphasize (on top of reference images). '
                + 'Enhance it into a detailed, professional prompt for AI image generation. '
                + 'Focus on: mood, lighting, material/texture cues, composition — things that complement image-based '
                + 'reference inputs rather than describing a whole new scene from scratch. '
                + 'Output ONLY the refined prompt text in Korean and English mixed format.'
            },
            { role: 'user', content: blendPrompt }
          ]
        })
      });
      if (res.ok) {
        const data = await res.json();
        const refined = (data.choices?.[0]?.message?.content || '')
          .replace(/```[\s\S]*?```/g, '')
          .replace(/^["'`]+|["'`]+$/g, '')
          .trim();
        if (refined) setBlendPrompt(refined);
      }
    } catch (e) {
      console.error('블렌딩 프롬프트 개선 실패:', e);
    } finally {
      setIsBlendPromptRefining(false);
    }
  };

  // img2img(전역 재확산)는 마스크 없이 이미지 전체를 다시 그리는 방식이라, 원본에 없던
  // 사람·동물 같은 새 피사체를 "추가"하는 지시는 원본 보존 강도가 낮으면(구조를 많이 남겨둠)
  // 새 형태가 들어갈 자리가 없어 원본과 뒤섞이며 뭉개진다 — 마스크 기반 인페인팅 없이 고칠 수
  // 있는 부분은, 이런 지시일 때 보존 강도를 자동으로 충분히 낮춰(=denoise를 높여) 주는 것이다.
  const ADD_SUBJECT_PATTERN = /(추가|넣어|넣어줘|집어넣|사람을|사람이|등장시켜|add (a |an |another )?(person|people|man|woman|character|figure|animal|dog|cat)|add.*(to (the|this) image)|insert (a|an))/i;

  const handleGenerate = async () => {
    // 참고 이미지가 붙어있으면서 editInstruction이 있으면 그것을 사용, 아니면 directPrompt 사용
    const sourcePrompt = (promptAttachedImages.length > 0 && editInstruction.trim()) ? editInstruction : directPrompt;
    if (!sourcePrompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setIsAutoTuning(true);
    setStrengthAutoNotice('');

    // 새 피사체 추가 지시인데 보존 강도가 너무 낮으면(원본을 많이 남겨두면) 자동으로 올려준다.
    let effectiveDenoise = img2imgStrength;
    if (promptAttachedImages.length > 0 && ADD_SUBJECT_PATTERN.test(editInstruction) && img2imgStrength < 0.75) {
      effectiveDenoise = 0.8;
      setImg2imgStrength(0.8);
      setStrengthAutoNotice('"추가" 지시는 원본을 그대로 두고 새 대상을 끼워 넣을 수 없어, 원본 보존 강도를 자동으로 낮췄습니다(80% 재해석). 그래도 뭉개지면 강도를 더 올려보세요.');
    }

    let finalPrompt = sourcePrompt;
    let genStyle = styleOverride || 'none';
    let genCheckpoint = checkpointOverride || undefined;
    let genLoras = [];
    let genNegativeExtra;

    if (skipAutoTune || promptAttachedImages.length > 0) {
      // "이 설정으로 다시 만들기"로 불러온 프롬프트는 이미 완성된 영문 프롬프트라 재해석하면 안 되고,
      // img2img는 "비 오는 날로 바꿔줘"처럼 짧은 수정 지시문이 정상이라 자동 튜닝(전체 장면을 다시
      // 상세 묘사하려는 소형 LLM)에 넣으면 스키마 예시 문구를 그대로 반복하는 등 엉뚱하게 망가진다.
      // 두 경우 다 AI 재해석 없이 사용자가 쓴 문구를 그대로 CLIP에 넘긴다.
      setIsAutoTuning(false);
    } else {
      try {
        const tuneRes = await fetch(API_BASE_URL + '/v1/image/auto-tune', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: directPrompt })
        });
        if (tuneRes.ok) {
          const tuneData = await tuneRes.json();
          if (tuneData.status === 'success') {
            finalPrompt = tuneData.refined_prompt || directPrompt;
            const opts = tuneData.recommended_options || {};
            genStyle = styleOverride || opts.style || genStyle;
            genCheckpoint = checkpointOverride || opts.checkpoint || undefined;
            genLoras = opts.loras || [];
            genNegativeExtra = opts.negative_extra || undefined;
            setAutoTuneResult(tuneData);
          }
        }
      } catch (e) {
        console.error('자동 튜닝 건너뜀:', e);
      } finally {
        setIsAutoTuning(false);
      }
    }

    const count = Number(imageBatchCount) || 1;
    for (let i = 0; i < count; i++) {
      try {
        // Fooocus Quality Mode와 Standard Mode로 다른 엔드포인트 사용
        const endpoint = qualityMode === 'fooocus_quality' ? '/v1/image/generate-quality' : '/v1/image/generate';
        const requestBody = qualityMode === 'fooocus_quality'
          ? {
              prompt: finalPrompt,
              style: genStyle || 'fooocus_enhance',
              negative_prompt_extra: genNegativeExtra || '',
              preset: qualityPreset,
              prompt_enhance: promptEnhance,
              sharpness: sharpness,
              adm_guidance: adm_guidance,
              seed: seedOverride !== '' ? Number(seedOverride) : undefined,
              checkpoint: genCheckpoint
            }
          : {
              prompt: finalPrompt,
              num_steps: imageOptions.performance_presets?.[imagePerformance]?.steps || 25,
              guidance_scale: imageOptions.performance_presets?.[imagePerformance]?.cfg || 7.0,
              style: genStyle,
              aspect_ratio: imageAspectRatio,
              negative_prompt_extra: genNegativeExtra,
              loras: genLoras.length > 0 ? genLoras : undefined,
              checkpoint: genCheckpoint,
              seed: seedOverride !== '' ? Number(seedOverride) : undefined,
              input_image_base64: promptAttachedImages.length > 0 ? promptAttachedImages[0].split(',').pop() : undefined,
              denoise: promptAttachedImages.length > 0 ? effectiveDenoise : undefined
            };

        const res = await fetch(`${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        if (res.ok) {
          const genData = await res.json();
          if (genData.seed_used !== undefined) setLastSeedUsed(genData.seed_used);
          loadStudioGallery();
          if (i === count - 1) addToast('success', '생성 완료', `${count}장의 이미지가 생성되었습니다.`);
        } else {
          const err = await res.json().catch(() => ({}));
          console.error('생성 실패:', err);
          addToast('error', '이미지 생성 실패', err.detail || '알 수 없는 오류가 발생했습니다. ComfyUI가 켜져 있는지 확인해주세요.');
        }
      } catch (err) {
        console.error('생성 오류:', err);
        addToast('error', '연결 오류', `백엔드 서버에 연결할 수 없습니다: ${err.message}`);
      }
    }
    setIsGenerating(false);
  };

  // FLUX.1 Kontext로 "이 이미지에서 이 지시대로 바꿔줘"를 그대로 반영한 편집 이미지를 만든다.
  // 기존 img2img(handleGenerate의 denoise 재해석 경로)와 달리 프롬프트 재작성 없이
  // 지시문을 그대로 CLIP에 넘기고, 원본 구도/피사체는 ReferenceLatent로 유지된다.
  const handleKontextEdit = async () => {
    if (!editInstruction.trim() || promptAttachedImages.length === 0 || isKontextEditing) return;
    setIsKontextEditing(true);
    try {
      const res = await fetch(API_BASE_URL + '/v1/image/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: promptAttachedImages[0].split(',').pop(),
          instruction: editInstruction,
        })
      });
      if (res.ok) {
        const data = await res.json();
        setLastSeedUsed(data.seed_used);
        loadStudioGallery();
        addToast('success', '편집 완료', 'Kontext AI가 지시대로 이미지를 수정했습니다.');
      } else {
        const err = await res.json().catch(() => ({}));
        addToast('error', '이미지 편집 실패', err.detail || '알 수 없는 오류가 발생했습니다.');
      }
    } catch (err) {
      addToast('error', '연결 오류', `백엔드 서버에 연결할 수 없습니다: ${err.message}`);
    } finally {
      setIsKontextEditing(false);
    }
  };

  // ── 건축 실사화(Arch-Viz) 전용 생성 처리 ──
  const toggleArchStyle = (id) => {
    setArchSelectedStyles(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  // 매스 모델 이미지 하나 + 스타일 하나로 실사화 이미지 한 장을 만든다.
  // (배치 생성의 최소 단위 — handleArchGenerate가 이걸 스타일×매수만큼 반복 호출한다)
  const generateOneArchDesign = async (styleId) => {
    // 2026-08-31: denoise만으로 "형태(매스) 보존"과 "재질 실사화"를 동시에 만족시킬 수 없었다
    // (denoise를 낮추면 재질도 원본 캡처처럼 밋밋하게 남고, 높이면 재질은 실사가 되지만
    // 건물 형태·창호 배치까지 같이 바뀌어버림) — Canny ControlNet으로 원본 외곽선을
    // 고정해 형태는 그대로 두고, denoise는 항상 높게 유지해 재질/조명만 확실히 실사로
    // 다시 그리도록 바꿨다. 형태 보존율 슬라이더는 이제 "엣지를 얼마나 엄격히 고정할지"
    // (controlnet_strength)를 조절한다 — 값이 높을수록 원본 매스에서 거의 벗어나지 않는다.
    const controlnetStrength = 0.5 + (archKeepStructure / 100) * 0.45;
    const effectiveDenoise = 0.75;
    const styleInfo = ARCH_STYLE_PRESETS[styleId] || ARCH_STYLE_PRESETS.modern;

    // 사용자가 입력한 한글 프롬프트와 프리셋 영어 프롬프트를 합성
    // (AutoTune을 타지 않고 다이렉트로 Juggernaut-XL 실사 건축 모델에 맞게 주입)
    const combinedPrompt = archPrompt.trim()
      ? `${archPrompt.trim()}, ${styleInfo.prompt}`
      : styleInfo.prompt;

    const res = await fetch(API_BASE_URL + '/v1/image/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: combinedPrompt,
        num_steps: imageOptions.performance_presets?.[imagePerformance]?.steps || 30,
        guidance_scale: imageOptions.performance_presets?.[imagePerformance]?.cfg || 4.5, // SDXL에 적당한 4.5
        style: 'architecture',
        aspect_ratio: imageAspectRatio,
        negative_prompt_extra: "warped perspective, floating objects, unrealistic proportions, tilted horizon, distorted details, bad anatomy, deformed, sketch, monochrome",
        loras: [],
        checkpoint: "Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors", // 검증된 최고 등급 건축 실사화 모델
        // 배치 생성에서는 매번 다른 시드여야 같은 스타일 안에서도 서로 다른 디자인이 나온다.
        seed: (archVariationsPerStyle === 1 && archSelectedStyles.length === 1 && seedOverride !== '')
          ? Number(seedOverride) : undefined,
        input_image_base64: archImage ? archImage.split(',').pop() : (promptAttachedImages.length > 0 ? promptAttachedImages[0].split(',').pop() : undefined),
        denoise: effectiveDenoise,
        // 건축 실사화는 인물 얼굴이 없으므로 FaceDetailer가 불필요하게 몇 분씩 더 걸리게 만든다.
        disable_face_detailer: true,
        // Canny ControlNet으로 원본 외곽선(매스)을 고정 — 위 controlnetStrength 주석 참고.
        controlnet_strength: controlnetStrength
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '알 수 없는 오류가 발생했습니다.');
    }
    return res.json();
  };

  // 이미지 블렌딩 함수 — 이지 모드는 "참조 이미지 + 영향도" 하나로 단순하게, 프로 모드는
  // Fooocus의 Image Prompt 패널처럼 슬롯(최대 4개)마다 타입/Stop At/Weight를 독립 조절한다.
  // 둘 다 결국 같은 백엔드 슬롯 API(base_image + slots[])로 합쳐서 보낸다.
  const handleBlend = async () => {
    // 프로 모드는 기존 이미지 자체가 항상 PyraCanny 구조 슬롯으로 포함되므로, 별도 슬롯 없이
    // 기존 이미지만으로도 블렌딩 가능하다 — 이지 모드는 여전히 참조 이미지가 최소 1장 필요.
    const hasContent = isEasyMode ? blendReferenceImages.length > 0 : true;
    if (!blendBaseImage || !hasContent) return;
    setIsBlending(true);

    let slots;
    if (isEasyMode) {
      const ipWeight = 0.4 + (blendInfluence / 100) * 1.1; // 0.4 ~ 1.5
      const ipStopAt = BLEND_EMPHASIS_STOP_AT[blendEmphasis] ?? 0.5;
      slots = [
        ...(blendStructureEnabled
          ? [{ image: blendBaseImage.split(',')[1] || blendBaseImage, type: blendStructureType, stop_at: 0.5, weight: 1.0 }]
          : []),
        ...blendReferenceImages.map(img => ({
          image: img.split(',')[1] || img, type: 'ImagePrompt', stop_at: ipStopAt, weight: ipWeight
        }))
      ];
      addToast('info', '블렌딩 시작', `참조 ${blendReferenceImages.length}장, ${blendInfluence}% 영향도로 블렌딩하고 있습니다.`);
    } else {
      // 기존 이미지도 슬롯 카드와 동일하게 Stop At/Weight를 가지므로, PyraCanny 구조 슬롯으로
      // 자동 포함시킨다 — 사용자가 슬롯에 같은 이미지를 다시 올릴 필요가 없다.
      slots = [
        { image: blendBaseImage.split(',')[1] || blendBaseImage, type: 'PyraCanny', stop_at: blendBaseStopAt, weight: blendBaseWeight },
        ...blendSlots.map(s => ({
          image: s.image.split(',')[1] || s.image, type: s.type, stop_at: s.stopAt, weight: s.weight
        }))
      ];
      addToast('info', '블렌딩 시작', `기존 이미지 + 슬롯 ${blendSlots.length}개로 블렌딩하고 있습니다.`);
    }

    try {
      const response = await fetch(API_BASE_URL + '/v1/image/blend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_image: blendBaseImage.split(',')[1] || blendBaseImage,
          slots,
          // 프롬프트/감도는 프로 모드 전용 — 이지 모드는 기존처럼 이미지만으로 블렌딩한다.
          ...(!isEasyMode && blendPrompt.trim() ? { prompt: blendPrompt.trim() } : {}),
          ...(!isEasyMode ? { denoise: blendDenoise / 100 } : {})
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.image_filename) {
          const newItem = {
            id: Date.now(),
            imageFilename: data.image_filename,
            prompt: isEasyMode
              ? `블렌딩 (영향도 ${blendInfluence}%, ${BLEND_EMPHASIS_OPTIONS.find(o => o.value === blendEmphasis)?.label || ''}${blendStructureEnabled ? ', 형태 유지' : ''})`
              : `블렌딩 (슬롯 ${blendSlots.length}개, 감도 ${blendDenoise}%)`,
            isFavorite: false,
            // 라이트박스에서 "전/후" 비교 슬라이더로 보여주기 위해 기존 이미지를 같이 보관한다.
            // 브라우저 메모리(data URL)에만 있어서 새로고침하면 사라진다 — 이번 세션 한정.
            beforeImage: blendBaseImage
          };
          setStudioGallery(prev => [newItem, ...prev]);
          addToast('success', '블렌딩 완료', '이미지가 보관함에 추가되었습니다.');
        }
      } else {
        const err = await response.json().catch(() => ({}));
        addToast('error', '블렌딩 실패', typeof err.detail === 'string' ? err.detail : '블렌딩 중 오류가 발생했습니다.');
      }
    } catch (err) {
      console.error('블렌딩 오류:', err);
      addToast('error', '블렌딩 오류', err.message);
    } finally {
      setIsBlending(false);
    }
  };

  // 선택한 모든 스타일 × 스타일별 매수만큼 순차적으로 생성해서 "디자인 제안 여러 장"을 뽑는다.
  // ComfyUI가 요청 하나씩만 처리하므로 프론트에서 순차 호출하며, 끝날 때마다 갤러리를
  // 바로 갱신해 결과가 하나씩 도착하는 걸 눈으로 볼 수 있게 한다.
  const handleArchGenerate = async () => {
    const hasImage = archImage || promptAttachedImages.length > 0;
    if (!hasImage || isGenerating || archSelectedStyles.length === 0) return;
    setIsGenerating(true);

    const jobs = [];
    archSelectedStyles.forEach(styleId => {
      for (let i = 0; i < archVariationsPerStyle; i++) jobs.push(styleId);
    });
    setArchBatchProgress({ current: 0, total: jobs.length });

    let successCount = 0;
    let lastError = null;
    for (let i = 0; i < jobs.length; i++) {
      try {
        const data = await generateOneArchDesign(jobs[i]);
        if (data.seed_used !== undefined) setLastSeedUsed(data.seed_used);
        successCount++;
        loadStudioGallery();
      } catch (err) {
        console.error('실사화 생성 실패:', err);
        lastError = err;
      }
      setArchBatchProgress({ current: i + 1, total: jobs.length });
    }

    if (successCount > 0) {
      addToast('success', '디자인 제안 생성 완료',
        `${successCount}개의 디자인 이미지가 생성되었습니다.${successCount < jobs.length ? ` (${jobs.length - successCount}개 실패)` : ''}`);
    } else {
      addToast('error', '생성 실패', lastError?.message || 'ComfyUI 상태를 확인해 주세요.');
    }
    setIsGenerating(false);
  };

  // 매스 모델 하나 + 무작위로 뽑은 스타일/재질/형태/조명 조합으로 실사화 이미지 한 장을 만든다.
  // (야간 배치의 최소 단위 — handleNightBatchGenerate가 이걸 nightBatchCount번 반복 호출한다)
  const generateOneNightBatchDesign = async () => {
    const stylePool = nightBatchSelectedStyles.length > 0 ? nightBatchSelectedStyles : Object.keys(ARCH_STYLE_PRESETS);
    const styleId = pickRandom(stylePool);
    const styleInfo = ARCH_STYLE_PRESETS[styleId] || ARCH_STYLE_PRESETS.modern;
    const material = pickRandom(NIGHT_BATCH_MATERIALS);
    const form = pickRandom(NIGHT_BATCH_FORMS);
    const lighting = pickRandom(NIGHT_BATCH_LIGHTING);

    const descriptorPrompt = `${form}, ${material}, ${lighting}`;
    const combinedPrompt = nightBatchPrompt.trim()
      ? `${nightBatchPrompt.trim()}, ${descriptorPrompt}, ${styleInfo.prompt}`
      : `${descriptorPrompt}, ${styleInfo.prompt}`;

    const controlnetStrength = 0.5 + (nightBatchKeepStructure / 100) * 0.45;

    const res = await fetch(API_BASE_URL + '/v1/image/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: combinedPrompt,
        num_steps: imageOptions.performance_presets?.[imagePerformance]?.steps || 30,
        guidance_scale: imageOptions.performance_presets?.[imagePerformance]?.cfg || 4.5,
        style: 'architecture',
        aspect_ratio: imageAspectRatio,
        negative_prompt_extra: "warped perspective, floating objects, unrealistic proportions, tilted horizon, distorted details, bad anatomy, deformed, sketch, monochrome",
        loras: [],
        checkpoint: "Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors",
        // 매 장마다 완전히 다른 시드를 써야 같은 스타일/재질 조합이라도 다른 결과가 나온다.
        seed: undefined,
        input_image_base64: archImage ? archImage.split(',').pop() : (promptAttachedImages.length > 0 ? promptAttachedImages[0].split(',').pop() : undefined),
        denoise: 0.75,
        disable_face_detailer: true,
        controlnet_strength: controlnetStrength
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || '알 수 없는 오류가 발생했습니다.');
    }
    return res.json();
  };

  // "퇴근 모드": 목표 장수만큼 순차 생성하며 매번 스타일/재질/형태/조명을 무작위로 다시 뽑는다.
  // 시간이 오래 걸려도 상관없다는 전제(밤새 실행)라 순차 호출로 충분하며, 중간에 실패해도
  // 계속 진행하고 마지막에 성공/실패 개수를 요약해서 알려준다. nightBatchStopRef로 중단 가능.
  const handleNightBatchGenerate = async () => {
    const hasImage = archImage || promptAttachedImages.length > 0;
    if (!hasImage || nightBatchRunning) return;
    if (nightBatchCount < 1) return;

    nightBatchStopRef.current = false;
    setNightBatchRunning(true);
    setNightBatchProgress({ current: 0, total: nightBatchCount, failed: 0 });
    addToast('info', '퇴근 모드 시작', `${nightBatchCount}장의 디자인 시안을 순차적으로 생성합니다. 브라우저 탭을 닫지 마세요.`);

    let successCount = 0;
    let failCount = 0;
    for (let i = 0; i < nightBatchCount; i++) {
      if (nightBatchStopRef.current) break;
      try {
        const data = await generateOneNightBatchDesign();
        if (data.seed_used !== undefined) setLastSeedUsed(data.seed_used);
        successCount++;
        loadStudioGallery();
      } catch (err) {
        console.error('퇴근 모드 생성 실패:', err);
        failCount++;
      }
      setNightBatchProgress({ current: i + 1, total: nightBatchCount, failed: failCount });
    }

    if (successCount > 0) {
      addToast('success', '퇴근 모드 완료',
        `${successCount}개의 디자인 시안이 생성되었습니다.${failCount > 0 ? ` (${failCount}개 실패)` : ''}`);
    } else {
      addToast('error', '퇴근 모드 실패', '한 장도 생성하지 못했습니다. ComfyUI 상태를 확인해 주세요.');
    }
    setNightBatchRunning(false);
  };

  const stopNightBatchGenerate = () => {
    nightBatchStopRef.current = true;
  };


  const selectStyle = {
    padding: '9px 10px',
    borderRadius: '10px',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontSize: '13.5px',
    outline: 'none',
    fontFamily: 'inherit',
    cursor: 'pointer'
  };

  const tabBtnStyle = (active) => ({
    flex: 1,
    padding: '11px',
    borderRadius: '10px',
    border: `1px solid ${active ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
    background: active ? 'rgba(51, 51, 153, 0.14)' : 'transparent',
    color: active ? 'var(--accent-cyan)' : 'var(--text-secondary)',
    fontWeight: 700,
    fontSize: '14.5px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '7px',
    transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease'
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* 백그라운드 오로라 글로우 효과 */}
      <div className="aurora-bg">
        <div className="aurora-glow aurora-glow-1"></div>
        <div className="aurora-glow aurora-glow-2"></div>
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
      {/* 상단 헤더 (HEADER_BRAND_GUIDE.md 반영: 로고 + 그라데이션 타이틀 + 소제목 + 우측 상태 뱃지) */}
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        height: '80px', padding: '0 28px', borderBottom: '1px solid rgba(255, 255, 255, 0.6)',
        background: 'rgba(255, 255, 255, 0.45)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)', zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* 로고: public/logo.png (S·E·A 브랜드 로고) */}
          <div
            className="app-logo"
            style={{ width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.3s ease' }}
          >
            <img src="/logo.png" alt="로고" style={{ width: '44px', height: '44px', objectFit: 'contain' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h1 style={{
              margin: 0, fontSize: '21px', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.2,
              background: 'linear-gradient(135deg, #1e1b4b 0%, #333399 100%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent'
            }}>
              상지건축 AI Image Studio
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
              건축 실사화 · 이미지 편집 · 블렌딩을 한 곳에서
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* 이지 모드 / 프로 모드 토글 */}
          <div className="switch-container" onClick={() => setIsEasyMode(v => !v)} title="초보자를 위한 간편 설정 모드와 전문가용 정밀 설정 모드를 전환합니다">
            <span className={`switch-label ${isEasyMode ? 'active' : ''}`}>이지 모드</span>
            <div className={`switch-track ${isEasyMode ? '' : 'active'}`}>
              <div className="switch-thumb" />
            </div>
            <span className={`switch-label ${!isEasyMode ? 'active' : ''}`}>프로 모드</span>
          </div>

          <button
            onClick={loadStudioGallery}
            className="btn-ghost"
            style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 14px', fontSize: '13.5px', fontWeight: 600 }}
          >
            <RefreshCw size={14} /> 갤러리 새로고침
          </button>
        </div>
      </header>

      {/* 메인 레이아웃: 좌(대화/프롬프트 & 옵션) / 우(갤러리) */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', zIndex: 1 }}>
        {/* 좌측 */}
        <div style={{ width: 'clamp(380px, 55%, 650px)', flexShrink: 0, borderRight: '1px solid var(--border-color)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', overflow: 'hidden', background: 'rgba(220, 228, 242, 0.35)', backdropFilter: 'blur(6px)' }}>

          {/* 탭 스위처 */}
          <div className="glass-card" style={{ display: 'flex', gap: '4px', padding: '4px', borderRadius: '12px' }}>
            <button style={tabBtnStyle(studioTab === 'chat')} onClick={() => setStudioTab('chat')}>
              <MessageSquare size={14} /> 대화형
            </button>
            <button style={tabBtnStyle(studioTab === 'prompt')} onClick={() => setStudioTab('prompt')}>
              <Wand2 size={14} /> 프롬프트 입력
            </button>
            <button style={tabBtnStyle(studioTab === 'edit')} onClick={() => setStudioTab('edit')}>
              <ImageIcon size={14} /> 이미지 수정
            </button>
            <button style={tabBtnStyle(studioTab === 'blend')} onClick={() => setStudioTab('blend')}>
              <Layers size={14} /> 이미지 블렌딩
            </button>
          </div>

          {studioTab === 'chat' ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDraggingOverChat(true); }}
              onDragLeave={() => setIsDraggingOverChat(false)}
              onDrop={handleChatDrop}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'hidden',
                position: 'relative',
                outline: isDraggingOverChat ? '2px dashed var(--accent-cyan)' : 'none',
                outlineOffset: '-4px',
                borderRadius: '10px'
              }}
            >
              {isDraggingOverChat && (
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(6,182,212,0.1)', borderRadius: '10px', color: 'var(--accent-cyan)',
                  fontSize: '14.5px', fontWeight: 700, pointerEvents: 'none'
                }}>
                  여기에 이미지를 놓으면 참고 이미지로 첨부됩니다
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px', position: 'relative' }}>
                <button
                  onClick={() => setShowHistoryDrawer(v => !v)}
                  className="btn-ghost"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    fontSize: '12.5px', padding: '4px 10px', borderRadius: '8px',
                    color: showHistoryDrawer ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                    borderColor: showHistoryDrawer ? 'var(--accent-cyan)' : undefined
                  }}
                >
                  <History size={13} /> 이전 대화 목록 <span style={{ fontSize: '11px', opacity: 0.8 }}>({chatSessions.length})</span>
                </button>

                <button
                  onClick={startNewChat}
                  disabled={chatMessages.length === 0 && !chatInput && !chatAttachedImage}
                  title="현재 대화를 보존하고 새 대화를 시작합니다"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '12.5px', color: 'var(--accent-cyan)', fontWeight: 600,
                    padding: '2px 0', opacity: (chatMessages.length === 0 && !chatInput && !chatAttachedImage) ? 0.4 : 1
                  }}
                >
                  <Plus size={13} /> 새 대화
                </button>

                {/* 과거 대화 히스토리 팝업 드로어 */}
                {showHistoryDrawer && (
                  <div
                    className="glass-card"
                    style={{
                      position: 'absolute', top: '34px', left: 0, right: 0, zIndex: 50,
                      maxHeight: '260px', overflowY: 'auto', padding: '10px',
                      display: 'flex', flexDirection: 'column', gap: '6px',
                      background: 'rgba(15, 20, 32, 0.95)', border: '1px solid var(--border-color-strong)',
                      boxShadow: 'var(--shadow-pop)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '6px', borderBottom: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Clock size={12} /> 보존된 과거 대화 ({chatSessions.length}개)
                      </span>
                      <button onClick={() => setShowHistoryDrawer(false)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px' }}>
                        <X size={13} />
                      </button>
                    </div>

                    {chatSessions.length === 0 ? (
                      <div style={{ padding: '16px', textAlign: 'center', fontSize: '12.5px', color: 'var(--text-tertiary)' }}>
                        보존된 과거 대화 기록이 없습니다.
                      </div>
                    ) : (
                      chatSessions.map(session => (
                        <div
                          key={session.id}
                          onClick={() => loadChatSession(session)}
                          style={{
                            padding: '8px 10px', borderRadius: '8px',
                            background: currentSessionId === session.id ? 'rgba(51, 51, 153, 0.15)' : 'rgba(15, 23, 42, 0.04)',
                            border: `1px solid ${currentSessionId === session.id ? 'rgba(51, 51, 153, 0.35)' : 'var(--border-color)'}`,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            gap: '8px', transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {session.title || '새로운 대화'}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                              {new Date(session.updatedAt || Date.now()).toLocaleDateString()} · {session.messages?.length || 0}개 메시지
                            </div>
                          </div>
                          <button
                            onClick={(e) => deleteChatSession(session.id, e)}
                            title="이 대화 세션 삭제"
                            style={{
                              background: 'none', border: 'none', color: 'var(--text-tertiary)',
                              cursor: 'pointer', padding: '4px', borderRadius: '4px', flexShrink: 0
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-rose)'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', padding: '6px 4px' }}>
                {chatMessages.length === 0 && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                    gap: '10px', color: 'var(--text-secondary)', fontSize: '13.5px', lineHeight: 1.6,
                    padding: '32px 16px', margin: 'auto 0'
                  }}>
                    <MessageSquare size={30} style={{ opacity: 0.35 }} />
                    <span>
                      디자이너와 대화하며 원하는 이미지를 구체화해보세요.<br />
                      대화 자체는 이미지를 생성하지 않습니다 — 준비가 되면 아래<br />
                      <strong style={{ color: 'var(--text-primary)' }}>"이 대화로 생성 준비하기"</strong>를 눌러 정리된 프롬프트를 생성 탭으로 넘기세요.
                    </span>
                  </div>
                )}
                {chatMessages.map(m => (
                  <div key={m.id} style={{
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    padding: '11px 14px',
                    borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    fontSize: '14.5px',
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                    background: m.role === 'user' ? 'linear-gradient(135deg, rgba(51, 51, 153, 0.14), rgba(59,130,246,0.10))' : 'var(--bg-elevated)',
                    border: m.role === 'user' ? '1px solid rgba(51, 51, 153, 0.25)' : '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    boxShadow: 'var(--shadow-card)'
                  }}>
                    {m.image && (
                      <img src={m.image} alt="첨부 이미지" style={{ maxWidth: '100%', maxHeight: '160px', borderRadius: '8px', marginBottom: '8px', display: 'block' }} />
                    )}
                    {m.content}
                  </div>
                ))}
                {isChatting && (
                  <div style={{
                    alignSelf: 'flex-start',
                    maxWidth: '85%',
                    padding: '11px 14px',
                    borderRadius: '14px 14px 14px 4px',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)'
                  }}>
                    <RefreshCw className="animate-spin" size={13} /> 디자이너가 답변을 작성하는 중...
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <button
                onClick={compileConversationToPrompt}
                disabled={isCompiling || chatMessages.length === 0}
                className="btn-accent glow-purple"
                style={{
                  padding: '12px', fontSize: '14px', borderRadius: '10px'
                }}
              >
                <Compass size={15} /> {isCompiling ? '정리하는 중...' : '이 대화로 생성 준비하기'}
              </button>

              {chatAttachedImage && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
                  <img src={chatAttachedImage} alt="첨부 예정 이미지" style={{ height: '48px', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
                  <button
                    onClick={() => setChatAttachedImage(null)}
                    className="btn-ghost"
                    style={{ padding: '6px', display: 'flex' }}
                  >
                    <X size={14} />
                  </button>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>참고 이미지 첨부됨</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="file"
                  accept="image/*"
                  ref={chatFileInputRef}
                  onChange={handleChatImageSelect}
                  style={{ display: 'none' }}
                />
                <button
                  onClick={() => chatFileInputRef.current?.click()}
                  title="참고 이미지 첨부 (디자이너가 보고 반응합니다)"
                  className="btn-ghost"
                  style={{
                    width: '46px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  <Paperclip size={17} />
                </button>
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                  placeholder="디자이너에게 원하는 이미지를 설명해보세요..."
                  className="field-textarea"
                  style={{
                    flex: 1, minHeight: '50px', maxHeight: '110px', resize: 'vertical', fontSize: '14.5px'
                  }}
                />
                <button
                  onClick={sendChatMessage}
                  disabled={(!chatInput.trim() && !chatAttachedImage) || isChatting}
                  className="run-btn"
                  style={{ width: '46px', flexShrink: 0 }}
                >
                  {isChatting ? <RefreshCw className="animate-spin" size={17} /> : <Send size={17} />}
                </button>
              </div>
            </div>
          ) : studioTab === 'prompt' ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
              {/* 프롬프트 입력 영역 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '14.5px', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Wand2 size={15} /> 한글 프롬프트 입력
                  </span>
                  <button
                    onClick={suggestPromptImprovement}
                    disabled={!directPrompt.trim() || isSuggestingPrompt}
                    className="btn-accent"
                    style={{ fontSize: '13px', padding: '5px 11px' }}
                  >
                    {isSuggestingPrompt ? '다듬는 중...' : '✍️ 프롬프트 다듬기'}
                  </button>
                </div>

                <textarea
                  value={directPrompt}
                  onChange={(e) => { setDirectPrompt(e.target.value); setSkipAutoTune(false); }}
                  placeholder="원하는 이미지 설명을 한글로 편하게 적으세요... (예: 미래지향적인 스마트 오피스에서 일하는 개발자, 사이버펑크 네온 조명)"
                  className="field-textarea"
                  style={{
                    minHeight: '130px', resize: 'vertical', fontSize: '14.5px', lineHeight: 1.5
                  }}
                />

                {/* 참고 이미지 첨부 영역 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Image size={13} /> 참고 이미지 (최대 4개, 선택사항)
                  </span>
                  {promptAttachedImages.length > 0 ? (
                    <div
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={handlePromptImageDrop}
                      style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px', borderRadius: '6px', border: '1px solid rgba(51, 51, 153, 0.2)', background: 'rgba(51, 51, 153, 0.05)', transition: 'all 0.15s ease' }}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '8px' }}>
                        {promptAttachedImages.map((img, idx) => (
                          <div key={idx} style={{ position: 'relative' }}>
                            <img src={img} alt={`참고 이미지 ${idx + 1}`} style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '1px solid rgba(51, 51, 153, 0.3)' }} />
                            <button
                              onClick={() => removePromptAttachedImage(idx)}
                              className="btn-ghost"
                              style={{ position: 'absolute', top: '-6px', right: '-6px', padding: '4px', background: 'var(--accent-rose)', color: 'white', borderRadius: '50%', display: 'flex' }}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                      {promptAttachedImages.length < 4 && (
                        <button
                          onClick={() => promptFileInputRef.current?.click()}
                          style={{ padding: '8px', borderRadius: '6px', border: '1px dashed var(--border-color)', background: 'transparent', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)' }}
                        >
                          + 이미지 추가 ({promptAttachedImages.length}/4)
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => promptFileInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={handlePromptImageDrop}
                      style={{
                        padding: '20px', borderRadius: '8px', border: '2px dashed var(--border-color)',
                        background: 'transparent', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)',
                        transition: 'all 0.15s ease',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-cyan)'; e.currentTarget.style.color = 'var(--accent-cyan)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                    >
                      <Upload size={16} />
                      <span>이미지를 여기에 끌어 놓거나 클릭해서 선택 (최대 4개)</span>
                    </button>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    ref={promptFileInputRef}
                    onChange={handlePromptImageSelect}
                    style={{ display: 'none' }}
                  />
                </div>

                {promptSuggestion && (
                  <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(255, 94, 54, 0.1)', border: '1px solid rgba(255, 94, 54, 0.3)', fontSize: '13.5px' }}>
                    <div style={{ color: 'var(--accent-purple)', fontWeight: 700, marginBottom: '6px' }}>💡 추천 프롬프트</div>
                    <div style={{ color: 'var(--text-primary)', marginBottom: '10px', lineHeight: 1.5 }}>{promptSuggestion}</div>
                    <button
                      onClick={() => { setDirectPrompt(promptSuggestion); setPromptSuggestion(''); }}
                      style={{ fontSize: '12.5px', fontWeight: 700, padding: '5px 10px', borderRadius: '6px', background: 'var(--accent-purple)', color: '#1a1030', border: 'none', cursor: 'pointer' }}
                    >이 내용 적용</button>
                  </div>
                )}
              </div>

              {/* AI 추천 옵션 카드 */}
              {autoTuneResult && (
                <div style={{ padding: '14px', borderRadius: '12px', border: '1px solid rgba(51, 51, 153, 0.35)', background: 'rgba(51, 51, 153, 0.07)', fontSize: '13.5px' }}>
                  <div style={{ color: 'var(--accent-cyan)', fontWeight: 700, marginBottom: '8px' }}>
                    🤖 AI 자동 튜닝 결과 ({autoTuneResult.reasoning})
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>영문 정밀 프롬프트:</strong> {autoTuneResult.refined_prompt}
                  </div>
                </div>
              )}

              {/* 세부 생성 옵션 */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '18px' }}>
                
                {/* 1. 화면 비율 (이지/프로 모두 필수 노출이나, 드롭다운 대신 비주얼 버튼 격자로 변경) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label className="field-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>화면 비율</span>
                    <span style={{ color: 'var(--accent-cyan)', fontWeight: 700, fontSize: '12px' }}>
                      {imageOptions.aspect_ratios?.[imageAspectRatio]?.label || imageAspectRatio}
                    </span>
                  </label>
                  <div className="aspect-ratio-grid">
                    {Object.entries(imageOptions.aspect_ratios || {}).map(([id, def]) => (
                      <button
                        key={id}
                        onClick={() => setImageAspectRatio(id)}
                        className={`aspect-ratio-btn ${imageAspectRatio === id ? 'active' : ''}`}
                        title={def.label || id}
                      >
                        {renderAspectVisual(id)}
                        <span className="aspect-ratio-label">{id}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {!isEasyMode && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* ── [프로 모드] Fooocus Quality Mode 세부 설정 ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <span style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />
                      <span style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', gap: '7px' }}>
                        ⚙️ Pro Mode
                      </span>

                      {/* Fooocus Quality 설정 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px', background: 'rgba(255, 94, 54, 0.06)', borderRadius: '8px', border: '1px solid rgba(255, 94, 54, 0.2)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <label className="field-label">스타일</label>
                            <select value={styleOverride ?? 'fooocus_enhance'} onChange={(e) => setStyleOverride(e.target.value)} style={selectStyle}>
                              {['fooocus_enhance', 'sai-cinematic', 'sai-photographic', 'sai-anime', 'sai-pixel-art', 'sai-3d-model', 'sai-line-art', 'sai-watercolor', 'sai-sketch', 'sai-neon-punk', 'sai-fantasy-art', 'sai-comic-book', 'sai-origami', 'sai-ukiyo-e'].map(id => (
                                <option key={id} value={id}>{Object.entries(imageOptions.styles || {}).find(([k]) => k === id)?.[1]?.label || id}</option>
                              ))}
                            </select>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <label className="field-label">품질 레벨</label>
                            <select value={qualityPreset} onChange={(e) => setQualityPreset(e.target.value)} style={selectStyle}>
                              <option value="speed">Speed (빠름)</option>
                              <option value="quality">Quality (권장)</option>
                              <option value="extreme_quality">Extreme (느림)</option>
                            </select>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
                          <input
                            type="checkbox"
                            checked={promptEnhance}
                            onChange={(e) => setPromptEnhance(e.target.checked)}
                            id="prompt-enhance-check"
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                          <label htmlFor="prompt-enhance-check" style={{ cursor: 'pointer', fontSize: '12.5px', color: 'var(--text-primary)' }}>
                            📝 프롬프트 자동 확장 (GPT-2)
                          </label>
                        </div>

                        <button
                          onClick={() => setShowAdvancedQualitySettings(v => !v)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '6px', background: 'none',
                            border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                            color: 'var(--text-secondary)', padding: '4px 0'
                          }}
                        >
                          {showAdvancedQualitySettings ? '▼' : '▶'} Advanced (Sharpness / ADM)
                        </button>

                        {showAdvancedQualitySettings && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                              <label className="field-label" style={{ fontSize: '11.5px' }}>Sampling Sharpness</label>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                {[0.0, 1.0, 2.0].map(val => (
                                  <button
                                    key={val}
                                    onClick={() => setSharpness(val)}
                                    style={{
                                      flex: 1, padding: '5px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                                      background: sharpness === val ? 'var(--accent-cyan)' : 'rgba(15, 23, 42, 0.05)',
                                      border: `1px solid ${sharpness === val ? 'var(--accent-cyan)' : 'rgba(15, 23, 42, 0.10)'}`,
                                      color: sharpness === val ? '#1a1030' : 'var(--text-secondary)',
                                      cursor: 'pointer'
                                    }}
                                  >{val === 0.0 ? 'OFF' : val.toFixed(1)}</button>
                                ))}
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input
                                type="checkbox"
                                checked={adm_guidance}
                                onChange={(e) => setAdm_guidance(e.target.checked)}
                                id="adm-guidance-check"
                                style={{ cursor: 'pointer', width: '14px', height: '14px' }}
                              />
                              <label htmlFor="adm-guidance-check" style={{ cursor: 'pointer', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                                ADM Guidance
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {!isEasyMode && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: 0 }}>
                      <label className="field-label">체크포인트 모델</label>
                      <select
                        value={checkpointOverride ?? ''}
                        onChange={(e) => setCheckpointOverride(e.target.value || null)}
                        style={{ ...selectStyle, width: '100%', minWidth: 0, textOverflow: 'ellipsis' }}
                      >
                        <option value="">🤖 AI 자동(기본값)</option>
                        {availableCheckpoints.map(c => (
                          <option key={c.name} value={c.name}>{c.name.replace(/\.safetensors$/, '')}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label className="field-label">생성 수량</label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {[1, 2, 4].map(num => (
                          <button
                            key={num}
                            onClick={() => setImageBatchCount(num)}
                            style={{
                              flex: 1, padding: '5px 0', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                              border: `1px solid ${imageBatchCount === num ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
                              background: imageBatchCount === num ? 'rgba(51, 51, 153, 0.16)' : 'transparent',
                              color: imageBatchCount === num ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                              transition: 'all 0.15s ease'
                            }}
                          >{num}장</button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {isEasyMode && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label className="field-label">생성 수량</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {[1, 2, 4].map(num => (
                        <button
                          key={num}
                          onClick={() => setImageBatchCount(num)}
                          style={{
                            flex: 1, padding: '5px 0', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                            border: `1px solid ${imageBatchCount === num ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
                            background: imageBatchCount === num ? 'rgba(51, 51, 153, 0.16)' : 'transparent',
                            color: imageBatchCount === num ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                            transition: 'all 0.15s ease'
                          }}
                        >{num}장</button>
                      ))}
                    </div>
                  </div>
                )}

                {!isEasyMode && (
                <div>
                  <button
                        onClick={() => setShowSeedControl(v => !v)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px', background: 'none',
                          border: 'none', cursor: 'pointer', fontSize: '12.5px', fontWeight: 600,
                          color: 'var(--text-secondary)', padding: '4px 0'
                        }}
                      >
                        {showSeedControl ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        시드 고급 설정
                        {seedOverride && <span style={{ color: 'var(--accent-cyan)', fontSize: '11px' }}>({seedOverride})</span>}
                  </button>
                  {showSeedControl && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '6px' }}>
                      <label className="field-label" style={{ display: 'block', lineHeight: 1.4 }}>
                        시드 <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(비워두면 랜덤, 같은 값이면 결과 재현)</span>
                      </label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="number"
                          value={seedOverride}
                          onChange={(e) => setSeedOverride(e.target.value)}
                          placeholder="랜덤"
                          style={{ ...selectStyle, flex: 1 }}
                        />
                        {lastSeedUsed !== null && (
                          <button
                            onClick={() => setSeedOverride(String(lastSeedUsed))}
                            title="방금 생성에 실제로 쓰인 시드를 그대로 채우기"
                            className="btn-ghost"
                            style={{ fontSize: '12.5px', padding: '0 12px', whiteSpace: 'nowrap' }}
                          >
                            마지막 시드
                          </button>
                        )}
                        {seedOverride && (
                          <button
                            onClick={() => setSeedOverride('')}
                            title="시드 고정 해제 (랜덤으로 되돌리기)"
                            className="btn-ghost"
                            style={{ fontSize: '12.5px', padding: '0 12px', whiteSpace: 'nowrap' }}
                          >
                            초기화
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                )}
              </div>

              {/* 생성 버튼 — 오직 여기서만 실제 이미지 생성이 일어난다 */}
              <button
                onClick={handleGenerate}
                disabled={!directPrompt.trim() || isGenerating}
                className="run-btn glow-cyan"
                style={{ padding: '14px', fontSize: '15px', borderRadius: '10px', position: 'relative', overflow: 'hidden' }}
              >
                {(isGenerating || isUpscaling) && (
                  <div
                    style={{
                      position: 'absolute', top: 0, left: 0, bottom: 0,
                      width: `${generationProgress.percent || 5}%`,
                      background: 'rgba(51, 51, 153, 0.25)',
                      transition: 'width 0.3s ease'
                    }}
                  />
                )}
                {isGenerating ? (
                  <div><RefreshCw className="animate-spin" size={17} style={{ marginRight: '8px', display: 'inline-block' }} /> {isAutoTuning ? 'AI 옵션 튜닝 중...' : `ComfyUI 렌더링 중...`}</div>
                ) : isUpscaling ? (
                  <div><RefreshCw className="animate-spin" size={17} style={{ marginRight: '8px', display: 'inline-block' }} /> 4K 초고화질 업스케일 중...</div>
                ) : (
                  <div><Sparkles size={17} style={{ marginRight: '8px', display: 'inline-block' }} /> 이미지 바로 생성하기 ({imageBatchCount}장)</div>
                )}
              </button>
            </div>
          ) : studioTab === 'edit' ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <ImageIcon size={13} /> 이미지 수정
              </span>

              {/* 이미지 수정 기능 선택 탭 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                <button onClick={() => setEditMode('architecture')} style={{ padding: '12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', border: editMode === 'architecture' ? '2px solid var(--accent-cyan)' : '1px solid var(--border-color)', background: editMode === 'architecture' ? 'rgba(51, 51, 153, 0.15)' : 'rgba(255, 255, 255, 0.6)', color: editMode === 'architecture' ? 'var(--accent-cyan)' : 'var(--text-secondary)', transition: 'all 0.2s ease', whiteSpace: 'nowrap' }}>
                  🏗️ 건축물
                </button>
                <button onClick={() => { setEditMode('inpaint'); setInpaintSubMode('inpaint'); }} style={{ padding: '12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', border: (editMode === 'inpaint' && inpaintSubMode === 'inpaint') ? '2px solid var(--accent-cyan)' : '1px solid var(--border-color)', background: (editMode === 'inpaint' && inpaintSubMode === 'inpaint') ? 'rgba(51, 51, 153, 0.15)' : 'rgba(255, 255, 255, 0.6)', color: (editMode === 'inpaint' && inpaintSubMode === 'inpaint') ? 'var(--accent-cyan)' : 'var(--text-secondary)', transition: 'all 0.2s ease', whiteSpace: 'nowrap' }}>
                  🎨 부분 수정
                </button>
                <button onClick={() => { setEditMode('inpaint'); setInpaintSubMode('outpaint'); }} style={{ padding: '12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', border: (editMode === 'inpaint' && inpaintSubMode === 'outpaint') ? '2px solid var(--accent-cyan)' : '1px solid var(--border-color)', background: (editMode === 'inpaint' && inpaintSubMode === 'outpaint') ? 'rgba(51, 51, 153, 0.15)' : 'rgba(255, 255, 255, 0.6)', color: (editMode === 'inpaint' && inpaintSubMode === 'outpaint') ? 'var(--accent-cyan)' : 'var(--text-secondary)', transition: 'all 0.2s ease', whiteSpace: 'nowrap' }}>
                  📐 영역 확장
                </button>
                <button onClick={() => setEditMode('nightBatch')} style={{ padding: '12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', border: editMode === 'nightBatch' ? '2px solid var(--accent-cyan)' : '1px solid var(--border-color)', background: editMode === 'nightBatch' ? 'rgba(51, 51, 153, 0.15)' : 'rgba(255, 255, 255, 0.6)', color: editMode === 'nightBatch' ? 'var(--accent-cyan)' : 'var(--text-secondary)', transition: 'all 0.2s ease', whiteSpace: 'nowrap' }}>
                  🌙 퇴근 모드
                </button>
              </div>

              {/* 기존 이미지 선택 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ImageIcon size={12} /> 기존 이미지 선택 (선택사항)
                </span>
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingOverEdit(true); }}
                  onDragLeave={() => setIsDraggingOverEdit(false)}
                  onDrop={(e) => {
                    e.preventDefault(); e.stopPropagation(); setIsDraggingOverEdit(false);
                    if (e.dataTransfer.files?.[0]) {
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        if (editMode === 'architecture' || editMode === 'nightBatch') setArchImage(evt.target.result);
                        else if (editMode === 'inpaint') setInpaintEditImage(evt.target.result);
                        else if (editMode === 'outpaint') setOutpaintEditImage(evt.target.result);
                      };
                      reader.readAsDataURL(e.dataTransfer.files[0]);
                    }
                  }}
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', borderRadius: '8px',
                    border: isDraggingOverEdit ? '2px solid var(--accent-cyan)' : '1px dashed var(--border-color)',
                    background: isDraggingOverEdit ? 'rgba(51, 51, 153, 0.1)' : 'rgba(255, 255, 255, 0.6)',
                    alignItems: 'center', justifyContent: 'center', minHeight: '100px', cursor: 'pointer', transition: 'all 0.15s ease'
                  }}
                >
                  {(editMode === 'architecture' && archImage) || (editMode === 'nightBatch' && archImage) || (editMode === 'inpaint' && inpaintEditImage) || (editMode === 'outpaint' && outpaintEditImage) ? (
                    <>
                      <img
                        ref={inpaintImgElRef}
                        src={editMode === 'architecture' || editMode === 'nightBatch' ? archImage : editMode === 'inpaint' ? inpaintEditImage : outpaintEditImage}
                        alt="기존 이미지"
                        style={{ width: '100%', maxHeight: '100px', objectFit: 'contain', borderRadius: '6px' }}
                        onLoad={() => editMode === 'inpaint' && initInpaintMaskCanvas()}
                      />
                      <button
                        onClick={() => {
                          if (editMode === 'architecture' || editMode === 'nightBatch') setArchImage(null);
                          else if (editMode === 'inpaint') setInpaintEditImage(null);
                          else if (editMode === 'outpaint') setOutpaintEditImage(null);
                        }}
                        style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}
                      >
                        변경
                      </button>
                    </>
                  ) : (
                    <>
                      <ImageIcon size={24} style={{ opacity: 0.3 }} />
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>이미지 드래그 또는 클릭</span>
                    </>
                  )}
                </div>
              </div>

              {/* 모드별 UI 분기 */}
              {editMode === 'architecture' ? (
                // ═══════════════════════════════════════════════════════════
                // 🏗️ 건축물 스타일 모드
                // ═══════════════════════════════════════════════════════════
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>SketchUp 이미지를 다양한 건축 스타일로 실사화 생성합니다.</p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>스타일 선택</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {Object.entries(ARCH_STYLE_PRESETS).map(([key, { label, emoji }]) => (
                        <button
                          key={key}
                          onClick={() => setArchSelectedStyles(archSelectedStyles.includes(key) ? archSelectedStyles.filter(s => s !== key) : [...archSelectedStyles, key])}
                          style={{
                            padding: '8px', borderRadius: '8px', border: '2px solid' + (archSelectedStyles.includes(key) ? ' var(--accent-cyan)' : ' var(--border-color)'),
                            background: archSelectedStyles.includes(key) ? 'rgba(51, 51, 153, 0.1)' : 'rgba(255, 255, 255, 0.6)',
                            color: archSelectedStyles.includes(key) ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                            cursor: 'pointer', fontSize: '12px', fontWeight: 600, transition: 'all 0.15s ease'
                          }}
                        >
                          {emoji} {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>스타일 당 생성 장수</span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                      {[1, 2, 3, 4].map(num => (
                        <button
                          key={num}
                          onClick={() => setArchVariationsPerStyle(num)}
                          style={{
                            padding: '10px', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                            border: archVariationsPerStyle === num ? '2px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                            background: archVariationsPerStyle === num ? 'rgba(51, 51, 153, 0.15)' : 'rgba(255, 255, 255, 0.6)',
                            color: archVariationsPerStyle === num ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {num}장
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>형태 보존율 (ControlNet)</span>
                      <span style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>{archKeepStructure}%</span>
                    </span>
                    <input type="range" min="0" max="100" value={archKeepStructure} onChange={(e) => setArchKeepStructure(parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>건축 스타일 추가 설명</span>
                    <textarea
                      value={archPrompt}
                      onChange={(e) => setArchPrompt(e.target.value)}
                      placeholder="건축 스타일 추가 설명 (예: 친환경 소재 강조, 현대적 파사드 등)..."
                      style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(255, 255, 255, 0.6)', color: 'var(--text-primary)', fontSize: '12px', minHeight: '60px', resize: 'vertical' }}
                    />
                    <button
                      onClick={refineArchPrompt}
                      disabled={!archPrompt.trim() || isArchPromptRefining}
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: (!archPrompt.trim() || isArchPromptRefining) ? 'rgba(148, 163, 184, 0.22)' : 'rgba(51, 51, 153, 0.15)', color: (!archPrompt.trim() || isArchPromptRefining) ? 'var(--text-tertiary)' : 'var(--accent-cyan)', fontSize: '12px', fontWeight: 600, cursor: (!archPrompt.trim() || isArchPromptRefining) ? 'not-allowed' : 'pointer', transition: 'all 0.15s ease', opacity: (!archPrompt.trim() || isArchPromptRefining) ? 0.5 : 1 }}
                    >
                      {isArchPromptRefining ? '다듬는 중...' : '✨ 프롬프트 다듬기'}
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      if (!archImage && promptAttachedImages.length === 0) {
                        alert('⚠️ 이미지를 먼저 업로드해주세요!');
                        return;
                      }
                      handleArchGenerate();
                    }}
                    disabled={archBatchProgress.total > 0}
                    style={{
                      padding: '10px', borderRadius: '8px',
                      background: archBatchProgress.total > 0 ? 'var(--border-color)' : 'var(--accent-cyan)',
                      color: 'white', border: 'none', cursor: archBatchProgress.total > 0 ? 'not-allowed' : 'pointer',
                      fontWeight: 600, fontSize: '13px', opacity: archBatchProgress.total > 0 ? 0.5 : 1
                    }}
                  >
                    {archBatchProgress.total > 0 ? `생성 중... (${archBatchProgress.current}/${archBatchProgress.total})` : '스타일로 생성하기'}
                  </button>
                </div>
              ) : editMode === 'nightBatch' ? (
                // ═══════════════════════════════════════════════════════════
                // 🌙 퇴근 모드 (야간 대량 배치 생성)
                // ═══════════════════════════════════════════════════════════
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    매스 모델 하나로 스타일·재질·형태·조명을 매번 무작위로 조합해 서로 다른 디자인 시안을 대량으로 뽑습니다.
                    시간이 오래 걸려도 괜찮다면(퇴근 전 실행 → 다음날 아침 확인) 목표 장수를 크게 잡으세요.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>다양성 범위 (포함할 스타일)</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {Object.entries(ARCH_STYLE_PRESETS).map(([key, { label, emoji }]) => (
                        <button
                          key={key}
                          onClick={() => setNightBatchSelectedStyles(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key])}
                          style={{
                            padding: '8px', borderRadius: '8px', border: '2px solid' + (nightBatchSelectedStyles.includes(key) ? ' var(--accent-cyan)' : ' var(--border-color)'),
                            background: nightBatchSelectedStyles.includes(key) ? 'rgba(51, 51, 153, 0.1)' : 'rgba(255, 255, 255, 0.6)',
                            color: nightBatchSelectedStyles.includes(key) ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                            cursor: 'pointer', fontSize: '12px', fontWeight: 600, transition: 'all 0.15s ease'
                          }}
                        >
                          {emoji} {label}
                        </button>
                      ))}
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>아무것도 선택하지 않으면 전체 스타일에서 무작위로 뽑습니다.</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>목표 장수</span>
                      <span style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>{nightBatchCount}장 (예상 소요 약 {Math.round(nightBatchCount * 30 / 60)}분)</span>
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                      {[10, 20, 50, 100].map(num => (
                        <button
                          key={num}
                          onClick={() => setNightBatchCount(num)}
                          disabled={nightBatchRunning}
                          style={{
                            padding: '10px', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: nightBatchRunning ? 'not-allowed' : 'pointer',
                            border: nightBatchCount === num ? '2px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                            background: nightBatchCount === num ? 'rgba(51, 51, 153, 0.15)' : 'rgba(255, 255, 255, 0.6)',
                            color: nightBatchCount === num ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                            transition: 'all 0.15s ease', opacity: nightBatchRunning ? 0.5 : 1
                          }}
                        >
                          {num}장
                        </button>
                      ))}
                    </div>
                    <input
                      type="number" min="1" max="300" value={nightBatchCount}
                      onChange={(e) => setNightBatchCount(Math.max(1, Math.min(300, parseInt(e.target.value) || 1)))}
                      disabled={nightBatchRunning}
                      style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255, 255, 255, 0.6)', color: 'var(--text-primary)', fontSize: '12px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>형태 보존율 (ControlNet)</span>
                      <span style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>{nightBatchKeepStructure}%</span>
                    </span>
                    <input type="range" min="0" max="100" value={nightBatchKeepStructure} onChange={(e) => setNightBatchKeepStructure(parseInt(e.target.value))} disabled={nightBatchRunning} style={{ width: '100%', accentColor: 'var(--accent-cyan)', cursor: nightBatchRunning ? 'not-allowed' : 'pointer' }} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>공통 조건 (선택사항)</span>
                    <textarea
                      value={nightBatchPrompt}
                      onChange={(e) => setNightBatchPrompt(e.target.value)}
                      disabled={nightBatchRunning}
                      placeholder="모든 시안에 공통으로 반영할 조건 (예: 주거용 단독주택, 친환경 소재 선호 등)..."
                      style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(255, 255, 255, 0.6)', color: 'var(--text-primary)', fontSize: '12px', minHeight: '60px', resize: 'vertical' }}
                    />
                  </div>

                  {nightBatchRunning ? (
                    <>
                      <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'rgba(15, 23, 42, 0.08)', overflow: 'hidden' }}>
                        <div style={{
                          width: `${nightBatchProgress.total > 0 ? (nightBatchProgress.current / nightBatchProgress.total) * 100 : 0}%`,
                          height: '100%', background: 'var(--accent-cyan)', transition: 'width 0.3s ease'
                        }} />
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                        {nightBatchProgress.current} / {nightBatchProgress.total}장 생성 중{nightBatchProgress.failed > 0 ? ` (실패 ${nightBatchProgress.failed}장)` : ''} — 이 탭을 닫지 마세요
                      </span>
                      <button
                        onClick={stopNightBatchGenerate}
                        style={{ padding: '10px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--accent-rose)', color: 'var(--accent-rose)', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                      >
                        중단하기
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        if (!archImage && promptAttachedImages.length === 0) {
                          alert('⚠️ 이미지를 먼저 업로드해주세요!');
                          return;
                        }
                        handleNightBatchGenerate();
                      }}
                      style={{
                        padding: '10px', borderRadius: '8px',
                        background: 'var(--accent-cyan)',
                        color: 'white', border: 'none', cursor: 'pointer',
                        fontWeight: 600, fontSize: '13px'
                      }}
                    >
                      🌙 퇴근 모드 시작 ({nightBatchCount}장)
                    </button>
                  )}
                </div>
              ) : editMode === 'inpaint' && inpaintSubMode === 'inpaint' ? (
                // ═══════════════════════════════════════════════════════════
                // 🎨 부분 수정 (Inpaint) 모드
                // ═══════════════════════════════════════════════════════════
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>이미지의 수정할 부분에 브러시로 표시하고, 수정할 내용을 입력하세요.</p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Paintbrush size={12} /> 브러시로 선택
                      </span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-cyan)' }}>크기: {brushSize}px</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="100"
                      value={brushSize}
                      onChange={(e) => setBrushSize(parseInt(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
                    />
                  </div>

                  <div
                    style={{
                      flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', borderRadius: '8px',
                      border: '2px solid var(--border-color)',
                      background: 'rgba(255, 255, 255, 0.6)',
                      minHeight: '300px'
                    }}
                  >
                    {inpaintEditImage ? (
                      <>
                        <canvas
                          ref={inpaintCanvasRef}
                          style={{ width: '100%', flex: 1, border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'crosshair', display: 'block', maxHeight: '400px' }}
                          onMouseDown={(e) => {
                            isPaintingMaskRef.current = true;
                            const canvas = inpaintCanvasRef.current;
                            const rect = canvas.getBoundingClientRect();
                            const x = (e.clientX - rect.left) * (canvas.width / rect.width);
                            const y = (e.clientY - rect.top) * (canvas.height / rect.height);
                            const ctx = canvas.getContext('2d');
                            ctx.fillStyle = '#ff0000';
                            ctx.beginPath();
                            ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
                            ctx.fill();
                          }}
                          onMouseMove={(e) => {
                            if (!isPaintingMaskRef.current) return;
                            const canvas = inpaintCanvasRef.current;
                            const rect = canvas.getBoundingClientRect();
                            const x = (e.clientX - rect.left) * (canvas.width / rect.width);
                            const y = (e.clientY - rect.top) * (canvas.height / rect.height);
                            const ctx = canvas.getContext('2d');
                            ctx.fillStyle = '#ff0000';
                            ctx.beginPath();
                            ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
                            ctx.fill();
                          }}
                          onMouseUp={() => { isPaintingMaskRef.current = false; }}
                          onMouseLeave={() => { isPaintingMaskRef.current = false; }}
                        />
                        <button
                          onClick={initInpaintMaskCanvas}
                          style={{ padding: '8px 12px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(51, 51, 153, 0.1)', cursor: 'pointer', color: 'var(--accent-cyan)', fontWeight: 600, transition: 'all 0.15s ease' }}
                        >
                          ↻ 초기화
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>위에서 이미지를 선택하세요</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>수정 설명</label>
                    <textarea
                      value={inpaintPrompt}
                      onChange={(e) => setInpaintPrompt(e.target.value)}
                      placeholder="수정할 부분에 대한 설명 (예: 현대적인 창으로 변경, 벽의 색상을 파란색으로 등)..."
                      style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(255, 255, 255, 0.6)', color: 'var(--text-primary)', fontSize: '12px', minHeight: '60px', resize: 'vertical' }}
                    />
                    <button
                      onClick={refineInpaintPrompt}
                      disabled={!inpaintPrompt.trim() || isInpaintPromptRefining}
                      style={{
                        padding: '8px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                        border: '1px solid var(--border-color)', background: 'rgba(51, 51, 153, 0.1)', color: 'var(--accent-cyan)',
                        cursor: (!inpaintPrompt.trim() || isInpaintPromptRefining) ? 'not-allowed' : 'pointer',
                        opacity: (!inpaintPrompt.trim() || isInpaintPromptRefining) ? 0.5 : 1,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {isInpaintPromptRefining ? '✨ 다듬는 중...' : '✨ 프롬프트 다듬기'}
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      if (!inpaintEditImage || !inpaintPrompt.trim() || isInpainting) return;
                      handleInpaintGenerateWithImage(inpaintEditImage, 'inpaint');
                    }}
                    disabled={isInpainting || !inpaintEditImage || !inpaintPrompt.trim()}
                    style={{
                      padding: '10px', borderRadius: '8px',
                      background: (!inpaintEditImage || !inpaintPrompt.trim()) ? 'var(--border-color)' : 'var(--accent-cyan)',
                      color: 'white', border: 'none', cursor: (!inpaintEditImage || !inpaintPrompt.trim() || isInpainting) ? 'not-allowed' : 'pointer',
                      fontWeight: 600, fontSize: '13px', opacity: (!inpaintEditImage || !inpaintPrompt.trim()) ? 0.5 : 1
                    }}
                  >
                    {isInpainting ? '수정 중...' : '부분 수정하기'}
                  </button>
                </div>
              ) : editMode === 'inpaint' && inpaintSubMode === 'outpaint' ? (
                // ═══════════════════════════════════════════════════════════
                // 📐 영역 확장 (Outpaint) 모드
                // ═══════════════════════════════════════════════════════════
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>이미지의 테두리를 확장하여 더 큰 구성을 생성합니다.</p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>확장 방향 선택</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <button
                        onClick={() => setOutpaintDirections({ ...outpaintDirections, top: !outpaintDirections.top })}
                        style={{
                          padding: '12px', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                          border: outpaintDirections.top ? '2px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                          background: outpaintDirections.top ? 'rgba(51, 51, 153, 0.1)' : 'rgba(255, 255, 255, 0.6)',
                          color: outpaintDirections.top ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                          gridColumn: '1 / -1', transition: 'all 0.15s ease'
                        }}
                      >
                        ⬆️ 위로 확장
                      </button>
                      <button
                        onClick={() => setOutpaintDirections({ ...outpaintDirections, left: !outpaintDirections.left })}
                        style={{
                          padding: '12px', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                          border: outpaintDirections.left ? '2px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                          background: outpaintDirections.left ? 'rgba(51, 51, 153, 0.1)' : 'rgba(255, 255, 255, 0.6)',
                          color: outpaintDirections.left ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        ⬅️ 왼쪽
                      </button>
                      <button
                        onClick={() => setOutpaintDirections({ ...outpaintDirections, right: !outpaintDirections.right })}
                        style={{
                          padding: '12px', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                          border: outpaintDirections.right ? '2px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                          background: outpaintDirections.right ? 'rgba(51, 51, 153, 0.1)' : 'rgba(255, 255, 255, 0.6)',
                          color: outpaintDirections.right ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        ➡️ 오른쪽
                      </button>
                      <button
                        onClick={() => setOutpaintDirections({ ...outpaintDirections, bottom: !outpaintDirections.bottom })}
                        style={{
                          padding: '12px', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                          border: outpaintDirections.bottom ? '2px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                          background: outpaintDirections.bottom ? 'rgba(51, 51, 153, 0.1)' : 'rgba(255, 255, 255, 0.6)',
                          color: outpaintDirections.bottom ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                          gridColumn: '1 / -1', transition: 'all 0.15s ease'
                        }}
                      >
                        ⬇️ 아래로 확장
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>확장 픽셀</span>
                      <span style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>{outpaintAmount}px</span>
                    </span>
                    <input type="range" min="64" max="512" step="64" value={outpaintAmount} onChange={(e) => setOutpaintAmount(parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>확장 설명 (선택사항)</label>
                    <textarea
                      value={inpaintPrompt}
                      onChange={(e) => setInpaintPrompt(e.target.value)}
                      placeholder="확장된 부분의 스타일 설명 (예: 같은 건축 스타일 유지, 자연 경관 추가 등)..."
                      style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(255, 255, 255, 0.6)', color: 'var(--text-primary)', fontSize: '12px', minHeight: '60px', resize: 'vertical' }}
                    />
                    {inpaintPrompt.trim() && (
                      <button
                        onClick={refineInpaintPrompt}
                        disabled={!inpaintPrompt.trim() || isInpaintPromptRefining}
                        style={{
                          padding: '8px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                          border: '1px solid var(--border-color)', background: 'rgba(51, 51, 153, 0.1)', color: 'var(--accent-cyan)',
                          cursor: (!inpaintPrompt.trim() || isInpaintPromptRefining) ? 'not-allowed' : 'pointer',
                          opacity: (!inpaintPrompt.trim() || isInpaintPromptRefining) ? 0.5 : 1,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {isInpaintPromptRefining ? '✨ 다듬는 중...' : '✨ 프롬프트 다듬기'}
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      if (!outpaintEditImage || !Object.values(outpaintDirections).some(v => v) || isInpainting) return;
                      handleInpaintGenerateWithImage(outpaintEditImage, 'outpaint');
                    }}
                    disabled={isInpainting || !outpaintEditImage || !Object.values(outpaintDirections).some(v => v)}
                    style={{
                      padding: '10px', borderRadius: '8px',
                      background: (!outpaintEditImage || !Object.values(outpaintDirections).some(v => v)) ? 'var(--border-color)' : 'var(--accent-cyan)',
                      color: 'white', border: 'none', cursor: (!outpaintEditImage || !Object.values(outpaintDirections).some(v => v) || isInpainting) ? 'not-allowed' : 'pointer',
                      fontWeight: 600, fontSize: '13px', opacity: (!outpaintEditImage || !Object.values(outpaintDirections).some(v => v)) ? 0.5 : 1
                    }}
                  >
                    {isInpainting ? '확장 중...' : '영역 확장하기'}
                  </button>
                </div>
              ) : null}
            </div>
          ) : studioTab === 'blend' ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <ImageIcon size={13} /> 이미지 블렌딩
              </span>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>기존 이미지의 형태를 유지하면서, 참조 이미지 1~4장의 재질·분위기·색감을 입힙니다 (구조 유지 + 참조 이미지 방식).</p>

              {/* 이미지 선택 영역: 가로 배치 */}
              <div style={{ display: 'flex', gap: '12px' }}>
                {/* 기존 이미지 선택 */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ImageIcon size={12} /> 기존 이미지 (구조 기준)
                  </span>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingOverBlend(true); }}
                    onDragLeave={() => setIsDraggingOverBlend(false)}
                    onDrop={(e) => {
                      e.preventDefault(); e.stopPropagation(); setIsDraggingOverBlend(false);
                      if (e.dataTransfer.files?.[0]) {
                        const reader = new FileReader();
                        reader.onload = (evt) => setBlendBaseImage(evt.target.result);
                        reader.readAsDataURL(e.dataTransfer.files[0]);
                      } else if (e.dataTransfer.getData('text/plain')) {
                        const imageUrl = e.dataTransfer.getData('text/plain');
                        fetch(imageUrl)
                          .then(res => res.blob())
                          .then(blob => {
                            const reader = new FileReader();
                            reader.onload = (evt) => setBlendBaseImage(evt.target.result);
                            reader.readAsDataURL(blob);
                          })
                          .catch(err => console.error('이미지 로드 실패:', err));
                      }
                    }}
                    onClick={() => blendBaseInputRef.current?.click()}
                    style={{
                      flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', borderRadius: '8px',
                      border: isDraggingOverBlend ? '2px solid var(--accent-cyan)' : '1px dashed var(--border-color)',
                      background: isDraggingOverBlend ? 'rgba(51, 51, 153, 0.1)' : 'rgba(255, 255, 255, 0.6)',
                      alignItems: 'center', justifyContent: 'center', minHeight: '120px', cursor: 'pointer', transition: 'all 0.15s ease'
                    }}
                  >
                    {blendBaseImage ? (
                      <>
                        <img src={blendBaseImage} alt="기존 이미지" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '6px', maxHeight: '100px' }} />
                        <button onClick={() => setBlendBaseImage(null)} style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                          변경
                        </button>
                      </>
                    ) : (
                      <>
                        <ImageIcon size={28} style={{ opacity: 0.3 }} />
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>드래그 또는 클릭</span>
                      </>
                    )}
                  </div>
                  <input
                    ref={blendBaseInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        const reader = new FileReader();
                        reader.onload = (evt) => setBlendBaseImage(evt.target.result);
                        reader.readAsDataURL(e.target.files[0]);
                      }
                    }}
                  />
                </div>

                {/* 이지 모드: 참조 이미지 선택 (최대 4장, 전부 재질/분위기용) */}
                {isEasyMode && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <ImageIcon size={12} /> 참조 이미지 ({blendReferenceImages.length}/4)
                    </span>
                    {blendReferenceImages.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                        {blendReferenceImages.map((img, idx) => (
                          <div key={idx} style={{ position: 'relative', aspectRatio: '1', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                            <img src={img} alt={`참조 ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <button
                              onClick={() => setBlendReferenceImages(prev => prev.filter((_, i) => i !== idx))}
                              style={{ position: 'absolute', top: '2px', right: '2px', width: '18px', height: '18px', borderRadius: '50%', border: 'none', background: 'rgba(13,13,38,0.75)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', lineHeight: 1 }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {blendReferenceImages.length < 4 && (
                      <div
                        onDragOver={(e) => { e.preventDefault(); setIsDraggingOverBlendRef(true); }}
                        onDragLeave={() => setIsDraggingOverBlendRef(false)}
                        onDrop={(e) => {
                          e.preventDefault(); e.stopPropagation(); setIsDraggingOverBlendRef(false);
                          if (e.dataTransfer.files?.[0]) {
                            const reader = new FileReader();
                            reader.onload = (evt) => setBlendReferenceImages(prev => [...prev, evt.target.result].slice(0, 4));
                            reader.readAsDataURL(e.dataTransfer.files[0]);
                          } else if (e.dataTransfer.getData('text/plain')) {
                            const imageUrl = e.dataTransfer.getData('text/plain');
                            fetch(imageUrl)
                              .then(res => res.blob())
                              .then(blob => {
                                const reader = new FileReader();
                                reader.onload = (evt) => setBlendReferenceImages(prev => [...prev, evt.target.result].slice(0, 4));
                                reader.readAsDataURL(blob);
                              })
                              .catch(err => console.error('이미지 로드 실패:', err));
                          }
                        }}
                        onClick={() => blendRefInputRef.current?.click()}
                        style={{
                          flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', borderRadius: '8px',
                          border: isDraggingOverBlendRef ? '2px solid var(--accent-cyan)' : '1px dashed var(--border-color)',
                          background: isDraggingOverBlendRef ? 'rgba(51, 51, 153, 0.1)' : 'rgba(255, 255, 255, 0.6)',
                          alignItems: 'center', justifyContent: 'center', minHeight: '80px', cursor: 'pointer', transition: 'all 0.15s ease'
                        }}
                      >
                        <ImageIcon size={24} style={{ opacity: 0.3 }} />
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>드래그 또는 클릭으로 추가</span>
                      </div>
                    )}
                    <input
                      ref={blendRefInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []).slice(0, 4 - blendReferenceImages.length);
                        files.forEach(file => {
                          const reader = new FileReader();
                          reader.onload = (evt) => setBlendReferenceImages(prev => [...prev, evt.target.result].slice(0, 4));
                          reader.readAsDataURL(file);
                        });
                        e.target.value = '';
                      }}
                    />
                  </div>
                )}
              </div>

              {/* 이지 모드: 구조 유지 켜기/끄기 + 강조 옵션 + 영향도 슬라이더 */}
              {isEasyMode && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 0' }}>
                    <input
                      type="checkbox"
                      checked={blendStructureEnabled}
                      onChange={(e) => setBlendStructureEnabled(e.target.checked)}
                      id="blend-structure-check"
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                    <label htmlFor="blend-structure-check" style={{ cursor: 'pointer', fontSize: '12.5px', color: 'var(--text-primary)' }}>
                      🔒 기존 이미지 형태 유지
                    </label>
                  </div>
                  {!blendStructureEnabled && (
                    <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', margin: 0 }}>
                      끄면 참조 이미지의 형태·구도까지 더 자유롭게 반영됩니다.
                    </p>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>강조</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {BLEND_EMPHASIS_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setBlendEmphasis(opt.value)}
                          style={{
                            flex: 1, padding: '6px 8px', fontSize: '11.5px', borderRadius: '6px', cursor: 'pointer',
                            border: blendEmphasis === opt.value ? '1px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                            background: blendEmphasis === opt.value ? 'rgba(51, 51, 153, 0.12)' : 'transparent',
                            color: blendEmphasis === opt.value ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                            fontWeight: blendEmphasis === opt.value ? 600 : 500
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>참조 이미지 영향도</span>
                      <span style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>{blendInfluence}%</span>
                    </span>
                    <input type="range" min="0" max="100" value={blendInfluence} onChange={(e) => setBlendInfluence(parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }} />
                  </div>
                </>
              )}

              {/* 프로 모드: Fooocus의 Image Prompt 패널과 동일 — 슬롯(최대 4개)마다 타입/Stop At/Weight를 독립 조절.
                  상단 헤더의 이지/프로 모드 스위치를 그대로 따른다(이 탭 안에 별도 스위치를 두지 않음). */}
              {!isEasyMode && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* 기존 이미지도 슬롯과 똑같은 카드 형태로 — 슬롯과 동일하게 Stop At/Weight를 갖고
                      (블렌딩 시 PyraCanny 구조 슬롯으로 자동 포함됨), 추가로 감도(=denoise)까지 조절 */}
                  {blendBaseImage && (
                    <div style={{ display: 'flex', gap: '10px', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.6)' }}>
                      <img src={blendBaseImage} alt="기존 이미지" style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                        <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>기존 이미지 (구조 기준)</span>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <label style={{ flex: 1, fontSize: '10.5px', color: 'var(--text-tertiary)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            Stop At {blendBaseStopAt.toFixed(2)}
                            <input
                              type="range" min="0" max="1" step="0.01" value={blendBaseStopAt}
                              onChange={(e) => setBlendBaseStopAt(parseFloat(e.target.value))}
                              style={{ width: '100%', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
                            />
                          </label>
                          <label style={{ flex: 1, fontSize: '10.5px', color: 'var(--text-tertiary)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            Weight {blendBaseWeight.toFixed(2)}
                            <input
                              type="range" min="0" max="2" step="0.01" value={blendBaseWeight}
                              onChange={(e) => setBlendBaseWeight(parseFloat(e.target.value))}
                              style={{ width: '100%', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
                            />
                          </label>
                        </div>
                        <label style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          감도 {blendDenoise}% — 낮을수록 원본 유지, 높을수록 완전히 새로 그림
                          <input
                            type="range" min="0" max="100" value={blendDenoise}
                            onChange={(e) => setBlendDenoise(parseInt(e.target.value))}
                            style={{ width: '100%', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ImageIcon size={12} /> 슬롯 ({blendSlots.length}/4) — Image Prompt 방식
                  </span>
                  {blendSlots.map((slot, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '10px', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.6)' }}>
                      <img src={slot.image} alt={`슬롯 ${idx + 1}`} style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <select
                            value={slot.type}
                            onChange={(e) => {
                              const newType = e.target.value;
                              const d = FOOOCUS_SLOT_DEFAULTS[newType];
                              setBlendSlots(prev => prev.map((s, i) => i === idx ? { ...s, type: newType, stopAt: d.stopAt, weight: d.weight } : s));
                            }}
                            style={{ ...selectStyle, flex: 1, padding: '4px 6px', fontSize: '11.5px' }}
                          >
                            {FOOOCUS_SLOT_TYPES.map(t => <option key={t} value={t}>{FOOOCUS_SLOT_TYPE_LABELS[t]}</option>)}
                          </select>
                          <button
                            onClick={() => setBlendSlots(prev => prev.filter((_, i) => i !== idx))}
                            style={{ width: '20px', height: '20px', borderRadius: '50%', border: 'none', background: 'rgba(225,29,72,0.12)', color: 'var(--accent-rose)', cursor: 'pointer', fontSize: '11px', flexShrink: 0 }}
                          >✕</button>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <label style={{ flex: 1, fontSize: '10.5px', color: 'var(--text-tertiary)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            Stop At {slot.stopAt.toFixed(2)}
                            <input
                              type="range" min="0" max="1" step="0.01" value={slot.stopAt}
                              onChange={(e) => setBlendSlots(prev => prev.map((s, i) => i === idx ? { ...s, stopAt: parseFloat(e.target.value) } : s))}
                              style={{ width: '100%', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
                            />
                          </label>
                          <label style={{ flex: 1, fontSize: '10.5px', color: 'var(--text-tertiary)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            Weight {slot.weight.toFixed(2)}
                            <input
                              type="range" min="0" max="2" step="0.01" value={slot.weight}
                              onChange={(e) => setBlendSlots(prev => prev.map((s, i) => i === idx ? { ...s, weight: parseFloat(e.target.value) } : s))}
                              style={{ width: '100%', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                  {blendSlots.length < 4 && (
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDraggingOverBlendSlot(true); }}
                      onDragLeave={() => setIsDraggingOverBlendSlot(false)}
                      onDrop={(e) => {
                        e.preventDefault(); e.stopPropagation(); setIsDraggingOverBlendSlot(false);
                        const files = Array.from(e.dataTransfer.files || []).slice(0, 4 - blendSlots.length);
                        if (files.length > 0) {
                          files.forEach(file => {
                            const reader = new FileReader();
                            reader.onload = (evt) => setBlendSlots(prev => [
                              ...prev,
                              { image: evt.target.result, type: 'ImagePrompt', ...FOOOCUS_SLOT_DEFAULTS.ImagePrompt }
                            ].slice(0, 4));
                            reader.readAsDataURL(file);
                          });
                        } else if (e.dataTransfer.getData('text/plain')) {
                          const imageUrl = e.dataTransfer.getData('text/plain');
                          fetch(imageUrl)
                            .then(res => res.blob())
                            .then(blob => {
                              const reader = new FileReader();
                              reader.onload = (evt) => setBlendSlots(prev => [
                                ...prev,
                                { image: evt.target.result, type: 'ImagePrompt', ...FOOOCUS_SLOT_DEFAULTS.ImagePrompt }
                              ].slice(0, 4));
                              reader.readAsDataURL(blob);
                            })
                            .catch(err => console.error('이미지 로드 실패:', err));
                        }
                      }}
                      onClick={() => blendSlotInputRef.current?.click()}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', borderRadius: '8px',
                        border: isDraggingOverBlendSlot ? '2px solid var(--accent-cyan)' : '1px dashed var(--border-color)',
                        background: isDraggingOverBlendSlot ? 'rgba(51, 51, 153, 0.1)' : 'rgba(255,255,255,0.6)',
                        cursor: 'pointer', minHeight: '44px', transition: 'all 0.15s ease'
                      }}
                    >
                      <ImageIcon size={16} style={{ opacity: 0.4 }} />
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>드래그 또는 클릭으로 슬롯 추가</span>
                    </div>
                  )}
                  <input
                    ref={blendSlotInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []).slice(0, 4 - blendSlots.length);
                      files.forEach(file => {
                        const reader = new FileReader();
                        reader.onload = (evt) => setBlendSlots(prev => [
                          ...prev,
                          { image: evt.target.result, type: 'ImagePrompt', ...FOOOCUS_SLOT_DEFAULTS.ImagePrompt }
                        ].slice(0, 4));
                        reader.readAsDataURL(file);
                      });
                      e.target.value = '';
                    }}
                  />
                </div>
              )}

              {/* 프로 모드: 추가 프롬프트 (선택) + 다듬기 */}
              {!isEasyMode && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>프롬프트 (선택)</span>
                  <textarea
                    value={blendPrompt}
                    onChange={(e) => setBlendPrompt(e.target.value)}
                    placeholder="결과물에서 강조하고 싶은 내용 (예: 야간 조명, 따뜻한 색감 등). 비워두면 이미지만으로 블렌딩합니다."
                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(255, 255, 255, 0.6)', color: 'var(--text-primary)', fontSize: '12px', minHeight: '60px', resize: 'vertical' }}
                  />
                  {blendPrompt.trim() && (
                    <button
                      onClick={refineBlendPrompt}
                      disabled={!blendPrompt.trim() || isBlendPromptRefining}
                      style={{
                        padding: '8px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                        border: '1px solid var(--border-color)', background: 'rgba(51, 51, 153, 0.1)', color: 'var(--accent-cyan)',
                        cursor: isBlendPromptRefining ? 'not-allowed' : 'pointer', opacity: isBlendPromptRefining ? 0.6 : 1
                      }}
                    >
                      {isBlendPromptRefining ? '✨ 다듬는 중...' : '✨ 프롬프트 다듬기'}
                    </button>
                  )}
                </div>
              )}

              {/* Fooocus 방식 설명 */}
              <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  {isEasyMode
                    ? '🎨 Image Prompt 방식: 참조 이미지들을 IP-Adapter로 인코딩해 재질·분위기·색감을 입히고, 구조 유지를 켜면 기존 이미지의 형태(엣지)는 ControlNet으로 그대로 고정합니다.'
                    : '🎨 슬롯마다 PyraCanny/CPDS(형태 고정)와 ImagePrompt(재질/분위기)를 자유롭게 조합할 수 있습니다.'}
                </p>
              </div>

              {/* 블렌딩 버튼 — 프로 모드는 기존 이미지 자체가 항상 구조 슬롯이라 슬롯 추가 없이도 가능 */}
              <button
                onClick={handleBlend}
                disabled={isBlending || !blendBaseImage || (isEasyMode && blendReferenceImages.length === 0)}
                style={{
                  padding: '12px', borderRadius: '8px',
                  background: (!blendBaseImage || (isEasyMode && blendReferenceImages.length === 0)) ? 'var(--border-color)' : 'var(--accent-cyan)',
                  color: 'white', border: 'none',
                  cursor: (!blendBaseImage || (isEasyMode && blendReferenceImages.length === 0)) ? 'not-allowed' : 'pointer',
                  fontWeight: 600, fontSize: '14px',
                  opacity: (!blendBaseImage || (isEasyMode && blendReferenceImages.length === 0)) ? 0.5 : 1
                }}>
                {isBlending ? '블렌딩 중...' : '블렌딩 시작'}
              </button>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
              <p style={{ color: 'var(--text-secondary)' }}>다른 탭을 선택해주세요.</p>
            </div>
          )}
        </div>

        {/* 우측: 갤러리 및 결과물 뷰어 */}
        <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
          <div
            style={{ display: 'flex', flexWrap: 'nowrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '9px', whiteSpace: 'nowrap' }}>
              <ImageIcon size={19} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} /> 보관함 <span style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>({studioGallery.length}개)</span>
            </span>
            <button
              onClick={() => setShowFavoritesOnly(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 13px', borderRadius: '20px',
                border: `1px solid ${showFavoritesOnly ? 'var(--accent-amber)' : 'var(--border-color)'}`,
                background: showFavoritesOnly ? 'rgba(251,191,36,0.14)' : 'transparent',
                color: showFavoritesOnly ? 'var(--accent-amber)' : 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0,
                transition: 'all 0.15s ease'
              }}
            >
              <Star size={14} fill={showFavoritesOnly ? 'var(--accent-amber)' : 'none'} /> 즐겨찾기만
            </button>
          </div>

          {studioGallery.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', gap: '12px' }}>
              <ImageIcon size={40} style={{ opacity: 0.3 }} />
              <span style={{ fontSize: '14px' }}>생성된 이미지가 없습니다</span>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
              {(showFavoritesOnly ? studioGallery.filter(item => item.isFavorite) : studioGallery).map(item => (
                <div
                  key={item.id}
                  onClick={() => setSelectedImage(item)}
                  draggable="true"
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', `/generated/${item.imageFilename}`);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  style={{
                    borderRadius: '10px', overflow: 'hidden', cursor: 'grab',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-elevated)', cursor: 'grab', position: 'relative',
                    boxShadow: 'var(--shadow-card)', transition: 'transform 0.15s ease, border-color 0.15s ease',
                    aspectRatio: '1 / 1'
                  }}
                >
                  <img
                    src={`/generated/${item.imageFilename}`}
                    alt={item.prompt}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteHistoryItem(item.id); }}
                    className="overlay-chip"
                    style={{ position: 'absolute', top: '8px', right: '8px', color: 'var(--accent-rose)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(item); }}
                    title={item.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                    className="overlay-chip"
                    style={{
                      position: 'absolute', top: '8px', left: '8px',
                      color: item.isFavorite ? 'var(--accent-amber)' : '#e2e8f0'
                    }}
                  >
                    <Star size={14} fill={item.isFavorite ? 'var(--accent-amber)' : 'none'} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); downloadImage(item); }}
                    title="다운로드"
                    className="overlay-chip"
                    style={{ position: 'absolute', top: '46px', left: '8px', color: '#e2e8f0' }}
                  >
                    <Download size={14} />
                  </button>
                  <div style={{
                    padding: '10px 12px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.45,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                  }}>
                    {item.prompt}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 라이트박스 모달 */}
      {selectedImage && (
        <div
          onClick={() => setSelectedImage(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(6,9,15,0.88)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative' }}>
            <button
              onClick={() => setSelectedImage(null)}
              title="닫기"
              style={{
                position: 'absolute', top: '-14px', right: '-14px', zIndex: 1,
                width: '32px', height: '32px', borderRadius: '50%',
                border: '1px solid var(--border-color)', background: 'var(--bg-elevated)',
                color: 'var(--text-primary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: 'var(--shadow-card)'
              }}
            >
              <X size={17} />
            </button>
            {selectedImage.beforeImage ? (
              <BeforeAfterSlider beforeSrc={selectedImage.beforeImage} afterSrc={`/generated/${selectedImage.imageFilename}`} />
            ) : (
              <img
                src={`/generated/${selectedImage.imageFilename}`}
                alt=""
                style={{ maxWidth: '100%', maxHeight: '72vh', borderRadius: 'var(--radius-md)', objectFit: 'contain', boxShadow: 'var(--shadow-pop)' }}
              />
            )}
            <div className="surface-card" style={{ color: 'var(--text-primary)', fontSize: '14.5px', padding: '14px 16px', lineHeight: 1.5 }}>
              <div><strong style={{ color: 'var(--accent-cyan)' }}>프롬프트</strong> · {selectedImage.prompt}</div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                파일명 {selectedImage.imageFilename} · 스타일 {selectedImage.style} · 화면비 {selectedImage.aspectRatio} · 시드 {selectedImage.seed}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => toggleFavorite(selectedImage)}
                title={selectedImage.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                style={{
                  padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${selectedImage.isFavorite ? 'var(--accent-amber)' : 'var(--border-color)'}`,
                  background: selectedImage.isFavorite ? 'rgba(251,191,36,0.14)' : 'transparent',
                  color: selectedImage.isFavorite ? 'var(--accent-amber)' : 'var(--text-primary)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease'
                }}
              >
                <Star size={18} fill={selectedImage.isFavorite ? 'var(--accent-amber)' : 'none'} style={{ marginRight: '6px' }} />
                {selectedImage.isFavorite ? '즐겨찾기됨' : '즐겨찾기'}
              </button>
              <button
                onClick={() => downloadImage(selectedImage)}
                title="다운로드"
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)', background: 'transparent',
                  color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease'
                }}
              >
                <Download size={18} style={{ marginRight: '6px' }} />
                다운로드
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export default App;

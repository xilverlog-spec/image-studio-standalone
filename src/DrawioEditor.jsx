import React, { useState, useRef, useCallback, useEffect } from 'react';
import { TEMPLATE_BUILDERS, buildBlankXml } from './drawioTemplates';
import { LAYOUT_LABEL, buildSpecPrompt, buildSpecXml } from './drawioAiBuilder';

// ─────────────────────────────────────────────────────────────────────────────
// draw.io(diagrams.net) 임베드 — 2026-10-02
// 우리가 직접 그리던 DiagramEditor.jsx 대신, 진짜 다이어그램 전문 프로그램(draw.io)을
// 이 프로젝트 안에 통째로 들여와서 쓴다. 완전히 정적 파일(backend/drawio_static/)로
// 자체 호스팅돼 있어서 외부(embed.diagrams.net)로 아무것도 안 나간다 — 참고 이미지
// 분석에만 Gemini(외부)를 쓰고, 그 외엔 전부 이 PC 안에서 끝난다.
// 연동은 postMessage 프로토콜(§ drawio.com/doc/faq/embed-mode)로 한다:
//   draw.io(iframe) --{event:'init'}--> 우리
//   우리 --{action:'load', xml}--> draw.io(iframe)
//   draw.io --{event:'autosave'|'save'|'export', xml/data}--> 우리
// ─────────────────────────────────────────────────────────────────────────────

const TEMPLATE_TYPE_LABEL = { process: '⏩ 프로세스 흐름', bubble: '⭕ 버블 다이어그램', site: '🗺️ 배치도 분석 표기', explode: '🧊 아이소 레이어 분해' };

const inputBase = {
  padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)',
  background: 'rgba(255,255,255,0.8)', color: 'var(--text-primary)', fontSize: '12.5px',
};
const smallBtn = (primary) => ({
  padding: '7px 10px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  border: primary ? '1px solid var(--accent-cyan)' : '1px solid var(--border-color)',
  background: primary ? 'rgba(51,51,153,0.10)' : 'rgba(255,255,255,0.75)',
  color: primary ? 'var(--accent-cyan)' : 'var(--text-secondary)',
});

const download = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};
const downloadDataUri = (dataUri, filename) => {
  const a = document.createElement('a');
  a.href = dataUri; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
};
const stamp = () => {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
};

export default function DrawioEditor({ active = true, addToast, apiFetch, incomingSvg = null }) {
  const doFetch = apiFetch || fetch;
  const notify = useCallback((type, title, msg) => { if (addToast) addToast(type, title, msg); }, [addToast]);

  const iframeRef = useRef(null);
  const xmlRef = useRef(null); // draw.io 가 보고하는 최신 xml (autosave/save 이벤트로 계속 갱신)
  const readyRef = useRef(false);
  const pendingLoadRef = useRef(null); // init 이전에 들어온 load 요청을 쌓아뒀다가 init 되면 보낸다
  const exportWaiters = useRef([]); // export 요청 → 응답 매칭용 콜백 큐(간단히 FIFO)

  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);

  // AI 다이어그램 생성 패널 상태
  const [refImage, setRefImage] = useState(null); // 참고 이미지(선택)
  const [refBusy, setRefBusy] = useState(false);

  // 이미지 → 벡터(SVG) 변환(vtracer 트레이싱, 로컬/무료)
  const [vecBusy, setVecBusy] = useState(false);
  const [vec, setVec] = useState(null); // { svg, w, h, name, pathCount }
  const vecFileRef = useRef(null);
  const [vecMode, setVecMode] = useState('clean');
  const refFileRef = useRef(null);
  const projRef = useRef(null);

  const postToFrame = useCallback((msg) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(msg), '*');
  }, []);

  // 좌표는 항상 우리가 미리 계산해서 xml 에 넣는다(draw.io 의 layout 옵션은 허브형 구조에서 좌표를
  // 0 으로 무너뜨리는 버그가 있어 쓰지 않는다 — drawioAiBuilder.js 참고).
  const loadXml = useCallback((xml) => {
    xmlRef.current = xml;
    const msg = { action: 'load', xml, autosave: 1, fit: 1 };
    if (!readyRef.current) { pendingLoadRef.current = msg; return; }
    // fit:1 이 없으면 도형은 정확히 로드되는데 화면 스크롤 위치가 그대로라 안 보이는 경우가
    // 있었다(§ 세션 기록 — load 이벤트의 modelBounds 는 맞는데 bounds 가 화면 밖이었음).
    postToFrame(msg);
    // 그래도 load 직후 자동 맞춤은 왼쪽이 약간 잘리게 어긋나서, 툴바의 "Fit"을 한 번 더 눌러준다.
    [350, 1000].forEach((ms) => setTimeout(() => {
      iframeRef.current?.contentDocument?.querySelector('a.geButton[title^="Fit"]')?.click();
    }, ms));
  }, [postToFrame]);

  // draw.io 최소 UI 는 창 폭이 1000px 이상이면 도형/서식 패널을 캔버스 위에 둥둥 띄운 채로 시작해서
  // 작업 영역을 가린다. 같은 도메인(/drawio)이라 툴바의 토글 버튼을 직접 눌러 열고 닫을 수 있다.
  const isPanelOpen = useCallback((title) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return false;
    return [...doc.querySelectorAll('.mxWindow')].some((w) =>
      w.querySelector('.mxWindowTitle')?.textContent === title && w.getBoundingClientRect().width > 0 && w.style.display !== 'none');
  }, []);
  const togglePanel = useCallback((title) => {
    iframeRef.current?.contentDocument?.querySelector(`a.geButton[title^="${title}"]`)?.click();
  }, []);
  const closePanelsOnStart = useCallback(() => {
    [300, 900, 1800].forEach((ms) => setTimeout(() => {
      ['Shapes', 'Format'].forEach((t) => { if (isPanelOpen(t)) togglePanel(t); });
    }, ms));
  }, [isPanelOpen, togglePanel]);

  // ── draw.io(iframe) ↔ 우리 사이의 postMessage 수신 ──
  useEffect(() => {
    const onMessage = (evt) => {
      if (evt.source !== iframeRef.current?.contentWindow) return;
      let msg;
      try { msg = JSON.parse(evt.data); } catch { return; }

      if (msg.event === 'init') {
        readyRef.current = true;
        setLoaded(true);
        closePanelsOnStart();
        const pending = pendingLoadRef.current;
        pendingLoadRef.current = null;
        if (pending) {
          postToFrame(pending);
          xmlRef.current = pending.xml;
        } else {
          const xml = buildBlankXml();
          postToFrame({ action: 'load', xml, autosave: 1 });
          xmlRef.current = xml;
        }
      } else if (msg.event === 'autosave' || msg.event === 'save') {
        xmlRef.current = msg.xml;
        setDirty(false);
      } else if (msg.event === 'export') {
        const cb = exportWaiters.current.shift();
        if (cb) cb(msg);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [postToFrame, closePanelsOnStart]);

  // export 액션을 보내고, 그 결과를 Promise 로 돌려받는다(요청/응답을 짝지어 기다리는 헬퍼)
  const requestExport = useCallback((params) => new Promise((resolve) => {
    exportWaiters.current.push(resolve);
    postToFrame({ action: 'export', ...params });
  }), [postToFrame]);

  // ── 내보내기 ──
  const exportPng = async () => {
    if (!loaded) return;
    try {
      const msg = await requestExport({ format: 'png', background: '#ffffff', scale: 2, border: 8 });
      if (!msg?.data) throw new Error('내보내기 응답이 비어있습니다.');
      downloadDataUri(msg.data, `diagram_${stamp()}.png`);
    } catch (err) {
      console.error(err);
      notify('error', 'PNG 내보내기 실패', String(err.message || err));
    }
  };
  const exportSvg = async () => {
    if (!loaded) return;
    try {
      const msg = await requestExport({ format: 'xmlsvg', border: 8 });
      if (!msg?.data) throw new Error('내보내기 응답이 비어있습니다.');
      downloadDataUri(msg.data, `diagram_${stamp()}.svg`);
    } catch (err) {
      console.error(err);
      notify('error', 'SVG 내보내기 실패', String(err.message || err));
    }
  };
  const saveProject = async () => {
    if (!loaded) return;
    try {
      const msg = await requestExport({ format: 'xml' });
      const xml = msg?.xml || msg?.data || xmlRef.current;
      download(new Blob([xml], { type: 'application/xml' }), `diagram_${stamp()}.drawio`);
    } catch (err) {
      console.error(err);
      notify('error', '저장 실패', String(err.message || err));
    }
  };
  const openProject = (file) => {
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => loadXml(String(fr.result));
    fr.readAsText(file);
  };

  // ── 빠른 시작(고정 틀) — AI 없이 그냥 틀만 빨리 넣고 싶을 때용 ──
  const vectorizeFile = async (file) => {
    if (!file || vecBusy) return;
    setVecBusy(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
        fr.readAsDataURL(file);
      });
      const res = await doFetch('/v1/image/vectorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: dataUrl.split(',').pop(), mode: vecMode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '변환에 실패했습니다.');
      const m = data.svg.match(/<svg[^>]*width="(\d+)"[^>]*height="(\d+)"/);
      setVec({ svg: data.svg, w: m ? Number(m[1]) : 1000, h: m ? Number(m[2]) : 700, name: file.name.replace(/\.[^.]+$/, ''), pathCount: (data.svg.match(/<path/g) || []).length });
      notify('success', '벡터 변환 완료', '아래에서 SVG로 저장하거나 캔버스에 넣을 수 있습니다.');
    } catch (e) {
      notify('error', '벡터 변환 실패', e.message);
    } finally {
      setVecBusy(false);
    }
  };

  const vecSave = () => vec && download(new Blob([vec.svg], { type: 'image/svg+xml' }), `${vec.name}_vector_${stamp()}.svg`);

  const placeSvg = useCallback((svg, w, h) => {
    const W = 900; const H = Math.round((h / w) * W);
    const b64 = btoa(unescape(encodeURIComponent(svg)));
    const xml = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>` +
      `<mxCell id="vec1" value="" style="shape=image;imageAspect=1;aspect=fixed;verticalLabelPosition=bottom;verticalAlign=top;image=data:image/svg+xml,${b64};" vertex="1" parent="1"><mxGeometry x="40" y="40" width="${W}" height="${H}" as="geometry"/></mxCell>` +
      `</root></mxGraphModel>`;
    loadXml(xml);
  }, [loadXml]);
  const vecToCanvas = () => { if (vec) placeSvg(vec.svg, vec.w, vec.h); };

  // 개념도 탭에서 "draw.io로 보내기"를 누르면 그 SVG를 캔버스에 올린다.
  useEffect(() => {
    if (incomingSvg?.svg) placeSvg(incomingSvg.svg, incomingSvg.width, incomingSvg.height);
  }, [incomingSvg]); // eslint-disable-line react-hooks/exhaustive-deps

  const addTemplate = (kind) => {
    const builder = TEMPLATE_BUILDERS[kind];
    if (!builder) return;
    loadXml(builder({}));
    notify('success', '템플릿 적용', `${TEMPLATE_TYPE_LABEL[kind]} 틀을 불러왔습니다. draw.io 안에서 자유롭게 고치세요.`);
  };

  // ── AI로 다이어그램 만들기 ──
  // 2026-10-02: 이전엔 "AI가 종류/글자만 읽고 → 내가 짠 고정 수학 공식으로 배치"했는데,
  // "GPT/Claude에게 직접 시키면 더 낫다"는 지적이 정확했다 — 좌표를 손으로 계산하는 느낌이
  // 아니라, AI가 구조(어떤 도형, 어떻게 연결할지, 레이아웃 종류)까지 판단하고, 실제 좌표는
  // draw.io 의 검증된 레이아웃 엔진이 계산하도록 분업했다(§ drawioAiBuilder.js 주석).
  const loadRefFromFile = (file) => {
    if (!file || !file.type.startsWith('image/')) { notify('error', '이미지 파일이 아닙니다', 'PNG, JPG 같은 이미지 파일을 올려주세요.'); return; }
    const fr = new FileReader();
    fr.onload = () => setRefImage({ src: fr.result, b64: String(fr.result).split(',').pop() });
    fr.readAsDataURL(file);
  };
  const [aiDesc, setAiDesc] = useState('');
  const [aiSpec, setAiSpec] = useState(null); // 마지막으로 받은 구조(미리보기/재생성용)
  const generateDiagram = async () => {
    if (!aiDesc.trim() && !refImage) { notify('error', '내용이 없습니다', '설명을 적거나 참고 이미지를 올려주세요.'); return; }
    setRefBusy(true);
    try {
      const res = await doFetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemini-3.1-flash-lite',
          max_tokens: 3000,
          temperature: 0.4,
          messages: [{
            role: 'user',
            content: buildSpecPrompt(aiDesc.trim(), !!refImage),
            ...(refImage ? { images: [refImage.b64] } : {}),
          }],
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content || '';
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('모델이 JSON을 반환하지 않았습니다.');
      const spec = JSON.parse(m[0]);
      if (!Array.isArray(spec.nodes) || !spec.nodes.length) throw new Error('모델이 노드를 만들지 않았습니다.');
      setAiSpec(spec);
      // layout 은 draw.io 의 postMessage 쪽엔 더 이상 안 넘긴다 — buildSpecXml 이 이미 그 종류에
      // 맞는 좌표를 직접 계산해서 심어준다(§ drawioAiBuilder.js 상단 주석, 자동 레이아웃 버그 회피).
      loadXml(buildSpecXml(spec));
      notify('success', '생성 완료', `노드 ${spec.nodes.length}개 · ${LAYOUT_LABEL[spec.layout] || spec.layout} 레이아웃으로 배치했습니다.`);
    } catch (err) {
      console.error('다이어그램 생성 실패:', err);
      notify('error', '생성 실패', `${err.message} — backend/.env 의 GEMINI_API_KEY 와 네트워크 연결을 확인해 주세요.`);
    } finally {
      setRefBusy(false);
    }
  };
  // 같은 구조로 레이아웃만 바꿔서 다시 배치(AI 재호출 없이 즉시)
  const relayout = (layout) => {
    if (!aiSpec) return;
    const next = { ...aiSpec, layout };
    setAiSpec(next);
    loadXml(buildSpecXml(next));
  };

  const iframeSrc = '/drawio/index.html?embed=1&proto=json&offline=1&ui=min&spin=1&libraries=1&noExitBtn=1';

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
      {/* ── 좌측 패널 ── */}
      <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--border-color)', padding: 14, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', background: 'rgba(220, 228, 242, 0.35)', backdropFilter: 'blur(6px)' }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>다이어그램 (draw.io)</div>
          <p style={{ fontSize: 11.5, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.6 }}>
            오른쪽은 다이어그램 전문 편집기(draw.io)입니다. 도형을 끌어다 놓고, 더블클릭해서 글자를 넣고,
            선으로 연결하세요. 직접 편집하는 내용은 외부로 전송되지 않습니다.
          </p>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button style={{ ...smallBtn(false), flex: 1, fontSize: 12 }} onClick={() => togglePanel('Shapes')} disabled={!loaded}>도형 패널 열기/닫기</button>
            <button style={{ ...smallBtn(false), flex: 1, fontSize: 12 }} onClick={() => togglePanel('Format')} disabled={!loaded}>서식 패널 열기/닫기</button>
          </div>
        </div>

        <details open style={{ borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
          <summary style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 6 }}>AI로 다이어그램 만들기</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 11.5, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.5 }}>
              무엇을 만들지 설명하거나 참고 이미지를 올리세요(둘 다 해도 됩니다). AI가 내용을 보고
              도형·연결·색상·레이아웃 종류를 판단하고, 실제 좌표 배치는 프로그램이 계산합니다.
            </p>
            <p style={{ fontSize: 11, color: '#C2410C', margin: 0, lineHeight: 1.5 }}>
              ⚠️ 설명/이미지가 외부(Google Gemini)로 전송됩니다. 민감한 내용은 피하세요.
            </p>
            <textarea
              value={aiDesc}
              onChange={(e) => setAiDesc(e.target.value)}
              rows={4}
              placeholder="예: 설계 프로세스 4단계를 화살표로 연결한 흐름도 — 대지분석, 컨셉, 매스 스터디, 입면 디자인"
              style={{ ...inputBase, resize: 'vertical', fontFamily: 'inherit' }}
            />
            {refImage ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <img src={refImage.src} alt="참고 이미지" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border-color)' }} />
                <button style={{ ...smallBtn(false), fontSize: 11.5, flex: 1 }} onClick={() => setRefImage(null)}>참고 이미지 제거</button>
              </div>
            ) : (
              <button style={smallBtn(false)} onClick={() => refFileRef.current?.click()}>🖼️ 참고 이미지 추가(선택)</button>
            )}
            <input ref={refFileRef} type="file" accept="image/*" hidden onChange={(e) => { loadRefFromFile(e.target.files?.[0]); e.target.value = ''; }} />
            <button style={{ ...smallBtn(true), fontWeight: 700 }} onClick={generateDiagram} disabled={refBusy}>
              {refBusy ? '생성 중…' : '✨ 다이어그램 생성'}
            </button>
            {aiSpec && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 2 }}>
                <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>레이아웃만 바꿔서 다시 배치(재생성 없이 즉시):</span>
                <select
                  value={aiSpec.layout || ''}
                  onChange={(e) => relayout(e.target.value)}
                  style={inputBase}
                >
                  {Object.entries(LAYOUT_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </div>
            )}
          </div>
        </details>

        <details style={{ borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
          <summary style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 6 }}>이미지 → 벡터(SVG) 변환</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 11.5, color: 'var(--text-tertiary, #64748b)', margin: 0, lineHeight: 1.5 }}>
              PNG/JPG 다이어그램 이미지를 올리면 이 PC 안에서 벡터(SVG)로 변환합니다(외부 전송 없음, 무료).
              색과 모양은 따라오지만 글자는 모양으로 변환돼 수정할 수 없고, 평평한 색의 단순한 그림일수록 결과가 좋습니다.
            </p>
            <select value={vecMode} onChange={(e) => setVecMode(e.target.value)} style={inputBase} disabled={vecBusy}>
              <option value="clean">깔끔하게 (일러스트처럼, 권장)</option>
              <option value="faithful">원본에 가깝게 (질감 유지, 거침)</option>
            </select>
            <button style={smallBtn(false)} onClick={() => vecFileRef.current?.click()} disabled={vecBusy}>
              {vecBusy ? '변환 중… (수십 초 걸릴 수 있음)' : '🖼️ 이미지 선택 후 변환'}
            </button>
            <input ref={vecFileRef} type="file" accept="image/*" hidden onChange={(e) => { vectorizeFile(e.target.files?.[0]); e.target.value = ''; }} />
            {vec && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  {vec.name} — 경로 {vec.pathCount.toLocaleString()}개, {(vec.svg.length / 1024).toFixed(0)}KB
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={{ ...smallBtn(true), flex: 1 }} onClick={vecSave}>SVG 저장</button>
                  <button style={{ ...smallBtn(false), flex: 1 }} onClick={vecToCanvas} disabled={!loaded}>캔버스에 넣기</button>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)' }}>※ "캔버스에 넣기"는 현재 캔버스 내용을 대체합니다.</span>
              </div>
            )}
          </div>
        </details>

        <details style={{ borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
          <summary style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary, #64748b)', cursor: 'pointer', marginBottom: 6 }}>빠른 시작(고정 틀, AI 없이)</summary>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            {Object.entries(TEMPLATE_TYPE_LABEL).map(([id, label]) => (
              <button key={id} style={{ ...smallBtn(false), fontSize: 12, padding: '8px 6px' }} onClick={() => addTemplate(id)} disabled={!loaded}>{label}</button>
            ))}
          </div>
        </details>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="run-btn glow-cyan" style={{ flex: 1, padding: '10px', fontSize: 13.5, borderRadius: 9 }} onClick={exportPng} disabled={!loaded}>PNG 저장</button>
            <button style={{ ...smallBtn(true), flex: 1, fontSize: 13.5 }} onClick={exportSvg} disabled={!loaded}>SVG 저장</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={{ ...smallBtn(false), flex: 1 }} onClick={saveProject} disabled={!loaded}>프로젝트 저장(.drawio)</button>
            <button style={{ ...smallBtn(false), flex: 1 }} onClick={() => projRef.current?.click()}>불러오기</button>
          </div>
          <input ref={projRef} type="file" accept=".drawio,.xml,application/xml" hidden onChange={(e) => { openProject(e.target.files?.[0]); e.target.value = ''; }} />
          <button style={smallBtn(false)} onClick={() => loadXml(buildBlankXml())} disabled={!loaded}>빈 캔버스로 새로 시작</button>
        </div>
      </div>

      {/* ── draw.io 본체 ── */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative', background: '#fff' }}>
        {active && (
          <iframe
            ref={iframeRef}
            title="draw.io"
            src={iframeSrc}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          />
        )}
        {!loaded && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary, #64748b)', fontSize: 13, background: 'rgba(255,255,255,0.6)', pointerEvents: 'none' }}>
            불러오는 중…
          </div>
        )}
      </div>
    </div>
  );
}

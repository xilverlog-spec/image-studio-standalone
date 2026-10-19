// 임시 시험 페이지(커밋하지 않음): 결과를 만든 뒤 '편집 화면'이 보이는지 확인용(서버 응답은 흉내)
import React from 'react';
import { createRoot } from 'react-dom/client';
import ConceptDiagram from './ConceptDiagram';

const toasts = []; window.__toasts = toasts;
let polls = 0;
const J = (o, ok = true, status = 200) => Promise.resolve({ ok, status, json: async () => o });
const apiFetch = (url, init) => {
  if (url.startsWith('/v1/chat/completions')) {
    const c = JSON.parse(init.body).messages[0].content;
    if (c.includes('어떤 종류의 그림인지')) return J({ choices: [{ message: { content: '{"type":"plan_drawing","reason":"방 이름이 있는 평면도"}' } }] });
    return J({ detail: 'mock' }, false, 500);
  }
  if (url === '/v1/paid/vision-status') return J({ available: false });
  if (url === '/v1/image/options') return J({ paid_providers: [] });
  if (url === '/v1/image/diagram-edit/options') return J({ available: true });
  if (url === '/v1/image/diagram-edit/start') { polls = 0; return J({ status: 'success', job_id: 'j1' }); }
  if (url.startsWith('/v1/image/diagram-edit/status/')) {
    polls += 1;
    if (polls < 2) return J({ status: 'running', stage: '3/4', percent: 40 });
    return J({ status: 'done', stage: '완료', percent: 100, result: { image: '/_tmp_edit_result.png', width: 1743, height: 1167, title: '동선 다이어그램', legend: [{ color: '#F61918', kind: 'flow', label: '주 동선' }], legend_verified: true, instruction_source: 'gemini', seconds: 240 } });
  }
  return J({}, false, 404);
};
if (!window.__keepStorage) { try { localStorage.removeItem('cd_page_v1'); } catch { /* 무시 */ } }
createRoot(document.getElementById('root')).render(<div style={{ height: '100vh', display: 'flex' }}><ConceptDiagram addToast={(t, a, b) => toasts.push([t, a, b])} apiFetch={apiFetch} /></div>);

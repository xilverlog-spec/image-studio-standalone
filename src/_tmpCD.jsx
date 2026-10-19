// 임시 시험 페이지(커밋하지 않음): 서버 응답을 흉내 내서 자동 연결 경로를 확인한다
import React from 'react';
import { createRoot } from 'react-dom/client';
import ConceptDiagram from './ConceptDiagram';

const calls = []; const toasts = []; window.__calls = calls; window.__toasts = toasts; window.__type = 'building_photo';
let polls = 0;
const J = (o, ok = true, status = 200) => Promise.resolve({ ok, status, json: async () => o });
const apiFetch = (url, init) => {
  calls.push([url, init && init.body ? String(init.body).slice(0, 60) : '']);
  if (url.startsWith('/v1/chat/completions')) {
    const c = JSON.parse(init.body).messages[0].content;
    if (c.includes('어떤 종류의 그림인지')) return J({ choices: [{ message: { content: JSON.stringify({ type: window.__type, reason: '시험용 판단' }) } }] });
    return J({ detail: 'mock: 알 수 없는 요청(건물 형태 읽기 등)' }, false, 500);
  }
  if (url === '/v1/paid/vision-status') return J({ available: false });
  if (url === '/v1/image/options') return J({ paid_providers: [] });
  if (url === '/v1/image/diagram-edit/options') return J({ available: true, server_up: false });
  if (url === '/v1/image/diagram-edit/start') { polls = 0; return J({ status: 'success', job_id: 'j1' }); }
  if (url.startsWith('/v1/image/diagram-edit/status/')) {
    polls += 1;
    if (polls < 2) return J({ status: 'running', stage: '3/4 AI 가 그리는 중', percent: 40 });
    return J({ status: 'done', stage: '완료', percent: 100, result: { image: '/_tmp_edit_result.png', width: 1743, height: 1167, title: '동선 다이어그램', legend: [{ color: '#2870E9', kind: 'zone', label: '공용 공간' }, { color: '#F61918', kind: 'flow', label: '주 동선' }], legend_verified: false, instruction_source: 'gemini', seconds: 240 } });
  }
  return J({}, false, 404);
};
createRoot(document.getElementById('root')).render(<div style={{ height: '100vh', display: 'flex' }}><ConceptDiagram addToast={(t, a, b) => toasts.push([t, a, b])} apiFetch={apiFetch} /></div>);

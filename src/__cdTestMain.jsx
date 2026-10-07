// 임시 시험용(커밋하지 않음)
import React from 'react';
import { createRoot } from 'react-dom/client';
import ConceptDiagram from './ConceptDiagram';

window.__calls = []; window.__resp = [];
const apiFetch = async (path, init) => {
  window.__calls.push(path);
  const res = await fetch(path, init);
  if (path.includes('chat/completions')) { try { const t = await res.clone().text(); window.__resp.push(t); } catch { /* ignore */ } }
  return res;
};
window.T = {
  sleep: (ms) => new Promise(r => setTimeout(r, ms)),
  async fileFrom(url) { const b = await (await fetch(url)).blob(); return new File([b], url.split('/').pop(), { type: b.type || 'image/png' }); },
  async setFile(idx, url) { const inp = document.querySelectorAll('input[type=file]')[idx]; const dt = new DataTransfer(); dt.items.add(await this.fileFrom(url)); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); await this.sleep(800); },
  setText(v) { const ta = document.querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, v); ta.dispatchEvent(new Event('input', { bubbles: true })); },
  btn(txt) { return [...document.querySelectorAll('button')].find(b => b.textContent.includes(txt)); },
  async save(name) { const img = [...document.querySelectorAll('img')].find(i => i.src.startsWith('data:image/svg')); if (!img) return 'no svg'; const svg = decodeURIComponent(img.src.split(',')[1]); const r = await fetch('http://127.0.0.1:5055/save?name=' + name, { method: 'POST', body: svg }); return r.status + ' ' + svg.length; },
};
createRoot(document.getElementById('root')).render(
  <ConceptDiagram addToast={(t, a, b) => { window.__toasts = (window.__toasts || []).concat([[t, a, b]]); }} apiFetch={apiFetch} />
);

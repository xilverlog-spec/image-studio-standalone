import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SketchEditor from './SketchEditor';
import { makeEditSpec, renderSketch, sketchSetZone } from './conceptDiagram/sketch';
import { composePage } from './conceptDiagram/page';
window.__lib = { composePage, renderSketch, sketchSetZone };

const toDataUrl = async (url) => { const b = await (await fetch(url)).blob(); return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }); };
const toJpeg = async (url) => { const im = new Image(); await new Promise((r) => { im.onload = r; im.src = url; }); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); return c.toDataURL('image/jpeg', 0.92); };
function App() {
  const tag = new URLSearchParams(location.search).get('t') || 'p2';
  const [spec, setSpec] = useState(null);
  useEffect(() => { (async () => {
    const J = await (await fetch(`/_tmp_vec/${tag}.json`)).json();
    const base = await toJpeg(J.base);
    const zones = await Promise.all(J.zones.map(async (z) => ({ color: z.color, label: z.label || '구역', blend: z.blend, maskUrl: await toDataUrl(z.mask) })));
    const s = makeEditSpec({ imageUrl: base, w: J.width, h: J.height, title: J.title, legend: J.legend.map((l) => ({ ...l, label: l.label || '동선' })), layers: { arrows: J.arrows, zones } });
    window.__spec = s; setSpec(s);
  })(); }, [tag]);
  window.__render = () => (spec ? renderSketch(spec).svg : '');
  if (!spec) return <p>loading</p>;
  return <div style={{ padding: 10 }}><SketchEditor spec={spec} onChange={(s) => { window.__spec = s; setSpec(s); }} /></div>;
}
createRoot(document.getElementById('root')).render(<App />);

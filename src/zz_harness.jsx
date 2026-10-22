import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import ConceptDiagram from './ConceptDiagram';
window.__toasts = [];
const apiFetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
createRoot(document.getElementById('root')).render(<ConceptDiagram addToast={(k, t, d) => window.__toasts.push([k, t, d])} apiFetch={apiFetch} />);

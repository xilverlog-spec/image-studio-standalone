import React from 'react';
import { createRoot } from 'react-dom/client';
import ConceptDiagram from './ConceptDiagram';
const apiFetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
createRoot(document.getElementById('root')).render(<ConceptDiagram addToast={() => {}} apiFetch={apiFetch} />);

import React from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/tokens.css';
import '../shared/base.css';
import './admin.css';
import Admin from './Admin.jsx';

createRoot(document.getElementById('root')).render(<Admin />);

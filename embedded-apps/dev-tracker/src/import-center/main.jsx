import React from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/tokens.css';
import '../shared/base.css';
import '../shared/sidebar.css';
import '../shared/topbar.css';
import './importcenter.css';
import ImportCenter from './ImportCenter.jsx';

createRoot(document.getElementById('root')).render(<ImportCenter />);

import React from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/tokens.css';
import '../shared/base.css';
import './dashboard.css';
import Dashboard from './Dashboard.jsx';

createRoot(document.getElementById('root')).render(<Dashboard />);

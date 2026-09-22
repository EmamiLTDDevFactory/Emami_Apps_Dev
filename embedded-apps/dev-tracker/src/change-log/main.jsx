import React from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/tokens.css';
import '../shared/base.css';
import '../shared/sidebar.css';
import '../shared/topbar.css';
import './changelog.css';
import ChangeLog from './ChangeLog.jsx';

createRoot(document.getElementById('root')).render(<ChangeLog />);

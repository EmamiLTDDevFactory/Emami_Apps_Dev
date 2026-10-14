import React from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/tokens.css';
import '../shared/base.css';
import '../shared/sidebar.css';
import '../shared/topbar.css';
import './ccb.css';
import Governance from './Governance.jsx';

createRoot(document.getElementById('root')).render(<Governance />);

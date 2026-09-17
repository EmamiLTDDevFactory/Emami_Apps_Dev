import React from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/tokens.css';
import '../shared/base.css';
import '../shared/sidebar.css';
import '../shared/comingsoon.css';
import QaSupport from './QaSupport.jsx';

createRoot(document.getElementById('root')).render(<QaSupport />);

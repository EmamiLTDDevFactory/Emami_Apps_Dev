import React from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/tokens.css';
import '../shared/base.css';
import '../shared/sidebar.css';
import '../shared/comingsoon.css';
import Evaluation from './Evaluation.jsx';

createRoot(document.getElementById('root')).render(<Evaluation />);

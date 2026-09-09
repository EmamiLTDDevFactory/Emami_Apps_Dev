import React from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/tokens.css';
import '../shared/base.css';
import './resource-utilization.css';
import ResourceUtilization from './ResourceUtilization.jsx';

createRoot(document.getElementById('root')).render(<ResourceUtilization />);

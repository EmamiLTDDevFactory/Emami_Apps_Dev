import React from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/tokens.css';
import '../shared/base.css';
import './home.css';
import Home from './Home.jsx';

createRoot(document.getElementById('root')).render(<Home />);

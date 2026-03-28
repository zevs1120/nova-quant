import React from 'react';
import { createRoot } from 'react-dom/client';
import DataPortalApp from './DataPortalApp.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DataPortalApp />
  </React.StrictMode>,
);

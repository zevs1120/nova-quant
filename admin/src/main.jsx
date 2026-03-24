import React from 'react';
import { createRoot } from 'react-dom/client';
import AdminApp from './AdminApp';
import './styles.css';

document.documentElement.lang = 'zh-CN';
document.title = 'NovaQuant 管理后台';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>,
);

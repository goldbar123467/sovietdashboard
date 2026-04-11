import './app.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { setupDebug } from './debug';

setupDebug();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
);

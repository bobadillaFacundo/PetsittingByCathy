import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { redirectToLogin } from './lib/auth.js'

const originalFetch = window.fetch;
window.fetch = async function (...args) {
  const response = await originalFetch.apply(this, args);
  if (response.status === 401) {
    const url = typeof args[0] === 'string'
      ? args[0]
      : (args[0] && args[0].url ? args[0].url : '');
    if (!String(url).includes('auth/login')) {
      redirectToLogin();
    }
  }
  return response;
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

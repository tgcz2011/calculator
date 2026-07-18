import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initHistory } from './history/api';
import './styles/tokens.css';

// ponytail: hydrate native SQLite history cache before first render so list() is populated.
// On web this is a resolved promise (LocalStorage is sync) -> no delay.
initHistory().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});

import React from 'react';
import { createRoot } from 'react-dom/client';
import { Popup } from '../../src/ui/Popup';
import '../../src/ui/styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><Popup/></React.StrictMode>);

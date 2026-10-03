import React from 'react';
import { createRoot } from 'react-dom/client';
import { Options } from '../../src/ui/Options';
import '../../src/ui/styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><Options/></React.StrictMode>);

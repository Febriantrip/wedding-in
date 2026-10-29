/// <reference types="vite/client" />
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'motion/react';
import App from './App';
import './styles.css';
import './modern-theme.css';
import './calendar.css';
import './workspace-shell.css';
import './analytics.css';
import './wedding-v4.css';
import './wedding-motion-theme.css';
import './workspace-rail.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><MotionConfig reducedMotion="user"><App/></MotionConfig></React.StrictMode>);

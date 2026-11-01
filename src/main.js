import './ui/styles.css';
import { App } from './core/App.js';

const fill = document.getElementById('loading-fill');
const text = document.getElementById('loading-text');
const progress = (f, msg) => { fill.style.width = `${Math.round(f * 100)}%`; if (msg) text.textContent = msg; };

const app = new App(document.getElementById('viewport'), document.getElementById('ui'));
window.forge = app; // handy for debugging from the console
app.init(progress).then((restored) => {
  document.getElementById('loading').classList.add('hidden');
  app.ui.showWelcome(restored);
}).catch((e) => {
  console.error(e);
  text.textContent = 'Ошибка запуска: ' + e.message;
});

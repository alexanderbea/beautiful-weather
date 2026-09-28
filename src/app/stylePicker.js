/**
 * Art-style picker: a small control-layer panel (bottom-right, frosted glass) that mirrors the style
 * state (src/app/artStyle.js). It is not part of the scene: it only reads { id, label, hint, swatch? }
 * from the registry and reports picks via onChange(id). The state decides, then setActive(id) syncs the
 * highlight, so ?style= and console changes (__bw.style.set) show up here too.
 *
 * Keyboard: a single-tab-stop radio group; arrow keys / Home / End move between styles and select.
 * `swatch` (optional, a CSS colour/gradient) tints each button's chip; without it a neutral chip is shown.
 */
const CSS = `
.style-picker {
  position: fixed;
  right: max(14px, env(safe-area-inset-right));
  bottom: max(14px, env(safe-area-inset-bottom));
  z-index: 5;
  padding: 4px;
  font-size: 12px;
  color: #e8eef6;
  background: rgba(10, 16, 28, 0.38);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  opacity: 0.72;
  transition: opacity 0.25s ease, background 0.25s ease;
}
.style-picker:hover, .style-picker:focus-within { opacity: 1; background: rgba(10, 16, 28, 0.58); }
.style-picker__group { display: flex; gap: 2px; }
.style-picker__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font: inherit;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}
.style-picker__btn:hover { background: rgba(255, 255, 255, 0.12); }
.style-picker__btn.is-active { background: #e8eef6; color: #0a101c; }
.style-picker__btn:focus-visible { outline: 1px solid rgba(232, 238, 246, 0.8); outline-offset: 2px; }
.style-picker__chip {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--chip, rgba(232, 238, 246, 0.5));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
}
@media (max-width: 520px) { .style-picker__label { display: none; } .style-picker__btn { padding: 6px; } .style-picker__chip { width: 14px; height: 14px; } }
@media (prefers-reduced-motion: reduce) { .style-picker, .style-picker__btn { transition: none; } }
`;

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function injectCss() {
  if (document.getElementById('style-picker-css')) return;
  const el = document.createElement('style');
  el.id = 'style-picker-css';
  el.textContent = CSS;
  document.head.append(el);
}

export function createStylePicker(root, { styles, active, onChange }) {
  injectCss();
  root.classList.add('style-picker');
  root.innerHTML = `<div class="style-picker__group" role="radiogroup" aria-label="Art style">${styles
    .map((s) => {
      const label = escapeHtml(s.label);
      const hint = s.hint ? escapeHtml(s.hint) : '';
      const chip = s.swatch ? ` style="--chip: ${escapeHtml(s.swatch)}"` : '';
      return `<button type="button" class="style-picker__btn" role="radio" aria-checked="false" tabindex="-1"
        data-style-id="${escapeHtml(s.id)}" aria-label="${label}${hint ? ` art style: ${hint}` : ' art style'}" title="${hint || label}">
        <span class="style-picker__chip" aria-hidden="true"${chip}></span><span class="style-picker__label">${label}</span></button>`;
    })
    .join('')}</div>`;
  const buttons = [...root.querySelectorAll('[data-style-id]')];

  function setActive(id) {
    for (const b of buttons) {
      const on = b.dataset.styleId === id;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    if (!buttons.some((b) => b.tabIndex === 0) && buttons[0]) buttons[0].tabIndex = 0;
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-style-id]');
    if (b) onChange(b.dataset.styleId);
  });
  root.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    const n = buttons.length;
    const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: n - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const b = buttons[(next + n) % n];
    b.focus();
    onChange(b.dataset.styleId);
  });

  setActive(active);
  return { setActive };
}

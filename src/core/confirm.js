// The one seam through which anything asks the user "are you sure?".
//
//   confirm_mode: native   window.confirm (default). Looked up at call time so tests can stub it.
//   confirm_mode: inline   a sheet inside the card: translated, themeable, works in kiosk browsers and the
//                          companion app where window.confirm is blocked.
//
// requestConfirmation returns a boolean for native and a Promise<boolean> for inline. Callers do not
// `await` a boolean, so the native path keeps the synchronous timing of (dispatch.js).
import {t as translateFor} from './i18n.js';

export const CONFIRM_MODES = ['native', 'inline'];

/** @param {any} card */
export function confirmMode(card) {
  return card?._config?.confirm_mode === 'inline' ? 'inline' : 'native';
}

/**
 * @param {any} card
 * @param {string} message
 * @returns {boolean|Promise<boolean>}
 */
export function requestConfirmation(card, message) {
  if (confirmMode(card) === 'inline' && card?.shadowRoot) return askInline(card, message);
  return !!globalThis.window.confirm(message);
}

/** True when the value can be awaited. */
export function isThenable(value) {
  return !!value && typeof value.then === 'function';
}

// ---- inline sheet ----------------------------------------------------------------------------------------------
// Buttons use data-confirm (not data-action) so the card's click delegation never mistakes them for actions.
// Styles are set through the CSSOM so a strict Content-Security-Policy cannot block them; colours come from
// the card's own tokens with Home Assistant theme fallbacks.

const SHEET_STYLE = {
  position: 'absolute',
  inset: '0',
  zIndex: '30',
  display: 'grid',
  placeItems: 'center',
  padding: '16px',
  background: 'rgba(0, 0, 0, 0.45)'
};
const PANEL_STYLE = {
  display: 'grid',
  gap: '16px',
  maxWidth: '360px',
  padding: '20px',
  borderRadius: 'var(--ha-card-border-radius, 16px)',
  background: 'var(--hv-sheet, var(--card-background-color, #fff))',
  color: 'var(--hv-text, var(--primary-text-color, #111))',
  font: 'inherit',
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.35)'
};
const BUTTON_STYLE = {
  minHeight: '44px',
  padding: '0 18px',
  border: '1px solid var(--hv-edge, var(--divider-color, rgba(0, 0, 0, 0.2)))',
  borderRadius: '12px',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer'
};

function styled(element, style) {
  Object.assign(element.style, style);
  return element;
}

function askInline(card, message) {
  const root = card.shadowRoot;
  const host = root.querySelector('.shell') || root;
  const doc = root.ownerDocument || globalThis.document;
  const hass = card._hass;
  return new Promise((resolve) => {
    const previous = root.activeElement;
    const sheet = styled(doc.createElement('div'), SHEET_STYLE);
    sheet.className = 'hv-confirm';
    sheet.setAttribute('role', 'alertdialog');
    sheet.setAttribute('aria-modal', 'true');
    const panel = styled(doc.createElement('div'), PANEL_STYLE);
    const text = doc.createElement('p');
    text.style.margin = '0';
    text.textContent = message;
    const row = styled(doc.createElement('div'), {
      display: 'flex',
      gap: '8px',
      justifyContent: 'flex-end'
    });
    const button = (choice, key) => {
      const element = styled(doc.createElement('button'), BUTTON_STYLE);
      element.type = 'button';
      element.dataset.confirm = choice;
      element.textContent = translateFor(hass, key);
      return element;
    };
    const cancel = button('no', 'confirm.no');
    const accept = button('yes', 'confirm.yes');
    row.append(cancel, accept);
    panel.append(text, row);
    sheet.append(panel);

    const finish = (answer) => {
      sheet.remove();
      previous?.focus?.({preventScroll: true});
      resolve(answer);
    };
    // The sheet owns its events: nothing may reach the card's swipe and click handlers underneath.
    for (const type of ['pointerdown', 'pointerup', 'click']) {
      sheet.addEventListener(type, (event) => event.stopPropagation());
    }
    sheet.addEventListener('click', (event) => {
      const choice = event.target.closest?.('[data-confirm]')?.dataset.confirm;
      if (choice) finish(choice === 'yes');
      else if (event.target === sheet) finish(false);
    });
    sheet.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') finish(false);
    });
    host.append(sheet);
    cancel.focus?.({preventScroll: true});
  });
}

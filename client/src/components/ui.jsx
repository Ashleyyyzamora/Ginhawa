import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

// App-wide toasts and confirm dialogs (instead of the browser's alert/confirm pop-ups).
const UiContext = createContext(null);

export function UiProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const nextId = useRef(0);

  const toast = useCallback((message, { tone = 'info', duration = 3500 } = {}) => {
    const id = ++nextId.current;
    setToasts((t) => [...t.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duration);
  }, []);

  const confirm = useCallback(
    (options) => new Promise((resolve) => setConfirmState({ ...options, resolve })),
    [],
  );

  const closeConfirm = (result) => {
    confirmState?.resolve(result);
    setConfirmState(null);
  };

  return (
    <UiContext.Provider value={{ toast, confirm }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <Icon name={t.tone === 'danger' ? 'alert' : 'check'} size={18} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
      {confirmState && (
        <Sheet onClose={() => closeConfirm(false)} title={confirmState.title}>
          {confirmState.message && <p className="muted">{confirmState.message}</p>}
          <div className="sheet-actions">
            <button className="btn" onClick={() => closeConfirm(false)}>Cancel</button>
            <button className={`btn ${confirmState.danger ? 'btn-danger-solid' : 'btn-primary'}`} onClick={() => closeConfirm(true)}>
              {confirmState.confirmLabel ?? 'Confirm'}
            </button>
          </div>
        </Sheet>
      )}
    </UiContext.Provider>
  );
}

export const useUi = () => useContext(UiContext);

/** Bottom sheet on phones, centred dialog on wider screens. Uses the native <dialog> for focus handling. */
export function Sheet({ title, onClose, children }) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog.open) dialog.showModal();
    const cancel = (e) => {
      e.preventDefault(); // Esc key: let React decide, so state stays in sync
      onCloseRef.current();
    };
    dialog.addEventListener('cancel', cancel);
    return () => dialog.removeEventListener('cancel', cancel);
  }, []);
  return (
    <dialog ref={ref} className="sheet" onClick={(e) => e.target === ref.current && onClose()}>
      <div className="sheet-body">
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

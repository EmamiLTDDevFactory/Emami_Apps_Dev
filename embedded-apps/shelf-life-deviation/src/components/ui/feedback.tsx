"use client";
/**
 * Replacements for sap.m.MessageToast and sap.m.MessageBox.
 * Both are callable from plain functions (like the UI5 static APIs):
 *   MessageToast.show("...")
 *   MessageBox.error("...")
 * <FeedbackHost/> must be mounted once (done in AppShell).
 */
import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

type Listener<T> = (v: T) => void;
function channel<T>() {
  const ls = new Set<Listener<T>>();
  return {
    emit: (v: T) => ls.forEach((l) => l(v)),
    on: (l: Listener<T>) => {
      ls.add(l);
      return () => {
        ls.delete(l);
      };
    },
  };
}

const toastChannel = channel<string>();
const boxChannel = channel<{ type: "error"; message: string }>();

export const MessageToast = {
  show(message: string) {
    toastChannel.emit(message);
  },
};

export const MessageBox = {
  error(message: string) {
    boxChannel.emit({ type: "error", message });
  },
};

/** UI5 default MessageToast duration is 3000 ms. */
const TOAST_DURATION = 3000;

export function FeedbackHost() {
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const [boxes, setBoxes] = useState<{ id: number; message: string }[]>([]);
  const idRef = useRef(0);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(
    () =>
      toastChannel.on((text) => {
        const id = ++idRef.current;
        setToasts((t) => [...t, { id, text }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_DURATION);
      }),
    []
  );

  useEffect(
    () =>
      boxChannel.on(({ message }) => {
        const id = ++idRef.current;
        setBoxes((b) => [...b, { id, message }]);
      }),
    []
  );

  useEffect(() => {
    if (boxes.length) closeBtn.current?.focus();
  }, [boxes.length]);

  const top = boxes[boxes.length - 1];
  const closeTop = () => setBoxes((b) => b.slice(0, -1));

  return (
    <>
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.text}
          </div>
        ))}
      </div>
      {top ? (
        <div className="modal-backdrop" style={{ zIndex: 1200 }}>
          <div
            className="dialog messagebox"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={"mb-title-" + top.id}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeTop();
            }}
          >
            <header className="dialog-header messagebox-header state-error">
              <Icon name="error" size={18} />
              <h2 id={"mb-title-" + top.id}>Error</h2>
            </header>
            <div className="dialog-content messagebox-content">{top.message}</div>
            <footer className="dialog-footer">
              <button ref={closeBtn} className="btn btn-emphasized" onClick={closeTop}>
                Close
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}

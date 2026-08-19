import { useEffect, useRef } from "react";
import { X, Keyboard } from "lucide-react";
import { CONDITION_SHORTCUTS, FIXED_SHORTCUTS } from "../data/keyboardShortcuts";

interface KeyboardHelpOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  includedShortcuts: string[];
}

export function KeyboardHelpOverlay({ isOpen, onClose, includedShortcuts }: KeyboardHelpOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dialogRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) {
        e.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!focusable.includes(document.activeElement as HTMLElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [isOpen, onClose]);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-help-title"
        tabIndex={-1}
        className="bg-white rounded-md shadow-xl border border-gray-200 w-full max-w-lg overflow-hidden outline-none"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50">
          <h2 id="keyboard-help-title" className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Keyboard size={20} className="text-gray-500" />
            Keyboard Shortcuts
          </h2>
          <button 
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
            className="p-1 hover:bg-gray-200 rounded text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            {includedShortcuts.length > 0 && (
              <ShortcutRow keys={includedShortcuts} label="Toggle included items" />
            )}
            <ShortcutRow keys={[...CONDITION_SHORTCUTS]} label="Select Condition" />
            {FIXED_SHORTCUTS.map((shortcut) => (
              <ShortcutRow key={shortcut.label} keys={[...shortcut.keys]} label={shortcut.label} />
            ))}
          </div>
          
          <div className="mt-8 p-3 bg-blue-50 border border-blue-100 rounded text-sm text-blue-800">
            <strong>Note:</strong> Shortcuts are disabled when typing in a text field.
          </div>
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({ keys, label }: { keys: string[], label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="flex items-center gap-1">
        {keys.map((k, idx) => (
          <span key={idx} className="bg-gray-100 border border-gray-300 text-gray-700 text-xs font-mono font-bold px-2 py-1 rounded shadow-sm">
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}
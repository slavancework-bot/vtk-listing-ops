import { useEffect } from "react";
import { X, Keyboard } from "lucide-react";

interface KeyboardHelpOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardHelpOverlay({ isOpen, onClose }: KeyboardHelpOverlayProps) {
  
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-md shadow-xl border border-gray-200 w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Keyboard size={20} className="text-gray-500" />
            Keyboard Shortcuts
          </h2>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <ShortcutRow keys={["1", "-", "9"]} label="Toggle items 1-9" />
            <ShortcutRow keys={["0"]} label="Toggle item 10" />
            <ShortcutRow keys={["A", "B", "C", "D"]} label="Select Condition" />
            <ShortcutRow keys={["Enter"]} label="Save & Next" />
            <ShortcutRow keys={["F2"]} label="Needs Review" />
            <ShortcutRow keys={["?"]} label="Show this help" />
            <ShortcutRow keys={["Esc"]} label="Close modals / help" />
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
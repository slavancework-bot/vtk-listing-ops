import { useState } from "react";
import { AlertCircle } from "lucide-react";

interface SkipPanelProps {
  onCancel: () => void;
  onConfirm: (reason: string, notes: string) => void;
}

const REASONS = [
  "Cannot identify item",
  "Cannot verify included components",
  "Inventory does not match",
  "Item condition unclear",
  "Other"
];

export function SkipPanel({ onCancel, onConfirm }: SkipPanelProps) {
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState("");

  const handleConfirm = () => {
    if (reason) {
      onConfirm(reason, notes);
    }
  };

  return (
    <div className="bg-white border-2 border-amber-200 rounded-md shadow-lg p-5 flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center gap-2 text-amber-600 font-bold border-b border-gray-100 pb-3">
        <AlertCircle size={20} />
        SKIP / NEEDS REVIEW
      </div>
      
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-700">Reason</label>
        <select 
          className="w-full p-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          data-testid="select-skip-reason"
        >
          <option value="" disabled>Select a reason...</option>
          {REASONS.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-700">Notes (Optional)</label>
        <textarea 
          className="w-full p-2 border border-gray-300 rounded-md text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
          placeholder="Provide additional details..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      
      <div className="flex items-center gap-3 pt-2">
        <button 
          onClick={onCancel}
          className="flex-1 py-2 px-4 rounded-md border border-gray-300 font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button 
          onClick={handleConfirm}
          disabled={!reason}
          className="flex-1 py-2 px-4 rounded-md bg-amber-500 text-white font-bold hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="btn-confirm-skip"
        >
          Confirm Skip
        </button>
      </div>
    </div>
  );
}

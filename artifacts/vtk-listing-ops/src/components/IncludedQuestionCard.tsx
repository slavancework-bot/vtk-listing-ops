import { Check } from "lucide-react";
import { IncludedItem } from "../data/mockData";
import { getIncludedShortcut } from "../data/keyboardShortcuts";

interface IncludedQuestionCardProps {
  item: IncludedItem;
  index: number;
  isSelected: boolean;
  onToggle: () => void;
  showError: boolean;
}

export function IncludedQuestionCard({
  item,
  index,
  isSelected,
  onToggle,
  showError,
}: IncludedQuestionCardProps) {
  const shortcutNumber = getIncludedShortcut(index);
  
  return (
    <label
      className={`
        relative w-full flex items-center gap-3 p-3 text-left rounded-md transition-all duration-150 cursor-pointer
        border
        ${isSelected 
          ? "border-emerald-600 bg-emerald-50/50" 
          : showError
            ? "border-destructive bg-destructive/5 animate-pulse"
            : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
        }
        focus-within:ring-2 focus-within:ring-emerald-500 focus-within:ring-offset-1
      `}
      data-testid={`btn-include-${item.id}`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        aria-label={item.label}
        className="sr-only"
      />

      <div aria-hidden="true" className={`
        flex items-center justify-center w-5 h-5 rounded-sm border-2 shrink-0
        ${isSelected
          ? "bg-emerald-600 border-emerald-600 text-white"
          : "bg-white border-gray-300 text-transparent"
        }
      `}>
        <Check size={12} strokeWidth={4} />
      </div>
      
      <div className="flex items-center gap-2 flex-grow pr-6">
        <span className="text-xs font-semibold text-gray-400 w-5 text-center shrink-0">
          {index + 1}
        </span>
        <span className={`font-medium text-sm ${isSelected ? "text-gray-900" : "text-gray-700"}`}>
          {item.label}
        </span>
      </div>
      
      {shortcutNumber !== null && (
        <div className="absolute top-3 right-3 flex items-center justify-center w-4 h-4 rounded bg-gray-100 text-[9px] font-mono font-bold text-gray-400 border border-gray-200 opacity-50">
          {shortcutNumber}
        </div>
      )}
    </label>
  );
}

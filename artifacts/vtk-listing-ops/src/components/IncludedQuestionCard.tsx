import { Check } from "lucide-react";
import { IncludedItem } from "../data/mockData";

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
  const shortcutNumber = index < 9 ? index + 1 : index === 9 ? 0 : null;
  
  return (
    <button
      onClick={onToggle}
      className={`
        relative w-full flex items-center gap-4 p-4 text-left rounded-md transition-all duration-150
        border-2 
        ${isSelected 
          ? "border-primary bg-primary/5 shadow-sm" 
          : showError
            ? "border-destructive bg-destructive/5 animate-pulse"
            : "border-gray-200 bg-white hover:border-primary/50 hover:bg-gray-50"
        }
      `}
      data-testid={`btn-include-${item.id}`}
    >
      <div className={`
        flex items-center justify-center w-6 h-6 rounded-full shrink-0 border
        ${isSelected
          ? "bg-primary border-primary text-white"
          : "bg-white border-gray-300 text-transparent"
        }
      `}>
        <Check size={14} strokeWidth={3} />
      </div>
      
      <div className="flex flex-col flex-grow">
        <span className={`font-medium ${isSelected ? "text-gray-900" : "text-gray-700"}`}>
          {item.label}
        </span>
        {item.important && (
          <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider mt-0.5">
            Important Buyer Consideration
          </span>
        )}
      </div>
      
      {shortcutNumber !== null && (
        <div className="absolute top-2 right-2 flex items-center justify-center w-5 h-5 rounded bg-gray-100 text-[10px] font-mono font-bold text-gray-400 border border-gray-200">
          {shortcutNumber}
        </div>
      )}
    </button>
  );
}

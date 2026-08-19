import { ConditionValue } from "../data/mockData";
import { useId } from "react";

interface ConditionSelectorProps {
  selected: ConditionValue;
  onSelect: (val: ConditionValue) => void;
  showError: boolean;
}

const CONDITIONS = [
  { id: 'A', label: 'NEW' },
  { id: 'B', label: 'NEW OPEN BOX' },
  { id: 'C', label: 'FACTORY SEALED' },
  { id: 'D', label: 'USED' },
] as const;

export function ConditionSelector({ selected, onSelect, showError }: ConditionSelectorProps) {
  const groupId = useId();

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? CONDITIONS.length - 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index - 1 + CONDITIONS.length) % CONDITIONS.length
          : (index + 1) % CONDITIONS.length;
    onSelect(CONDITIONS[nextIndex].id);
    requestAnimationFrame(() => {
      document.getElementById(`${groupId}-${CONDITIONS[nextIndex].id}`)?.focus();
    });
  };

  return (
    <div className={`
      flex flex-col gap-3 rounded-md transition-colors
      ${showError ? "border-2 border-destructive bg-destructive/5 p-2" : "border-transparent"}
    `}>
      <div className="flex items-baseline gap-2">
        <h3 id={`${groupId}-label`} className="text-sm font-bold text-emerald-700 tracking-wide uppercase">CONDITION</h3>
        <span className="text-xs text-gray-400">(Select one)</span>
      </div>
      <div
        className="grid grid-cols-4 gap-3"
        role="radiogroup"
        aria-labelledby={`${groupId}-label`}
      >
        {CONDITIONS.map((cond, index) => {
          const isSelected = selected === cond.id;
          return (
            <label
              key={cond.id}
              className={`
                relative flex flex-col items-center justify-between p-4 rounded-md border-2 transition-all min-h-[90px]
                ${isSelected 
                  ? "border-emerald-800 bg-emerald-800 text-white" 
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                }
                focus-within:ring-2 focus-within:ring-emerald-500 focus-within:ring-offset-1 cursor-pointer
              `}
              data-testid={`btn-condition-${cond.id}`}
            >
              <input
                id={`${groupId}-${cond.id}`}
                type="radio"
                name="condition"
                value={cond.id}
                checked={isSelected}
                onChange={() => onSelect(cond.id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                aria-label={cond.label}
                tabIndex={isSelected || (selected === null && index === 0) ? 0 : -1}
                className="sr-only"
              />

              <div className={`
                absolute top-2 left-2 text-xs font-bold rounded px-1.5 py-0.5
                ${isSelected ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}
              `} aria-hidden="true">
                {cond.id}
              </div>
              
              <div className="font-bold text-sm tracking-wide text-center flex-1 flex items-center justify-center mt-3 mb-2">
                {cond.label}
              </div>
              
              <div className={`
                w-4 h-4 rounded-full border-2 self-center mt-auto flex items-center justify-center shrink-0
                ${isSelected ? "border-white bg-transparent" : "border-gray-300 bg-white"}
              `} aria-hidden="true">
                {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </label>
          );
        })}
      </div>
      {showError && (
        <p className="text-sm text-destructive font-medium mt-1">Please select a condition.</p>
      )}
    </div>
  );
}

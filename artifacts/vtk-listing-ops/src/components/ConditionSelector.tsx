import { ConditionValue } from "../data/mockData";

interface ConditionSelectorProps {
  selected: ConditionValue;
  onSelect: (val: ConditionValue) => void;
  showError: boolean;
}

const CONDITIONS = [
  { id: 'A' as ConditionValue, label: 'NEW' },
  { id: 'B' as ConditionValue, label: 'NEW OPEN BOX' },
  { id: 'C' as ConditionValue, label: 'FACTORY SEALED' },
  { id: 'D' as ConditionValue, label: 'USED' },
];

export function ConditionSelector({ selected, onSelect, showError }: ConditionSelectorProps) {
  return (
    <div className={`
      flex flex-col gap-3 rounded-md transition-colors
      ${showError ? "border-2 border-destructive bg-destructive/5 p-2" : "border-transparent"}
    `}>
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-bold text-emerald-700 tracking-wide uppercase">CONDITION</h3>
        <span className="text-xs text-gray-400">(Select one)</span>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {CONDITIONS.map((cond) => {
          const isSelected = selected === cond.id;
          return (
            <button
              key={cond.id}
              onClick={() => onSelect(cond.id)}
              className={`
                relative flex flex-col items-center justify-between p-4 rounded-md border-2 transition-all min-h-[90px]
                ${isSelected 
                  ? "border-emerald-800 bg-emerald-800 text-white" 
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                }
              `}
              data-testid={`btn-condition-${cond.id}`}
            >
              <div className={`
                absolute top-2 left-2 text-xs font-bold rounded px-1.5 py-0.5
                ${isSelected ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}
              `}>
                {cond.id}
              </div>
              
              <div className="font-bold text-sm tracking-wide text-center flex-1 flex items-center justify-center mt-3 mb-2">
                {cond.label}
              </div>
              
              <div className={`
                w-4 h-4 rounded-full border-2 self-center mt-auto flex items-center justify-center shrink-0
                ${isSelected ? "border-white bg-transparent" : "border-gray-300 bg-white"}
              `}>
                {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </button>
          );
        })}
      </div>
      {showError && (
        <p className="text-sm text-destructive font-medium mt-1">Please select a condition.</p>
      )}
    </div>
  );
}

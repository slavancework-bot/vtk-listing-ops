import { ConditionValue } from "../data/mockData";

interface ConditionSelectorProps {
  selected: ConditionValue;
  onSelect: (val: ConditionValue) => void;
  showError: boolean;
}

const CONDITIONS = [
  { id: 'A' as ConditionValue, label: 'NEW', className: 'condition-new' },
  { id: 'B' as ConditionValue, label: 'NEW OPEN BOX', className: 'condition-nob' },
  { id: 'C' as ConditionValue, label: 'NEW FACTORY SEALED', className: 'condition-nfs' },
  { id: 'D' as ConditionValue, label: 'USED', className: 'condition-used' },
];

export function ConditionSelector({ selected, onSelect, showError }: ConditionSelectorProps) {
  return (
    <div className={`
      flex flex-col gap-3 p-4 rounded-md border-2 transition-colors
      ${showError ? "border-destructive bg-destructive/5" : "border-transparent"}
    `}>
      <h3 className="text-sm font-semibold text-gray-900 tracking-wide uppercase">Condition</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {CONDITIONS.map((cond) => (
          <button
            key={cond.id}
            onClick={() => onSelect(cond.id)}
            className={`
              relative flex flex-col items-center justify-center p-4 text-center rounded-md border-2 transition-all duration-200
              ${cond.className}
              ${selected === cond.id ? "selected shadow-sm scale-[0.98]" : "hover:border-gray-400 hover:shadow-sm"}
            `}
            data-testid={`btn-condition-${cond.id}`}
          >
            <span className="font-bold text-sm tracking-tight mb-1">{cond.label}</span>
            <div className="absolute top-2 left-2 flex items-center justify-center w-5 h-5 rounded bg-white/50 text-[10px] font-mono font-bold border border-current opacity-70">
              {cond.id}
            </div>
          </button>
        ))}
      </div>
      {showError && (
        <p className="text-sm text-destructive font-medium mt-1">Please select a condition.</p>
      )}
    </div>
  );
}

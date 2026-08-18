import { CheckCircle2, Circle } from "lucide-react";
import { ConditionValue } from "../data/mockData";

interface StatusPanelProps {
  inclusionComplete: boolean;
  conditionComplete: boolean;
  conditionSelected: ConditionValue;
  isReady: boolean;
}

const CONDITION_LABELS: Record<string, string> = {
  'A': 'NEW',
  'B': 'NEW OPEN BOX',
  'C': 'NEW FACTORY SEALED',
  'D': 'USED'
};

export function StatusPanel({
  inclusionComplete,
  conditionComplete,
  conditionSelected,
  isReady
}: StatusPanelProps) {
  
  let requiredRemaining = 0;
  if (!inclusionComplete) requiredRemaining++;
  if (!conditionComplete) requiredRemaining++;

  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-sm p-5 flex flex-col gap-6">
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Completion Status
        </h3>
        
        {isReady ? (
          <div className="flex items-center gap-2 text-primary font-medium bg-primary/10 p-3 rounded-md">
            <CheckCircle2 size={20} />
            <span>Ready to save</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-600 font-medium bg-amber-50 border border-amber-200 p-3 rounded-md">
            <Circle size={20} className="fill-amber-100" />
            <span>Required: {requiredRemaining} remaining</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Checklist
        </h3>
        <div className="flex items-center gap-3 text-sm">
          {inclusionComplete ? (
            <CheckCircle2 size={16} className="text-primary" />
          ) : (
            <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
          )}
          <span className={inclusionComplete ? "text-gray-900" : "text-gray-500"}>
            Included questions answered
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {conditionComplete ? (
            <CheckCircle2 size={16} className="text-primary" />
          ) : (
            <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
          )}
          <span className={conditionComplete ? "text-gray-900" : "text-gray-500"}>
            Condition selected
          </span>
        </div>
      </div>
      
      {conditionSelected && (
        <div className="pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Selected Condition</p>
          <p className="font-semibold text-gray-900">{CONDITION_LABELS[conditionSelected]}</p>
        </div>
      )}
    </div>
  );
}

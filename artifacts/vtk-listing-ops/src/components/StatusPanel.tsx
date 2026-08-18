import { CheckCircle2, Circle } from "lucide-react";
import { ConditionValue } from "../data/mockData";

interface StatusPanelProps {
  inclusionComplete: boolean;
  conditionComplete: boolean;
  conditionSelected: ConditionValue;
  isReady: boolean;
  selectedCount: number;
  totalQuestions: number;
}

const CONDITION_LABELS: Record<string, string> = {
  'A': 'NEW',
  'B': 'NEW OPEN BOX',
  'C': 'FACTORY SEALED',
  'D': 'USED'
};

export function StatusPanel({
  inclusionComplete,
  conditionComplete,
  conditionSelected,
  isReady,
  selectedCount,
  totalQuestions
}: StatusPanelProps) {
  
  let requiredRemaining = 0;
  if (!inclusionComplete) requiredRemaining++;
  if (!conditionComplete) requiredRemaining++;

  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-sm p-6 flex flex-col gap-4">
      <h3 className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-2">
        STATUS
      </h3>
      
      <div className="flex flex-col gap-4">
        {totalQuestions > 0 && (
          <div className="flex items-center gap-1 text-sm bg-gray-50 p-3 rounded-md border border-gray-100">
            <span className="text-emerald-600 font-semibold">{selectedCount}</span>
            <span className="text-gray-600">of {totalQuestions} selected</span>
          </div>
        )}

        {conditionSelected && (
          <div className="flex items-center gap-2 text-sm bg-gray-50 p-3 rounded-md border border-gray-100">
            <span className="text-gray-500">Condition:</span>
            <span className="text-gray-900 font-medium">
              {CONDITION_LABELS[conditionSelected]} ({conditionSelected})
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100">
        {isReady ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-500">All required fields completed</p>
            <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 text-sm font-medium px-4 py-2.5 rounded-md">
              <CheckCircle2 size={18} />
              <span>Ready to Save</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-600 font-medium bg-amber-50 border border-amber-200 px-4 py-2.5 rounded-md text-sm">
            <Circle size={18} className="fill-amber-100" />
            <span>Required: {requiredRemaining} remaining</span>
          </div>
        )}
      </div>
    </div>
  );
}

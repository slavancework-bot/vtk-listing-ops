import { CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { ConditionValue } from "../data/mockData";

interface StatusPanelProps {
  inclusionComplete: boolean;
  conditionComplete: boolean;
  conditionSelected: ConditionValue;
  isReady: boolean;
  selectedCount: number;
  totalQuestions: number;
  includedDecisionMade: boolean;
  missingItems: string[];
  savedStatus?: 'pending' | 'complete' | 'needs-review';
  fieldSummaries?: Array<{ label: string; value: string }>;
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
  totalQuestions,
  includedDecisionMade,
  missingItems,
  savedStatus,
  fieldSummaries = []
}: StatusPanelProps) {
  
  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-sm p-6 flex flex-col gap-4">
      {savedStatus === 'complete' && (
        <div className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-1 rounded text-xs font-bold w-fit mb-1">
          <CheckCircle2 size={14} /> Previously saved
        </div>
      )}
      {savedStatus === 'needs-review' && (
        <div className="flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-1 rounded text-xs font-bold w-fit mb-1">
          <AlertCircle size={14} /> Flagged for review
        </div>
      )}
      
      <h3 className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-2">
        STATUS
      </h3>
      
      <div className="flex flex-col gap-4">
        {totalQuestions > 0 && (
          <div className={`flex items-center gap-2 text-sm p-3 rounded-md border ${includedDecisionMade && selectedCount === 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'bg-gray-50 border-gray-100'}`}>
            {includedDecisionMade && selectedCount === 0 ? (
              <span className="font-semibold text-emerald-600">None included confirmed</span>
            ) : (
              <>
                <span className="text-emerald-600 font-semibold">{selectedCount}</span>
                <span className="text-gray-600">of {totalQuestions} selected</span>
              </>
            )}
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

        {fieldSummaries.map((field) => (
          <div key={field.label} className="flex items-center justify-between gap-2 text-sm bg-gray-50 p-3 rounded-md border border-gray-100">
            <span className="text-gray-500">{field.label}:</span>
            <span className="text-gray-900 font-medium">{field.value}</span>
          </div>
        ))}
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
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-amber-600 font-medium bg-amber-50 border border-amber-200 px-4 py-2.5 rounded-md text-sm">
              <Circle size={18} className="fill-amber-100 shrink-0" />
              <span>Missing requirements</span>
            </div>
            {missingItems.length > 0 && (
              <ul className="flex flex-col gap-1 mt-1 pl-2">
                {missingItems.map(item => (
                  <li key={item} className="text-xs text-amber-600 font-medium flex items-center gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-amber-400" />
                    Missing: {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
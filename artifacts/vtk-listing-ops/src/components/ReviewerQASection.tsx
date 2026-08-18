import { CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";

interface QAResult {
  label: string;
  status: 'pass' | 'warning' | 'fail';
  message?: string;
}

interface ReviewerQASectionProps {
  category: string;
  alternateCategories: string[];
  itemSpecifics: Record<string, string>;
  missingSpecifics: string[];
  proposedTitle: string;
  titleLength: number;
  description: string;
  qaResults: QAResult[];
}

export function ReviewerQASection({
  category,
  alternateCategories,
  itemSpecifics,
  missingSpecifics,
  proposedTitle,
  titleLength,
  description,
  qaResults,
}: ReviewerQASectionProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white border border-gray-200 rounded-md p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 border-b border-gray-100 pb-2">
          Listing Details
        </h3>
        
        <div className="flex flex-col gap-5">
          <div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
              eBay Category
            </span>
            <p className="text-sm font-medium text-gray-900">{category}</p>
            {alternateCategories.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Alts: {alternateCategories.join(" | ")}
              </p>
            )}
          </div>
          
          <div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              Item Specifics
              {missingSpecifics.length > 0 && (
                <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-sm flex items-center gap-1">
                  <AlertTriangle size={10} /> Missing Required
                </span>
              )}
            </span>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {Object.entries(itemSpecifics).map(([key, value]) => (
                <div key={key} className="flex flex-col border-b border-gray-50 pb-1">
                  <span className="text-gray-500 text-xs">{key}</span>
                  <span className="font-medium text-gray-900">{value}</span>
                </div>
              ))}
              {missingSpecifics.map(key => (
                <div key={key} className="flex flex-col border-b border-amber-100 pb-1 bg-amber-50/50 px-1 -mx-1 rounded-sm">
                  <span className="text-amber-700 text-xs font-medium flex items-center gap-1">
                    {key} <AlertTriangle size={12} />
                  </span>
                  <span className="text-amber-800 font-semibold">—</span>
                </div>
              ))}
            </div>
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
                Proposed Title
              </span>
              <span className={`text-xs font-mono font-medium ${titleLength > 80 ? "text-destructive" : "text-primary"}`}>
                {titleLength}/80
              </span>
            </div>
            <p className="text-lg font-bold text-gray-900 leading-tight">
              {proposedTitle}
            </p>
          </div>
          
          <div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
              Description Preview
            </span>
            <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded-md border border-gray-100 line-clamp-3">
              {description}
            </div>
            <button className="text-primary text-xs font-medium mt-2 hover:underline">
              View Full HTML
            </button>
          </div>
        </div>
      </div>
      
      <div className="bg-white border border-gray-200 rounded-md p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 border-b border-gray-100 pb-2">
          Automated QA Results
        </h3>
        <div className="flex flex-col gap-2">
          {qaResults.map((result, idx) => (
            <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <span className="text-sm text-gray-700 font-medium">{result.label}</span>
              <div className="flex items-center gap-2">
                {result.message && (
                  <span className={`text-xs ${result.status === 'warning' ? 'text-amber-600' : 'text-destructive'}`}>
                    {result.message}
                  </span>
                )}
                {result.status === 'pass' && <CheckCircle2 size={18} className="text-primary" />}
                {result.status === 'warning' && <AlertTriangle size={18} className="text-amber-500" />}
                {result.status === 'fail' && <AlertCircle size={18} className="text-destructive" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

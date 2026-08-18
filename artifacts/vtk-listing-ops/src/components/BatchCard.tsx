import { ArrowRight, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

interface BatchCardProps {
  name: string;
  date: string;
  creator: string;
  totalItems: number;
  status: string;
  counts: {
    researching: number;
    waitingForEmployee: number;
    needsReview: number;
    readyForApproval: number;
    approved: number;
    exported: number;
  };
  onOpen: () => void;
}

export function BatchCard({
  name,
  date,
  creator,
  totalItems,
  status,
  counts,
  onOpen,
}: BatchCardProps) {
  
  const isCompleted = status === "Completed";
  const needsAttention = status === "Needs Attention";
  
  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-gray-300">
      <div className={`
        px-5 py-3 border-b flex items-center justify-between
        ${isCompleted ? "bg-gray-50 border-gray-200" : needsAttention ? "bg-amber-50 border-amber-200" : "bg-primary/5 border-primary/20"}
      `}>
        <div className="flex items-center gap-3">
          {isCompleted && <CheckCircle2 size={18} className="text-gray-500" />}
          {needsAttention && <AlertTriangle size={18} className="text-amber-500" />}
          {!isCompleted && !needsAttention && <Clock size={18} className="text-primary" />}
          
          <h3 className="font-bold text-gray-900">{name}</h3>
        </div>
        
        <span className={`
          text-xs font-semibold px-2 py-1 rounded-sm uppercase tracking-wider
          ${isCompleted ? "bg-gray-200 text-gray-700" : needsAttention ? "bg-amber-200 text-amber-800" : "bg-primary text-white"}
        `}>
          {status}
        </span>
      </div>
      
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between text-sm text-gray-500 border-b border-gray-100 pb-3">
          <span>Created {date} by {creator}</span>
          <span className="font-medium text-gray-900">{totalItems} Items Total</span>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-2">
          <StatusCount label="Researching" count={counts.researching} />
          <StatusCount label="Waiting Emp." count={counts.waitingForEmployee} highlight={counts.waitingForEmployee > 0} />
          <StatusCount label="Needs Review" count={counts.needsReview} highlightAlert={counts.needsReview > 0} />
          <StatusCount label="Ready to Appr." count={counts.readyForApproval} highlight={counts.readyForApproval > 0} />
          <StatusCount label="Approved" count={counts.approved} />
          <StatusCount label="Exported" count={counts.exported} />
        </div>
        
        <div className="pt-4 mt-2 border-t border-gray-100 flex justify-end">
          <button 
            onClick={onOpen}
            className="flex items-center gap-2 text-sm font-semibold text-primary hover:text-emerald-800 transition-colors"
          >
            OPEN BATCH <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusCount({ label, count, highlight = false, highlightAlert = false }: { label: string, count: number, highlight?: boolean, highlightAlert?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-500 uppercase tracking-tight">{label}</span>
      <span className={`
        text-lg font-bold
        ${count === 0 ? "text-gray-300" : highlightAlert ? "text-amber-600" : highlight ? "text-primary" : "text-gray-900"}
      `}>
        {count}
      </span>
    </div>
  );
}

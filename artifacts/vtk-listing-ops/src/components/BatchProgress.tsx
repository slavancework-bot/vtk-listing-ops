import { ChevronLeft, ChevronRight, Menu } from "lucide-react";

interface BatchProgressProps {
  batchName: string;
  currentIndex: number;
  totalItems: number;
  onNext?: () => void;
  onPrev?: () => void;
}

export function BatchProgress({ 
  batchName, 
  currentIndex, 
  totalItems, 
  onNext, 
  onPrev 
}: BatchProgressProps) {
  const progressPercent = Math.round((currentIndex / totalItems) * 100);
  
  return (
    <div className="flex items-center justify-between w-full h-12 px-6 bg-white border-b border-gray-200 shrink-0">
      <div className="flex items-center w-[300px]">
        <span className="font-medium text-gray-500 text-sm">Batch: {batchName}</span>
      </div>
      
      <div className="flex items-center gap-6 justify-center flex-1">
        <button 
          onClick={onPrev}
          disabled={currentIndex <= 1}
          className="p-1 rounded-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900"
          title="Previous Item"
          data-testid="btn-prev-item"
        >
          <ChevronLeft size={20} strokeWidth={2.5} />
        </button>
        <span className="font-bold text-base text-gray-900">
          Item {currentIndex} of {totalItems}
        </span>
        <button 
          onClick={onNext}
          disabled={currentIndex >= totalItems}
          className="p-1 rounded-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900"
          title="Next Item"
          data-testid="btn-next-item"
        >
          <ChevronRight size={20} strokeWidth={2.5} />
        </button>
      </div>
      
      <div className="flex items-center justify-end w-[320px] gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">Progress</span>
          <div className="w-16 h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-xs font-bold text-gray-700">{progressPercent}%</span>
        </div>
        <button className="border border-gray-300 text-gray-600 text-xs px-2 py-0.5 rounded-full hover:bg-gray-50 flex items-center gap-1 font-medium">
          <span className="px-1 text-[10px] font-mono opacity-60">F1</span> Shortcuts
        </button>
        <button className="p-1 text-gray-600 hover:bg-gray-100 rounded">
          <Menu size={20} />
        </button>
      </div>
    </div>
  );
}

import { ChevronLeft, ChevronRight } from "lucide-react";

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
      <div className="flex items-center gap-4">
        <span className="font-medium text-gray-900 text-sm">{batchName}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            Item {currentIndex} of {totalItems}
          </span>
          <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2 text-gray-500">
        <button 
          onClick={onPrev}
          disabled={currentIndex <= 1}
          className="p-1 rounded-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Previous Item"
          data-testid="btn-prev-item"
        >
          <ChevronLeft size={18} />
        </button>
        <button 
          onClick={onNext}
          disabled={currentIndex >= totalItems}
          className="p-1 rounded-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Next Item"
          data-testid="btn-next-item"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

import { Save } from "lucide-react";

interface SaveNextButtonProps {
  isReady: boolean;
  onClick: () => void;
}

export function SaveNextButton({ isReady, onClick }: SaveNextButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center justify-center gap-2 py-4 px-6 rounded-md font-bold text-lg transition-all duration-200 shadow-sm
        ${isReady 
          ? "bg-primary text-white hover:bg-emerald-700 hover:shadow active:scale-[0.98]" 
          : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
        }
      `}
      data-testid="btn-save-next"
    >
      <Save size={22} />
      SAVE & NEXT
    </button>
  );
}

interface SaveNextButtonProps {
  isReady: boolean;
  isSubmitting?: boolean;
  onClick: () => void;
}

export function SaveNextButton({ isReady, isSubmitting = false, onClick }: SaveNextButtonProps) {
  const isDisabled = !isReady || isSubmitting;

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={`
        w-full flex flex-col items-center justify-center gap-0.5 py-4 px-6 rounded-md font-bold text-lg transition-all duration-200 shadow-sm
        ${!isDisabled
          ? "bg-emerald-700 text-white hover:bg-emerald-800 hover:shadow active:scale-[0.98]" 
          : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
        }
      `}
      data-testid="btn-save-next"
    >
      <span>{isSubmitting ? "SAVING..." : "SAVE & NEXT"}</span>
      <span className={`text-xs font-normal tracking-wide ${!isDisabled ? 'text-emerald-100' : 'text-gray-400'}`}>
        Enter
      </span>
    </button>
  );
}

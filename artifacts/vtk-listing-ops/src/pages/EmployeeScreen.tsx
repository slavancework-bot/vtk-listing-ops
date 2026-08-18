import { useState, useEffect, useCallback } from "react";
import { AppHeader } from "../components/AppHeader";
import { BatchProgress } from "../components/BatchProgress";
import { ItemIdentityCard } from "../components/ItemIdentityCard";
import { IncludedQuestionCard } from "../components/IncludedQuestionCard";
import { ConditionSelector } from "../components/ConditionSelector";
import { StatusPanel } from "../components/StatusPanel";
import { SaveNextButton } from "../components/SaveNextButton";
import { SkipPanel } from "../components/SkipPanel";
import { KeyboardHelpOverlay } from "../components/KeyboardHelpOverlay";
import { MOCK_SCENARIOS, ConditionValue } from "../data/mockData";
import { CheckCircle2, Keyboard } from "lucide-react";

export default function EmployeeScreen() {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const scenario = MOCK_SCENARIOS[scenarioIndex];

  const [selectedIncluded, setSelectedIncluded] = useState<Set<number>>(new Set(scenario.preSelectedIncluded));
  const [selectedCondition, setSelectedCondition] = useState<ConditionValue>(scenario.preSelectedCondition);
  const [employeeNotes, setEmployeeNotes] = useState("");
  const [includedDecisionMade, setIncludedDecisionMade] = useState(false);
  
  const [showSkipPanel, setShowSkipPanel] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [validationErrors, setValidationErrors] = useState(false);

  // Initialize state when scenario changes
  useEffect(() => {
    setSelectedIncluded(new Set(scenario.preSelectedIncluded));
    setSelectedCondition(scenario.preSelectedCondition);
    setEmployeeNotes("");
    setIncludedDecisionMade(false);
    setShowSkipPanel(false);
    setValidationErrors(false);
  }, [scenarioIndex, scenario]);

  const totalQuestions = scenario.includedQuestions.length;
  const isIncludedComplete = totalQuestions === 0 || selectedIncluded.size > 0 || includedDecisionMade;
  const isConditionComplete = !scenario.conditionRequired || selectedCondition !== null;
  const isReady = isIncludedComplete && isConditionComplete;

  const toggleIncluded = (id: number) => {
    setSelectedIncluded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setIncludedDecisionMade(false); // reset none if they check something
  };

  const loadNextScenario = useCallback(() => {
    setScenarioIndex(prev => (prev + 1) % MOCK_SCENARIOS.length);
  }, []);

  const handleSaveNext = useCallback(() => {
    if (!isReady) {
      setValidationErrors(true);
      setTimeout(() => setValidationErrors(false), 800);
      return;
    }
    
    setShowSuccessToast(true);
    setTimeout(() => {
      setShowSuccessToast(false);
      loadNextScenario();
    }, 1000);
  }, [isReady, loadNextScenario]);

  const handleSkipConfirm = (reason: string, notes: string) => {
    console.log("Skipped", reason, notes);
    loadNextScenario();
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      if (e.key === '?') {
        setShowHelp(true);
        e.preventDefault();
        return;
      }
      
      if (e.key === 'F2') { 
        setShowSkipPanel(true); 
        e.preventDefault(); 
        return; 
      }

      if (showHelp || showSkipPanel || showSuccessToast) {
        return; // Disable main shortcuts while overlays are open
      }

      // 1-9, 0 for included items
      const keyNum = parseInt(e.key);
      if (!isNaN(keyNum)) {
        let index = keyNum === 0 ? 9 : keyNum - 1;
        const item = scenario.includedQuestions[index];
        if (item) {
          toggleIncluded(item.id);
          e.preventDefault();
        }
      }

      // A, B, C, D for conditions
      const keyUpper = e.key.toUpperCase();
      if (['A', 'B', 'C', 'D'].includes(keyUpper) && scenario.conditionRequired) {
        setSelectedCondition(keyUpper as ConditionValue);
        e.preventDefault();
      }

      // Enter for Save & Next
      if (e.key === 'Enter') {
        handleSaveNext();
        e.preventDefault();
      }

      // S for Skip
      if (e.key.toUpperCase() === 'S') {
        setShowSkipPanel(true);
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scenario, showHelp, showSkipPanel, showSuccessToast, handleSaveNext]);

  return (
    <div className="fixed inset-0 bg-gray-50 flex flex-col font-sans overflow-hidden">
      <AppHeader />
      <BatchProgress 
        batchName="2026-08-18-Core-Switches" 
        currentIndex={scenarioIndex === 0 ? 14 : scenarioIndex + 1} 
        totalItems={31}
        onNext={loadNextScenario}
        onPrev={() => setScenarioIndex(prev => prev === 0 ? MOCK_SCENARIOS.length - 1 : prev - 1)}
      />

      {/* Success Toast */}
      {showSuccessToast && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-50 bg-emerald-700 text-white px-6 py-3 rounded-md shadow-lg font-bold flex items-center gap-3 animate-in slide-in-from-top-4 fade-in">
          <CheckCircle2 size={24} />
          Saved ✓ — Loading next item...
        </div>
      )}

      {/* Main 3-column Layout */}
      <main className="flex-1 flex overflow-hidden p-6 gap-6 max-w-[1920px] mx-auto w-full">
        
        {/* LEFT COLUMN: Identity (~20%) */}
        <div className="w-[300px] xl:w-[350px] shrink-0 flex flex-col h-full bg-white border border-gray-200 rounded-lg p-6 shadow-sm min-h-0">
          <ItemIdentityCard {...scenario} />
        </div>

        {/* CENTER COLUMN: Verification (~50%) */}
        <div className="flex-1 flex flex-col h-full bg-white border border-gray-200 rounded-lg p-5 shadow-sm min-h-0">
          
          {scenario.includedQuestions.length > 0 ? (
            <div className="mb-4">
              <div className="mb-4 flex items-baseline gap-2">
                <h2 className="text-sm font-bold text-emerald-700 tracking-wide uppercase">WHAT'S INCLUDED?</h2>
                <p className="text-xs text-gray-400">(Check all that apply)</p>
              </div>
              
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {scenario.includedQuestions.map((item, idx) => (
                  <IncludedQuestionCard 
                    key={item.id}
                    item={item}
                    index={idx}
                    isSelected={selectedIncluded.has(item.id)}
                    onToggle={() => toggleIncluded(item.id)}
                    showError={false}
                  />
                ))}
              </div>
              
              {totalQuestions > 0 && selectedIncluded.size === 0 && !includedDecisionMade && (
                <button 
                  onClick={() => setIncludedDecisionMade(true)}
                  className="border border-gray-300 text-gray-500 text-xs px-3 py-2 rounded-md hover:bg-gray-50 w-full mt-3 font-medium transition-colors"
                >
                  NONE OF THESE ARE INCLUDED
                </button>
              )}
            </div>
          ) : (
            <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-md text-center text-gray-600 text-sm">
              No inclusion verification required for this item.
            </div>
          )}

          {scenario.conditionRequired && (
            <div className="mb-4 mt-auto">
              <ConditionSelector 
                selected={selectedCondition} 
                onSelect={setSelectedCondition}
                showError={validationErrors && !selectedCondition}
              />
            </div>
          )}

          <div className="flex gap-4 mt-auto pt-4 border-t border-gray-100">
            <div className="flex flex-col gap-1 w-24 shrink-0">
               <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">QTY TO LIST</label>
               <div className="flex border border-gray-200 rounded-md overflow-hidden h-[34px]">
                 <button className="w-8 hover:bg-gray-50 flex items-center justify-center text-gray-500 border-r border-gray-200">−</button>
                 <div className="flex-1 flex items-center justify-center font-medium text-sm">1</div>
                 <button className="w-8 hover:bg-gray-50 flex items-center justify-center text-gray-500 border-l border-gray-200">+</button>
               </div>
            </div>
            
            <div className="flex flex-col gap-1 w-32 shrink-0">
               <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">CHECK COUNT?</label>
               <select className="h-[34px] border border-gray-200 rounded-md text-sm px-2 focus:outline-none focus:ring-1 focus:ring-emerald-600 bg-white cursor-pointer text-gray-900">
                 <option>TRUE</option>
                 <option>FALSE</option>
               </select>
            </div>
            
            <div className="flex flex-col gap-1 w-24 shrink-0">
               <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">STOCK TOTAL</label>
               <div className="h-[34px] border border-gray-200 rounded-md text-sm px-3 flex items-center justify-center bg-white text-gray-900 font-medium">
                 1
               </div>
            </div>

            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">OTHER NOTES <span className="text-gray-400 normal-case font-normal">(optional)</span></label>
              <textarea 
                className="w-full px-3 py-1.5 border border-gray-200 rounded-md text-sm min-h-[34px] focus:outline-none focus:ring-1 focus:ring-emerald-600 resize-none bg-white placeholder:text-gray-300"
                placeholder="e.g. minor scratches"
                value={employeeNotes}
                onChange={(e) => setEmployeeNotes(e.target.value)}
                rows={1}
              />
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Actions (~30%) */}
        <div className="w-[320px] xl:w-[350px] shrink-0 flex flex-col gap-6 h-full min-h-0">
          
          <StatusPanel 
            inclusionComplete={isIncludedComplete}
            conditionComplete={isConditionComplete}
            conditionSelected={selectedCondition}
            isReady={isReady}
            selectedCount={selectedIncluded.size}
            totalQuestions={totalQuestions}
          />

          <div className="flex flex-col gap-3 mt-auto">
            {validationErrors && (
              <div className="text-center text-destructive font-semibold text-sm animate-pulse">
                Please complete required fields.
              </div>
            )}
            
            <SaveNextButton isReady={isReady} onClick={handleSaveNext} />
            
            {!showSkipPanel ? (
              <button 
                onClick={() => setShowSkipPanel(true)}
                className="w-full flex flex-col items-center justify-center py-3.5 px-6 rounded-md font-bold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-colors shadow-sm"
              >
                <span>SKIP / NEEDS REVIEW</span>
                <span className="text-xs font-normal text-gray-400 mt-0.5 tracking-wide">F2</span>
              </button>
            ) : (
              <SkipPanel 
                onCancel={() => setShowSkipPanel(false)}
                onConfirm={handleSkipConfirm}
              />
            )}
          </div>
        </div>

      </main>

      {/* Keyboard Shortcut Strip */}
      <div className="h-10 bg-gray-900 text-gray-400 text-xs flex items-center justify-center gap-8 shrink-0">
        <div className="flex items-center gap-2 text-emerald-600 font-bold uppercase tracking-wider">
          <Keyboard size={16} />
          KEYBOARD SHORTCUTS
        </div>
        <div className="flex items-center gap-6">
          <span><span className="text-gray-200">1-8</span> Select Items</span>
          <span><span className="text-gray-200">A-D</span> Condition</span>
          <span><span className="text-gray-200">Enter</span> Save & Next</span>
          <span><span className="text-gray-200">S</span> Skip</span>
          <span><span className="text-gray-200">F2</span> Needs Review</span>
          <button onClick={() => setShowHelp(true)} className="hover:text-white transition-colors cursor-pointer flex items-center gap-1">
            <span className="text-gray-200">F1</span> Help
          </button>
        </div>
      </div>

      <KeyboardHelpOverlay isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}

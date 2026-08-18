import { useState, useEffect, useCallback } from "react";
import { AppHeader } from "../components/AppHeader";
import { BatchProgress } from "../components/BatchProgress";
import { ItemIdentityCard } from "../components/ItemIdentityCard";
import { IncludedQuestionCard } from "../components/IncludedQuestionCard";
import { ConditionSelector } from "../components/ConditionSelector";
import { ConditionalField } from "../components/ConditionalField";
import { StatusPanel } from "../components/StatusPanel";
import { SaveNextButton } from "../components/SaveNextButton";
import { SkipPanel } from "../components/SkipPanel";
import { KeyboardHelpOverlay } from "../components/KeyboardHelpOverlay";
import { MOCK_SCENARIOS, ConditionValue } from "../data/mockData";
import { CheckCircle2 } from "lucide-react";

export default function EmployeeScreen() {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const scenario = MOCK_SCENARIOS[scenarioIndex];

  const [selectedIncluded, setSelectedIncluded] = useState<Set<number>>(new Set(scenario.preSelectedIncluded));
  const [selectedCondition, setSelectedCondition] = useState<ConditionValue>(scenario.preSelectedCondition);
  const [conditionalValues, setConditionalValues] = useState<Record<string, string>>({});
  const [employeeNotes, setEmployeeNotes] = useState("");
  
  const [showSkipPanel, setShowSkipPanel] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [validationErrors, setValidationErrors] = useState(false);

  // Initialize state when scenario changes
  useEffect(() => {
    setSelectedIncluded(new Set(scenario.preSelectedIncluded));
    setSelectedCondition(scenario.preSelectedCondition);
    setConditionalValues({});
    setEmployeeNotes("");
    setShowSkipPanel(false);
    setValidationErrors(false);
  }, [scenarioIndex, scenario]);

  const totalQuestions = scenario.includedQuestions.length;
  const isIncludedComplete = totalQuestions === 0 || true; // In real app, might require specific checks, here we just verify it exists
  const isConditionComplete = !scenario.conditionRequired || selectedCondition !== null;
  const isReady = isConditionComplete;

  const toggleIncluded = (id: number) => {
    setSelectedIncluded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === '?') {
        setShowHelp(true);
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
        batchName="Batch 2024-08-18 AM" 
        currentIndex={scenarioIndex + 1} 
        totalItems={MOCK_SCENARIOS.length}
        onNext={loadNextScenario}
        onPrev={() => setScenarioIndex(prev => prev === 0 ? MOCK_SCENARIOS.length - 1 : prev - 1)}
      />

      {/* Success Toast */}
      {showSuccessToast && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-50 bg-primary text-white px-6 py-3 rounded-md shadow-lg font-bold flex items-center gap-3 animate-in slide-in-from-top-4 fade-in">
          <CheckCircle2 size={24} />
          Saved ✓ — Loading next item...
        </div>
      )}

      {/* Main 3-column Layout */}
      <main className="flex-1 flex overflow-hidden p-6 gap-6 max-w-[1920px] mx-auto w-full">
        
        {/* LEFT COLUMN: Identity (~20%) */}
        <div className="w-[300px] xl:w-[350px] shrink-0 flex flex-col h-full bg-white border border-gray-200 rounded-lg p-6 shadow-sm overflow-y-auto">
          <ItemIdentityCard {...scenario} />
        </div>

        {/* CENTER COLUMN: Verification (~50%) */}
        <div className="flex-1 flex flex-col h-full bg-white border border-gray-200 rounded-lg p-8 shadow-sm overflow-y-auto">
          
          {scenario.includedQuestions.length > 0 ? (
            <div className="mb-10">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">WHAT'S INCLUDED?</h2>
                <p className="text-sm text-gray-500">Check all that apply.</p>
              </div>
              
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
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
            </div>
          ) : (
            <div className="mb-10 p-6 bg-gray-50 border border-gray-200 rounded-md text-center text-gray-600">
              No inclusion verification required for this item.
            </div>
          )}

          {scenario.conditionRequired && (
            <div className="mb-8">
              <ConditionSelector 
                selected={selectedCondition} 
                onSelect={setSelectedCondition}
                showError={validationErrors && !selectedCondition}
              />
            </div>
          )}

          {scenario.conditionalField && (
            <div className="mb-8">
              <ConditionalField 
                config={scenario.conditionalField}
                value={conditionalValues[scenario.conditionalField.id] || ''}
                onChange={(v) => setConditionalValues(prev => ({...prev, [scenario.conditionalField.id]: v}))}
              />
            </div>
          )}

          <div className="mt-auto pt-6">
            <label className="text-sm font-semibold text-gray-700 block mb-2">Employee Notes (Optional)</label>
            <textarea 
              className="w-full p-3 border border-gray-300 rounded-md text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-primary resize-none bg-gray-50"
              placeholder="Add any additional details or issues found during physical inspection..."
              value={employeeNotes}
              onChange={(e) => setEmployeeNotes(e.target.value)}
            />
          </div>
        </div>

        {/* RIGHT COLUMN: Actions (~30%) */}
        <div className="w-[320px] xl:w-[400px] shrink-0 flex flex-col gap-6 h-full overflow-y-auto">
          
          <StatusPanel 
            inclusionComplete={isIncludedComplete}
            conditionComplete={isConditionComplete}
            conditionSelected={selectedCondition}
            isReady={isReady}
          />

          <div className="flex flex-col gap-4 mt-auto">
            {validationErrors && (
              <div className="text-center text-destructive font-semibold text-sm animate-pulse">
                Please complete required fields.
              </div>
            )}
            
            <SaveNextButton isReady={isReady} onClick={handleSaveNext} />
            
            {!showSkipPanel ? (
              <button 
                onClick={() => setShowSkipPanel(true)}
                className="w-full py-3 px-6 rounded-md font-bold text-gray-600 border-2 border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-colors"
              >
                SKIP / NEEDS REVIEW
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
      <div className="h-8 bg-gray-900 text-gray-400 text-xs flex items-center justify-center gap-6 font-mono tracking-wide shrink-0">
        <span><kbd className="text-gray-200">1-9</kbd> Items</span>
        <span>•</span>
        <span><kbd className="text-gray-200">A/B/C/D</kbd> Condition</span>
        <span>•</span>
        <span><kbd className="text-gray-200">Enter</kbd> Save</span>
        <span>•</span>
        <span><kbd className="text-gray-200">S</kbd> Skip</span>
        <span>•</span>
        <button onClick={() => setShowHelp(true)} className="hover:text-white transition-colors cursor-pointer">
          <kbd className="text-gray-200">?</kbd> Help
        </button>
      </div>

      <KeyboardHelpOverlay isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}

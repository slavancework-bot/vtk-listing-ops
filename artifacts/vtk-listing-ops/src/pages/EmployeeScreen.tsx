import { useState, useEffect, useCallback, useRef } from "react";
import { AppHeader } from "../components/AppHeader";
import { BatchProgress } from "../components/BatchProgress";
import { ItemIdentityCard } from "../components/ItemIdentityCard";
import { IncludedQuestionCard } from "../components/IncludedQuestionCard";
import { ConditionSelector } from "../components/ConditionSelector";
import { StatusPanel } from "../components/StatusPanel";
import { SaveNextButton } from "../components/SaveNextButton";
import { KeyboardHelpOverlay } from "../components/KeyboardHelpOverlay";
import { MOCK_SCENARIOS, ConditionValue, ItemScenario } from "../data/mockData";
import { loadBatch, loadProgress, saveDraft, saveFinal, toScenario, type ServerProgress } from "../data/serverApi";
import { CONDITION_SHORTCUTS, getIncludedShortcut, getIncludedShortcuts } from "../data/keyboardShortcuts";
import { CheckCircle2, Keyboard, AlertTriangle, Flag } from "lucide-react";
import {
  validateEmployeeAnswer,
  type BatchId,
  type ConditionalFieldId,
  type EmployeeId,
  type IncludedQuestionId,
  type ItemDraft,
  type ListingItem,
  type ListingItemId,
} from "@workspace/domain";

const MOCK_BATCH_NAME = '2026-08-18-Core-Switches';

function toListingItem(scenario: ItemScenario, batchName = MOCK_BATCH_NAME, version = 1): ListingItem {
  return {
    id: scenario.id as ListingItemId,
    batchId: batchName as BatchId,
    sourceRowId: scenario.id,
    sku: scenario.sku,
    manufacturer: scenario.manufacturer,
    model: scenario.model,
    mpn: scenario.mpn,
    title: scenario.productName,
    shortDescription: scenario.shortDescription,
    includedQuestions: scenario.includedQuestions.map((question, index) => ({
      id: String(question.id) as IncludedQuestionId,
      label: question.label,
      displayOrder: index + 1,
      required: true,
      shortcutPosition: index < 10 ? index + 1 : undefined,
      important: question.important,
    })),
    conditionRequired: scenario.conditionRequired,
    conditionalFields: scenario.conditionalFields.map((field, index) => ({
      id: field.key as ConditionalFieldId,
      kind: field.key === "qtyToList" ? "qty_to_list" : field.key === "checkCount" ? "check_count" : field.key === "stockTotal" ? "stock_total" : "other_notes",
      type: field.key === "qtyToList" || field.key === "stockTotal" ? "number" : field.key === "checkCount" ? "boolean" : "text",
      label: field.label,
      displayOrder: index + 1,
      required: field.required,
      editable: field.key !== "stockTotal",
      validation: field.key === "qtyToList" ? { kind: "number", integer: true, min: 1 } : undefined,
      defaultValue: field.defaultValue,
    })),
    sourceInventoryFields: {},
    warnings: scenario.scenarioNote ? [scenario.scenarioNote] : [],
    workflowStatus: "ready_for_employee",
    version,
  };
}

function createDefaultItemDraft(scenario: ItemScenario, version = 1): ItemDraft {
  const now = new Date().toISOString();
  return {
    itemId: scenario.id as ListingItemId,
    itemVersion: version,
    includedItems: {
      selectedQuestionIds: scenario.preSelectedIncluded.map((id) => String(id) as IncludedQuestionId),
      explicitlyNone: false,
    },
    conditionCode: scenario.preSelectedCondition,
    fieldValues: {
      qtyToList: scenario.conditionalFields.find(f => f.key === 'qtyToList')?.defaultValue ?? '1',
      checkCount: scenario.conditionalFields.find(f => f.key === 'checkCount')?.defaultValue ?? 'TRUE',
      stockTotal: scenario.conditionalFields.find(f => f.key === 'stockTotal')?.defaultValue ?? '',
      otherNotes: '',
    },
    notes: '',
    employeeId: 'development-employee' as EmployeeId,
    status: 'new',
    createdAt: now,
    updatedAt: now,
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(
    target.closest('input, textarea, select, [contenteditable="true"]')
  );
}

function formatIncludedShortcutLabel(shortcuts: string[]): string {
  if (shortcuts.length === 0) return '';
  if (shortcuts.length === 1) return shortcuts[0];
  if (shortcuts.length === 10) return '1–9, 0';
  return `${shortcuts[0]}–${shortcuts[shortcuts.length - 1]}`;
}

function findNextPendingIndex(stateMap: Map<number, ItemDraft>, currentIndex: number, totalItems: number): number {
  for (let offset = 1; offset <= totalItems; offset += 1) {
    const index = (currentIndex + offset) % totalItems;
    if (!['submitted', 'needs_review'].includes(stateMap.get(index)?.status ?? 'new')) {
      return index;
    }
  }
  return currentIndex;
}

export default function EmployeeScreen() {
  const requestedBatchId = new URLSearchParams(window.location.search).get("batchId");
  const serverMode = Boolean(requestedBatchId);
  const [scenarios,setScenarios]=useState<ItemScenario[]>(MOCK_SCENARIOS);
  const [versions,setVersions]=useState<number[]>(MOCK_SCENARIOS.map(()=>1));
  const [batchName,setBatchName]=useState(MOCK_BATCH_NAME);
  const [serverProgress,setServerProgress]=useState<ServerProgress|null>(null);
  const [loadError,setLoadError]=useState<string|null>(null);
  const [itemStates, setItemStates] = useState<Map<number, ItemDraft>>(() => new Map());
  const itemStatesRef = useRef<Map<number, ItemDraft>>(new Map());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [batchComplete, setBatchComplete] = useState(false);
  
  const [showHelp, setShowHelp] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showReviewToast, setShowReviewToast] = useState(false);
  const [validationErrors, setValidationErrors] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const transitionLockRef = useRef(false);
  const draftVersionsRef=useRef(new Map<string,number>());
  const draftSaveChainsRef=useRef(new Map<string,Promise<void>>());
  const operationKeysRef=useRef(new Map<string,{key:string;payload:string}>());

  const TOTAL_ITEMS = scenarios.length;
  const scenario = scenarios[currentIndex];

  useEffect(()=>{if(!requestedBatchId)return;loadBatch(requestedBatchId).then(({batch,items})=>{setBatchName(batch.name);setServerProgress(batch.progress);setScenarios(items.map(toScenario));setVersions(items.map((item)=>item.version));const restored=new Map<number,ItemDraft>();const draftVersions=new Map<string,number>();items.forEach((item,index)=>{draftVersions.set(item.id,item.draftVersion);if(item.draft)restored.set(index,{...item.draft,itemVersion:item.version,status:item.status==="completed"?"submitted":item.status==="needs_review"?"needs_review":"restored"});});draftVersionsRef.current=draftVersions;itemStatesRef.current=restored;setItemStates(restored);setBatchComplete(batch.progress.complete);}).catch((error)=>setLoadError(error instanceof Error?error.message:"Unable to load batch."));},[requestedBatchId]);

  const persistDraft=useCallback((draft:ItemDraft)=>{const prior=(draftSaveChainsRef.current.get(draft.itemId)??Promise.resolve()).catch(()=>undefined);const next=prior.then(async()=>{const result=await saveDraft(draft.itemId,draft,draftVersionsRef.current.get(draft.itemId)??0);draftVersionsRef.current.set(draft.itemId,result.draftVersion);});draftSaveChainsRef.current.set(draft.itemId,next);return next.finally(()=>{if(draftSaveChainsRef.current.get(draft.itemId)===next)draftSaveChainsRef.current.delete(draft.itemId);});},[]);

  function getItemState(index: number, scenarioData: ItemScenario, stateMap = itemStates): ItemDraft {
    return stateMap.get(index) ?? createDefaultItemDraft(scenarioData, versions[index] ?? 1);
  }

  const currentState = getItemState(currentIndex, scenario);
  const selectedIncluded = new Set(currentState.includedItems.selectedQuestionIds.map(String));
  const includedDecisionMade = currentState.includedItems.explicitlyNone;
  const selectedCondition = currentState.conditionCode;
  const fieldValues = currentState.fieldValues;

  function updateCurrentState(patch: Partial<ItemDraft>) {
    const next = new Map(itemStatesRef.current);
    const current = next.get(currentIndex) ?? createDefaultItemDraft(scenario, versions[currentIndex] ?? 1);
    next.set(currentIndex, { ...current, ...patch, status: current.status === 'new' ? 'editing' : current.status, updatedAt: new Date().toISOString() });
    itemStatesRef.current = next;
    setItemStates(next);
  }

  const totalQuestions = scenario.includedQuestions.length;
  const validation = validateEmployeeAnswer(toListingItem(scenario, requestedBatchId ?? MOCK_BATCH_NAME, versions[currentIndex] ?? 1), currentState);
  const isIncludedComplete = !validation.fieldErrors.includedItems;
  const isConditionComplete = !validation.fieldErrors.conditionCode;
  const isReady = validation.valid;

  const missingItems: string[] = [];
  if (totalQuestions > 0 && !isIncludedComplete) missingItems.push('Included items');
  if (!isConditionComplete) missingItems.push('Condition');
  scenario.conditionalFields.filter(f => f.required).forEach(f => {
    const val = String(fieldValues[f.key] ?? '').trim();
    const incomplete = f.key === 'qtyToList' ? (val === '' || parseInt(val) <= 0) : val === '';
    if (incomplete && f.key !== 'checkCount') {
      missingItems.push(f.key === 'qtyToList' ? 'Qty To List (must be greater than 0)' : f.label);
    }
  });

  const toggleIncluded = (id: number) => {
    const next = new Map(itemStatesRef.current);
    const current = next.get(currentIndex) ?? createDefaultItemDraft(scenario, versions[currentIndex] ?? 1);
    const questionId = String(id) as IncludedQuestionId;
    const selected = new Set(current.includedItems.selectedQuestionIds);
    if (selected.has(questionId)) selected.delete(questionId); else selected.add(questionId);
    next.set(currentIndex, {
      ...current,
      includedItems: { selectedQuestionIds: Array.from(selected), explicitlyNone: false },
      status: current.status === 'new' ? 'editing' : current.status,
      updatedAt: new Date().toISOString(),
    });
    itemStatesRef.current = next;
    setItemStates(next);
  };

  const handleSetCondition = (c: ConditionValue) => {
    updateCurrentState({ conditionCode: c });
  };

  const handleFieldChange = (key: string, value: string) => {
    updateCurrentState({ fieldValues: { ...fieldValues, [key]: value } });
  };

  const handleQtyChange = (delta: number) => {
    const parsed = parseInt(String(fieldValues.qtyToList));
    const current = Number.isNaN(parsed) ? 0 : parsed;
    const next = Math.max(0, current + delta);
    handleFieldChange('qtyToList', String(next));
  };

  const navigateTo = useCallback(async (targetIndex: number) => {
    if (transitionLockRef.current || targetIndex < 0 || targetIndex >= TOTAL_ITEMS) return;
    const leaving=itemStatesRef.current.get(currentIndex);
    if(serverMode&&leaving?.status==="editing"){try{await persistDraft(leaving);}catch(error){setLoadError(error instanceof Error?`Draft not saved: ${error.message}`:"Draft not saved.");return;}}
    setCurrentIndex(targetIndex);
    setValidationErrors(false);
    setShowSuccessToast(false);
    setShowReviewToast(false);
  }, [TOTAL_ITEMS,currentIndex,serverMode,persistDraft]);

  const refreshProgress = useCallback(async()=>{if(!requestedBatchId)return null;const value=await loadProgress(requestedBatchId);setServerProgress(value);setBatchComplete(value.complete);return value;},[requestedBatchId]);

  useEffect(()=>{if(!serverMode||currentState.status!=="editing")return;const snapshot=currentState;const timer=window.setTimeout(()=>{persistDraft(snapshot).catch((error)=>setLoadError(error instanceof Error?`Draft not saved: ${error.message}`:"Draft not saved."));},600);return()=>window.clearTimeout(timer);},[serverMode,currentState,persistDraft]);

  const handleSaveNext = useCallback(async () => {
    if (!isReady || transitionLockRef.current) {
      if (!isReady && !transitionLockRef.current) {
        setValidationErrors(true);
        setTimeout(() => setValidationErrors(false), 1200);
      }
      return;
    }

    transitionLockRef.current = true;
    setIsSubmitting(true);

    let authoritativeVersion=validation.normalizedAnswer.itemVersion+1;
    let authoritativeNextId:string|null=null;
    const operationId=`answer:${validation.normalizedAnswer.itemId}`;const payload=JSON.stringify(validation.normalizedAnswer);const priorOperation=operationKeysRef.current.get(operationId);const operation=priorOperation?.payload===payload?priorOperation:{key:crypto.randomUUID(),payload};operationKeysRef.current.set(operationId,operation);const operationKey=operation.key;
    try { if(serverMode){await (draftSaveChainsRef.current.get(validation.normalizedAnswer.itemId)??Promise.resolve());const result=await saveFinal(validation.normalizedAnswer.itemId,validation.normalizedAnswer,false,operationKey);authoritativeVersion=result.itemVersion;authoritativeNextId=result.nextItemId;operationKeysRef.current.delete(operationId);} } catch(error){transitionLockRef.current=false;setIsSubmitting(false);setLoadError(error instanceof Error?error.message:"Save failed. Retry when the service is available.");return;}
    const nextStates = new Map(itemStatesRef.current);
    nextStates.set(currentIndex, {
      ...validation.normalizedAnswer,
      status: 'submitted', itemVersion: authoritativeVersion,
    });
    itemStatesRef.current = nextStates;
    setItemStates(nextStates);
    const localComplete = Array.from(nextStates.values()).filter(
      state => state.status === 'submitted' || state.status === 'needs_review'
    ).length === TOTAL_ITEMS;
    let refreshed=null;try{refreshed=serverMode?await refreshProgress():null;}catch{setLoadError("Item saved. Progress could not refresh; reload to reconcile.");}
    const batchIsComplete = refreshed?.complete ?? localComplete;
    const serverNextIndex=authoritativeNextId?scenarios.findIndex((value)=>value.id===authoritativeNextId):-1;
    const nextPendingIndex = batchIsComplete
      ? currentIndex
      : serverNextIndex>=0?serverNextIndex:findNextPendingIndex(nextStates, currentIndex, TOTAL_ITEMS);
    
    setShowSuccessToast(true);
    setTimeout(() => {
      setShowSuccessToast(false);
      transitionLockRef.current = false;
      setIsSubmitting(false);
      if (batchIsComplete) {
        setBatchComplete(true);
      } else {
        navigateTo(nextPendingIndex);
      }
    }, 900);
  }, [isReady, currentIndex, navigateTo, validation.normalizedAnswer, serverMode, refreshProgress, scenarios, TOTAL_ITEMS]);

  const handleNeedsReview = useCallback(async () => {
    if (transitionLockRef.current) return;

    transitionLockRef.current = true;
    setIsSubmitting(true);

    const candidateDraft=itemStatesRef.current.get(currentIndex) ?? createDefaultItemDraft(scenario,versions[currentIndex]??1);
    const operationId=`review:${candidateDraft.itemId}`;const priorOperation=operationKeysRef.current.get(operationId);
    const draft=priorOperation?JSON.parse(priorOperation.payload) as ItemDraft:candidateDraft;
    let authoritativeVersion=draft.itemVersion+1;let authoritativeNextId:string|null=null;
    const payload=JSON.stringify(draft);const operation=priorOperation??{key:crypto.randomUUID(),payload};operationKeysRef.current.set(operationId,operation);const operationKey=operation.key;
    try{if(serverMode){await (draftSaveChainsRef.current.get(draft.itemId)??Promise.resolve());const result=await saveFinal(draft.itemId,draft,true,operationKey);authoritativeVersion=result.itemVersion;authoritativeNextId=result.nextItemId;operationKeysRef.current.delete(operationId);}}catch(error){transitionLockRef.current=false;setIsSubmitting(false);setLoadError(error instanceof Error?error.message:"Needs Review was not saved. Retry.");return;}
    const nextStates = new Map(itemStatesRef.current);
    nextStates.set(currentIndex, {
      ...draft, status: 'needs_review', itemVersion:authoritativeVersion,
    });
    itemStatesRef.current = nextStates;
    setItemStates(nextStates);
    const localComplete = Array.from(nextStates.values()).filter(
      state => state.status === 'submitted' || state.status === 'needs_review'
    ).length === TOTAL_ITEMS;
    let refreshed=null;try{refreshed=serverMode?await refreshProgress():null;}catch{setLoadError("Review saved. Progress could not refresh; reload to reconcile.");}const batchIsComplete=refreshed?.complete??localComplete;
    const serverNextIndex=authoritativeNextId?scenarios.findIndex((value)=>value.id===authoritativeNextId):-1;
    const nextPendingIndex = batchIsComplete
      ? currentIndex
      : serverNextIndex>=0?serverNextIndex:findNextPendingIndex(nextStates, currentIndex,TOTAL_ITEMS);
    
    setShowReviewToast(true);
    setTimeout(() => {
      setShowReviewToast(false);
      transitionLockRef.current = false;
      setIsSubmitting(false);
      if (batchIsComplete) {
        setBatchComplete(true);
      } else {
        navigateTo(nextPendingIndex);
      }
    }, 900);
  }, [currentIndex, scenario, navigateTo,serverMode,refreshProgress,scenarios,versions,TOTAL_ITEMS]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        batchComplete ||
        showHelp ||
        showSuccessToast ||
        showReviewToast ||
        e.repeat ||
        e.isComposing ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        isEditableTarget(e.target)
      ) {
        return;
      }

      if (e.key === 'F1' || e.key === '?') {
        e.preventDefault();
        setShowHelp(true);
        return;
      }

      if (e.key === 'F2') {
        e.preventDefault();
        handleNeedsReview();
        return;
      }

      if (e.key === 'Enter') {
        if (e.target instanceof HTMLElement && e.target.closest('button, a, input[type="checkbox"], input[type="radio"]')) {
          return;
        }
        e.preventDefault();
        handleSaveNext();
        return;
      }

      const shortcutIndex = scenario.includedQuestions.findIndex((_, index) => getIncludedShortcut(index) === e.key);
      if (shortcutIndex !== -1) {
        e.preventDefault();
        toggleIncluded(scenario.includedQuestions[shortcutIndex].id);
        return;
      }

      const keyUpper = e.key.toUpperCase();
      if (CONDITION_SHORTCUTS.includes(keyUpper as typeof CONDITION_SHORTCUTS[number]) && scenario.conditionRequired) {
        e.preventDefault();
        handleSetCondition(keyUpper as ConditionValue);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scenario, showHelp, showSuccessToast, showReviewToast, batchComplete, handleSaveNext, handleNeedsReview]);

  const completedCount = serverProgress?.completedCount ?? Array.from(itemStates.values()).filter(s => s.status === 'submitted').length;
  const reviewCount = serverProgress?.reviewCount ?? Array.from(itemStates.values()).filter(s => s.status === 'needs_review').length;
  const processedCount = serverProgress?.processedCount ?? completedCount + reviewCount;
  const pendingCount = serverProgress?.pendingCount ?? TOTAL_ITEMS - processedCount;

  const hasQtyToList = scenario.conditionalFields.some(f => f.key === 'qtyToList');
  const hasCheckCount = scenario.conditionalFields.some(f => f.key === 'checkCount');
  const hasStockTotal = scenario.conditionalFields.some(f => f.key === 'stockTotal');
  const hasOtherNotes = scenario.conditionalFields.some(f => f.key === 'otherNotes');
  const hasAnyConditionalField = scenario.conditionalFields.length > 0;
  const includedShortcuts = getIncludedShortcuts(totalQuestions);
  const fieldSummaries = [
    hasQtyToList && fieldValues.qtyToList
      ? { label: 'Qty To List', value: String(fieldValues.qtyToList) }
      : null,
    hasCheckCount && fieldValues.checkCount
      ? { label: 'Check Count', value: fieldValues.checkCount === 'TRUE' || fieldValues.checkCount === true ? 'Yes' : 'No' }
      : null,
    hasStockTotal
      ? { label: 'Stock Total', value: String(fieldValues.stockTotal || '0') }
      : null,
  ].filter((field): field is { label: string; value: string } => field !== null);
  
  const draftStatus = itemStates.get(currentIndex)?.status;
  const savedStatus = draftStatus === 'submitted' ? 'complete' : draftStatus === 'needs_review' ? 'needs-review' : undefined;

  return (
    <div className="fixed inset-0 bg-gray-50 flex flex-col font-sans overflow-hidden">
      <AppHeader />
      {loadError && <div role="alert" className="absolute top-20 left-1/2 -translate-x-1/2 z-[60] bg-red-700 text-white px-5 py-2 rounded shadow-lg text-sm"><span>{loadError}</span><button className="ml-4 underline" onClick={()=>setLoadError(null)}>Dismiss</button></div>}
      
      <BatchProgress
        batchName={batchName}
        currentIndex={currentIndex + 1}
        totalItems={TOTAL_ITEMS}
        completedCount={completedCount}
        reviewCount={reviewCount}
        processedCount={processedCount}
        onHelp={() => setShowHelp(true)}
        onNext={() => navigateTo(currentIndex + 1)}
        onPrev={() => navigateTo(currentIndex - 1)}
      />

      {showSuccessToast && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-50 bg-emerald-700 text-white px-6 py-3 rounded-md shadow-lg font-bold flex items-center gap-3 animate-in slide-in-from-top-4 fade-in">
          <CheckCircle2 size={24} />
          Saved ✓ — Loading next item...
        </div>
      )}

      {showReviewToast && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-50 bg-amber-600 text-white px-6 py-3 rounded-md shadow-lg font-bold flex items-center gap-3 animate-in slide-in-from-top-4 fade-in">
          <Flag size={20} />
          Sent to Review — Loading next item...
        </div>
      )}

      <main className="flex-1 flex overflow-hidden p-6 gap-6 max-w-[1920px] mx-auto w-full">
        
        {batchComplete ? (
          <div className="m-auto flex flex-col items-center justify-center p-8 bg-white border border-gray-200 rounded-lg shadow-sm w-[450px]">
            <h2 className="text-2xl font-bold text-emerald-700 mb-2">Batch Complete</h2>
            <p className="text-gray-500 font-medium mb-8 text-center">{batchName}</p>
            
            <div className="w-full flex flex-col gap-3 mb-8">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-100">
                <span className="font-semibold text-gray-700">Total Items</span>
                <span className="font-bold">{TOTAL_ITEMS}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-emerald-50 rounded border border-emerald-100">
                <span className="font-semibold text-emerald-700">Completed</span>
                <span className="font-bold text-emerald-700">{completedCount}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-amber-50 rounded border border-amber-100">
                <span className="font-semibold text-amber-700">Needs Review</span>
                <span className="font-bold text-amber-700">{reviewCount}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-100">
                <span className="font-semibold text-gray-500">Pending</span>
                <span className="font-bold text-gray-500">{pendingCount}</span>
              </div>
            </div>
            
            <button 
              onClick={() => {
                transitionLockRef.current = false;
                setIsSubmitting(false);
                const freshStates = new Map<number, ItemDraft>();
                itemStatesRef.current = freshStates;
                setItemStates(freshStates);
                setCurrentIndex(0);
                setBatchComplete(false);
              }}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-md transition-colors"
            >
              Start New Batch
            </button>
          </div>
        ) : (
          <>
            <div className="w-[300px] xl:w-[350px] shrink-0 flex flex-col h-full bg-white border border-gray-200 rounded-lg p-6 shadow-sm min-h-0">
              <ItemIdentityCard {...scenario} />
            </div>

            <div className="flex-1 flex flex-col h-full bg-white border border-gray-200 rounded-lg p-5 shadow-sm min-h-0">
              
              {scenario.scenarioNote && (
                <div className="mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  <AlertTriangle size={15} className="text-amber-600 mt-0.5 shrink-0" />
                  <span className="text-xs text-amber-800">{scenario.scenarioNote}</span>
                </div>
              )}
              
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
                        isSelected={selectedIncluded.has(String(item.id))}
                        onToggle={() => toggleIncluded(item.id)}
                        showError={false}
                      />
                    ))}
                  </div>
                  
                  {totalQuestions > 0 && selectedIncluded.size === 0 && !includedDecisionMade && (
                    <button 
                      onClick={() => updateCurrentState({ includedItems: { selectedQuestionIds: [], explicitlyNone: true } })}
                      className="border border-gray-300 text-gray-500 text-xs px-3 py-2 rounded-md hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 w-full mt-3 font-medium transition-colors"
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
                    onSelect={handleSetCondition}
                    showError={validationErrors && !selectedCondition}
                  />
                </div>
              )}

              {hasAnyConditionalField && (
                <div className="flex gap-4 mt-auto pt-4 border-t border-gray-100">
                  {hasQtyToList && (
                    <div className="flex flex-col gap-1 w-24 shrink-0">
                      <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                        QTY TO LIST
                        {scenario.conditionalFields.find(f => f.key === 'qtyToList')?.required && <span className="text-red-500">*</span>}
                      </label>
                      <div className={`flex border rounded-md overflow-hidden h-[34px] ${validationErrors && scenario.conditionalFields.find(f => f.key === 'qtyToList')?.required && (!fieldValues.qtyToList || parseInt(String(fieldValues.qtyToList)) <= 0) ? 'border-red-400' : 'border-gray-200'}`}>
                        <button type="button" onClick={() => handleQtyChange(-1)} className="w-8 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 flex items-center justify-center text-gray-500 border-r border-gray-200">−</button>
                        <div className="flex-1 flex items-center justify-center font-medium text-sm bg-white text-gray-900">{String(fieldValues.qtyToList)}</div>
                        <button type="button" onClick={() => handleQtyChange(1)} className="w-8 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 flex items-center justify-center text-gray-500 border-l border-gray-200">+</button>
                      </div>
                    </div>
                  )}
                  
                  {hasCheckCount && (
                    <div className="flex flex-col gap-1 w-32 shrink-0">
                      <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">CHECK COUNT?</label>
                      <select 
                        className="h-[34px] border border-gray-200 rounded-md text-sm px-2 focus:outline-none focus:ring-1 focus:ring-emerald-600 bg-white cursor-pointer text-gray-900"
                        value={String(fieldValues.checkCount)}
                        onChange={(e) => handleFieldChange('checkCount', e.target.value)}
                      >
                        <option value="TRUE">TRUE</option>
                        <option value="FALSE">FALSE</option>
                      </select>
                    </div>
                  )}
                  
                  {hasStockTotal && (
                    <div className="flex flex-col gap-1 w-24 shrink-0">
                      <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">STOCK TOTAL</label>
                      <div className="h-[34px] border border-gray-200 rounded-md text-sm px-3 flex items-center justify-center bg-gray-50 text-gray-900 font-medium">
                        {String(fieldValues.stockTotal || scenario.conditionalFields.find(f => f.key === 'stockTotal')?.defaultValue || '0')}
                      </div>
                    </div>
                  )}

                  {hasOtherNotes && (
                    <div className="flex flex-col gap-1 flex-1">
                      <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                        OTHER NOTES <span className="text-gray-400 normal-case font-normal">(optional)</span>
                      </label>
                      <textarea 
                        className="w-full px-3 py-1.5 border border-gray-200 rounded-md text-sm min-h-[34px] focus:outline-none focus:ring-1 focus:ring-emerald-600 resize-none bg-white placeholder:text-gray-300 text-gray-900"
                        placeholder="e.g. minor scratches"
                        value={String(fieldValues.otherNotes ?? '')}
                        onChange={(e) => handleFieldChange('otherNotes', e.target.value)}
                        rows={1}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="w-[320px] xl:w-[350px] shrink-0 flex flex-col gap-6 h-full min-h-0">
              <StatusPanel 
                inclusionComplete={isIncludedComplete}
                conditionComplete={isConditionComplete}
                conditionSelected={selectedCondition}
                isReady={isReady}
                selectedCount={selectedIncluded.size}
                totalQuestions={totalQuestions}
                includedDecisionMade={includedDecisionMade}
                missingItems={missingItems}
                savedStatus={savedStatus}
                fieldSummaries={fieldSummaries}
              />

              <div className="flex flex-col gap-3 mt-auto">
                {validationErrors && (
                  <div className="text-center text-red-500 font-semibold text-sm animate-pulse">
                    Please complete required fields.
                  </div>
                )}
                
                <SaveNextButton isReady={isReady} isSubmitting={isSubmitting} onClick={handleSaveNext} />
                
                <button 
                  onClick={handleNeedsReview}
                  disabled={isSubmitting}
                  className="w-full flex flex-col items-center justify-center py-3.5 px-6 rounded-md font-bold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-60 transition-colors shadow-sm"
                >
                  <span>NEEDS REVIEW</span>
                  <span className="text-xs font-normal text-gray-400 mt-0.5 tracking-wide">F2</span>
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {!batchComplete && (
        <div className="h-10 bg-gray-900 text-gray-400 text-xs flex items-center justify-center gap-8 shrink-0">
          <div className="flex items-center gap-2 text-emerald-600 font-bold uppercase tracking-wider">
            <Keyboard size={16} />
            KEYBOARD SHORTCUTS
          </div>
          <div className="flex items-center gap-6">
            {includedShortcuts.length > 0 && (
              <span><span className="text-gray-200">{formatIncludedShortcutLabel(includedShortcuts)}</span> Select Items</span>
            )}
            <span><span className="text-gray-200">A-D</span> Condition</span>
            <span><span className="text-gray-200">Enter</span> Save & Next</span>
            <span><span className="text-gray-200">F2</span> Needs Review</span>
            <button onClick={() => setShowHelp(true)} className="hover:text-white transition-colors cursor-pointer flex items-center gap-1">
              <span className="text-gray-200">F1</span> Help
            </button>
          </div>
        </div>
      )}

      <KeyboardHelpOverlay
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        includedShortcuts={includedShortcuts}
      />
    </div>
  );
}

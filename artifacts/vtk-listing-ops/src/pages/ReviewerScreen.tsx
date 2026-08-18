import { useState } from "react";
import { AppHeader } from "../components/AppHeader";
import { ItemIdentityCard } from "../components/ItemIdentityCard";
import { ReviewerQASection } from "../components/ReviewerQASection";
import { SixBitPreview } from "../components/SixBitPreview";
import { MOCK_SCENARIOS } from "../data/mockData";
import { Check, X, AlertCircle } from "lucide-react";

export default function ReviewerScreen() {
  const scenario = MOCK_SCENARIOS[0]; // Cisco router
  
  const [showSendBack, setShowSendBack] = useState(false);
  const [sendBackReason, setSendBackReason] = useState("");
  const [sendBackNotes, setSendBackNotes] = useState("");

  const handleApprove = () => {
    alert("Approved!");
  };

  const handleSendBackConfirm = () => {
    alert(`Sent back: ${sendBackReason}`);
    setShowSendBack(false);
  };

  // Mock reviewer data based on Cisco scenario
  const employeeChecked = new Set([1, 3]);
  const qaResults: any[] = [
    { label: "Product Identity", status: "pass" },
    { label: "Inclusion Questions", status: "pass" },
    { label: "Category", status: "pass" },
    { label: "Item Specifics", status: "warning", message: "1 warning" },
    { label: "Title Length", status: "pass" },
    { label: "Description Structure", status: "pass" },
    { label: "SixBit Row Validation", status: "pass" },
  ];

  return (
    <div className="fixed inset-0 bg-gray-50 flex flex-col font-sans overflow-hidden">
      <AppHeader />
      
      {/* Reviewer Header */}
      <div className="flex items-center justify-between w-full h-12 px-6 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-4">
          <span className="font-bold text-gray-900">Review Queue</span>
          <div className="h-4 w-px bg-gray-300" />
          <span className="text-sm text-gray-500 font-medium">Batch 2024-08-18 AM • Item 14 of 47</span>
        </div>
      </div>

      <main className="flex-1 flex overflow-hidden p-6 gap-6 max-w-[1920px] mx-auto w-full">
        
        {/* LEFT COLUMN: Identity & Employee Answers (~40%) */}
        <div className="w-[450px] shrink-0 flex flex-col h-full bg-white border border-gray-200 rounded-lg p-6 shadow-sm overflow-y-auto">
          <ItemIdentityCard {...scenario} />
          
          <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-bold text-gray-900 tracking-tight uppercase mb-4">Employee Answers</h3>
            
            <div className="flex flex-col gap-6">
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Included Items</span>
                <div className="flex flex-col gap-1 border border-gray-100 rounded-md bg-gray-50 p-2">
                  {scenario.includedQuestions.map(q => {
                    const isChecked = employeeChecked.has(q.id);
                    return (
                      <div key={q.id} className="flex items-center gap-2 py-1">
                        {isChecked ? (
                          <Check size={16} className="text-primary shrink-0" />
                        ) : (
                          <X size={16} className="text-gray-300 shrink-0" />
                        )}
                        <span className={`text-sm ${isChecked ? "text-gray-900 font-medium" : "text-gray-500"}`}>
                          {q.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Condition Selected</span>
                <div className="bg-emerald-100 border-2 border-emerald-500 text-emerald-900 font-bold p-3 rounded-md inline-block">
                  C - NEW FACTORY SEALED
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: QA Results & Actions (~60%) */}
        <div className="flex-1 flex flex-col h-full bg-gray-50 rounded-lg overflow-hidden gap-6">
          
          <div className="flex-1 overflow-y-auto flex flex-col gap-6 p-2 pb-24">
            <ReviewerQASection 
              category="Computers/Tablets & Networking > Enterprise Networking, Servers > Routers > Enterprise Routers"
              alternateCategories={["Computers > Networking > Wired Routers"]}
              itemSpecifics={{
                "Brand": "Cisco",
                "Model": "C1111-4P",
                "MPN": "C1111-4P",
                "Form Factor": "Desktop",
                "Type": "Enterprise Router"
              }}
              missingSpecifics={["Number of Ports", "Interface"]}
              proposedTitle="Cisco C1111-4P 4-Port Dual GE WAN Router — FACTORY SEALED"
              titleLength={59}
              description="New Factory Sealed Cisco 1111 4-Port Dual GE WAN Router (C1111-4P). Guaranteed authentic and ready to deploy in your enterprise environment. Includes all factory original accessories."
              qaResults={qaResults}
            />
            
            <SixBitPreview 
              data={{
                "Action": "ADD",
                "Condition": "New",
                "ProductID": "C1111-4P",
                "SKU": "VTK-00142",
                "Price": "$289.99",
                "Qty": "1"
              }}
            />
          </div>

          {/* Sticky Actions Footer */}
          <div className="absolute bottom-6 right-6 w-[calc(100%-450px-3rem-1.5rem)] bg-white border border-gray-200 rounded-lg p-5 shadow-lg flex flex-col gap-4">
            {!showSendBack ? (
              <div className="flex gap-4">
                <button 
                  onClick={handleApprove}
                  className="flex-1 py-4 bg-primary text-white rounded-md font-bold text-lg hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  APPROVE & NEXT
                </button>
                <button 
                  onClick={() => setShowSendBack(true)}
                  className="px-8 py-4 border-2 border-amber-500 text-amber-600 font-bold rounded-md hover:bg-amber-50 transition-colors"
                >
                  SEND BACK
                </button>
                <button className="px-8 py-4 border-2 border-destructive text-destructive font-bold rounded-md hover:bg-destructive/5 transition-colors">
                  REJECT
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-2">
                <div className="flex items-center gap-2 text-amber-600 font-bold border-b border-gray-100 pb-2">
                  <AlertCircle size={20} />
                  SEND BACK TO EMPLOYEE
                </div>
                
                <div className="flex gap-4">
                  <div className="flex-1 flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">Reason</label>
                    <select 
                      className="w-full p-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      value={sendBackReason}
                      onChange={(e) => setSendBackReason(e.target.value)}
                    >
                      <option value="" disabled>Select a reason...</option>
                      <option value="Wrong product/model">Wrong product/model</option>
                      <option value="Missing included question">Missing included question</option>
                      <option value="Incorrect employee answer">Incorrect employee answer</option>
                      <option value="Wrong eBay category">Wrong eBay category</option>
                      <option value="Wrong item specific">Wrong item specific</option>
                      <option value="Title problem">Title problem</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">Note for Employee</label>
                    <input 
                      type="text"
                      className="w-full p-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="Explain what needs fixing..."
                      value={sendBackNotes}
                      onChange={(e) => setSendBackNotes(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="flex items-center gap-3 pt-2">
                  <button 
                    onClick={() => setShowSendBack(false)}
                    className="flex-1 py-2 px-4 rounded-md border border-gray-300 font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSendBackConfirm}
                    disabled={!sendBackReason}
                    className="flex-1 py-2 px-4 rounded-md bg-amber-500 text-white font-bold hover:bg-amber-600 transition-colors disabled:opacity-50"
                  >
                    Confirm Send Back
                  </button>
                </div>
              </div>
            )}
          </div>
          
        </div>
      </main>
    </div>
  );
}

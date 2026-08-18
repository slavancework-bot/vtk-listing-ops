import { Plus, ListTodo, FileCheck2, Download } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { AppHeader } from "../components/AppHeader";
import { BatchCard } from "../components/BatchCard";
import { MOCK_BATCHES } from "../data/mockData";

export default function Dashboard() {
  const { toast } = useToast();

  const handleOpenBatch = (id: string) => {
    // In a real app, this would set context and navigate
    window.location.href = '/employee';
  };

  const handleExportsClick = () => {
    toast({
      title: "Coming Soon",
      description: "Exports functionality is not yet available in this prototype.",
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <AppHeader />
      
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-8">
        
        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard title="Total Items Today" value="127" />
          <StatCard title="Waiting for Employee" value="12" alert />
          <StatCard title="Needs Review" value="10" alert />
          <StatCard title="Ready to Approve" value="8" highlight />
        </div>

        {/* Dashboard Header */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-4">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Batch Dashboard</h1>
          <button className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-md font-semibold text-sm hover:bg-emerald-700 transition-colors shadow-sm">
            <Plus size={18} />
            NEW BATCH
          </button>
        </div>

        {/* Batch List */}
        <div className="flex flex-col gap-4">
          {MOCK_BATCHES.map(batch => (
            <BatchCard 
              key={batch.id}
              {...batch}
              onOpen={() => handleOpenBatch(batch.id)}
            />
          ))}
        </div>
        
        {/* Quick Actions */}
        <div className="pt-8 border-t border-gray-200">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Quick Actions</h2>
          <div className="flex gap-4">
            <Link href="/employee" className="flex items-center gap-3 bg-white border border-gray-200 p-4 rounded-md shadow-sm hover:border-primary hover:text-primary transition-colors flex-1 font-medium text-gray-700">
              <ListTodo size={20} />
              EMPLOYEE QUEUE
            </Link>
            <Link href="/reviewer" className="flex items-center gap-3 bg-white border border-gray-200 p-4 rounded-md shadow-sm hover:border-primary hover:text-primary transition-colors flex-1 font-medium text-gray-700">
              <FileCheck2 size={20} />
              REVIEW QUEUE
            </Link>
            <button 
              onClick={handleExportsClick}
              className="flex items-center gap-3 bg-white border border-gray-200 p-4 rounded-md shadow-sm hover:border-primary hover:text-primary transition-colors flex-1 font-medium text-gray-700 text-left"
            >
              <Download size={20} />
              EXPORTS
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}

function StatCard({ title, value, highlight = false, alert = false }: { title: string, value: string, highlight?: boolean, alert?: boolean }) {
  return (
    <div className={`
      bg-white border rounded-md p-4 shadow-sm
      ${highlight ? "border-primary/30 bg-primary/5" : alert ? "border-amber-200 bg-amber-50/30" : "border-gray-200"}
    `}>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-tight mb-1">{title}</h3>
      <p className={`
        text-3xl font-bold
        ${highlight ? "text-primary" : alert ? "text-amber-600" : "text-gray-900"}
      `}>
        {value}
      </p>
    </div>
  );
}

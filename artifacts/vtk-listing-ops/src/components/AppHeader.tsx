import { Link, useLocation } from "wouter";
import { UserCircle } from "lucide-react";

export function AppHeader() {
  const [location] = useLocation();
  
  return (
    <header className="flex items-center justify-between h-14 px-6 bg-white border-b border-gray-200 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-2xl font-black text-emerald-600 tracking-tight">VTK</span>
        <div className="flex flex-col">
          <span className="text-xs font-bold uppercase text-gray-800 leading-none">LISTING</span>
          <span className="text-xs font-bold uppercase text-gray-800 leading-none">OPERATIONS</span>
        </div>
      </div>
      
      <nav className="flex items-center gap-6">
        <Link 
          href="/" 
          className={`text-sm font-medium transition-colors ${
            location === "/" ? "text-emerald-600" : "text-gray-600 hover:text-gray-900"
          }`}
          data-testid="nav-dashboard"
        >
          Dashboard
        </Link>
        <Link 
          href="/employee" 
          className={`text-sm font-medium transition-colors ${
            location === "/employee" ? "text-emerald-600" : "text-gray-600 hover:text-gray-900"
          }`}
          data-testid="nav-employee"
        >
          Employee
        </Link>
        <Link 
          href="/reviewer" 
          className={`text-sm font-medium transition-colors ${
            location === "/reviewer" ? "text-emerald-600" : "text-gray-600 hover:text-gray-900"
          }`}
          data-testid="nav-reviewer"
        >
          Reviewer
        </Link>
        
        <div className="w-px h-5 bg-gray-200 mx-2" />
        
        <div className="flex items-center gap-2 text-sm text-gray-700 font-medium">
          J. Martinez
        </div>
      </nav>
    </header>
  );
}

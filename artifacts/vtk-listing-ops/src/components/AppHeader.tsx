import { Link, useLocation } from "wouter";
import { Package, UserCircle, LogOut } from "lucide-react";

export function AppHeader() {
  const [location] = useLocation();
  
  return (
    <header className="flex items-center justify-between h-14 px-6 bg-white border-b border-gray-200 shrink-0">
      <div className="flex items-center gap-2">
        <div className="bg-gray-900 text-white p-1.5 rounded-md">
          <Package size={18} className="text-white" />
        </div>
        <span className="font-semibold text-gray-900 tracking-tight">VTK Listing Operations</span>
      </div>
      
      <nav className="flex items-center gap-6">
        <Link 
          href="/" 
          className={`text-sm font-medium transition-colors ${
            location === "/" ? "text-primary" : "text-gray-600 hover:text-gray-900"
          }`}
          data-testid="nav-dashboard"
        >
          Dashboard
        </Link>
        <Link 
          href="/employee" 
          className={`text-sm font-medium transition-colors ${
            location === "/employee" ? "text-primary" : "text-gray-600 hover:text-gray-900"
          }`}
          data-testid="nav-employee"
        >
          Employee
        </Link>
        <Link 
          href="/reviewer" 
          className={`text-sm font-medium transition-colors ${
            location === "/reviewer" ? "text-primary" : "text-gray-600 hover:text-gray-900"
          }`}
          data-testid="nav-reviewer"
        >
          Reviewer
        </Link>
        
        <div className="w-px h-5 bg-gray-200 mx-2" />
        
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <UserCircle size={18} className="text-gray-400" />
          <span>J. Martinez</span>
        </div>
      </nav>
    </header>
  );
}

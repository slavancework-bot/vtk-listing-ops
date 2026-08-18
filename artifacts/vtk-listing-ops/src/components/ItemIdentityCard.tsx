import { Package, Info } from "lucide-react";

interface ItemIdentityCardProps {
  manufacturer: string;
  model: string;
  mpn?: string;
  sku: string;
  productName: string;
  shortDescription?: string;
  imageUrl?: string;
}

export function ItemIdentityCard({
  manufacturer,
  model,
  mpn,
  sku,
  productName,
  shortDescription,
  imageUrl,
}: ItemIdentityCardProps) {
  return (
    <div className="flex flex-col h-full">
      <h3 className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-4">ITEM INFORMATION</h3>
      
      <div className="w-full h-32 bg-gray-100 rounded-md border border-gray-200 flex items-center justify-center mb-6 overflow-hidden shrink-0">
        {imageUrl ? (
          <img src={imageUrl} alt={model} className="object-contain w-full h-full" />
        ) : (
          <div className="text-gray-400 flex flex-col items-center gap-2">
            <Package size={32} strokeWidth={1.5} />
          </div>
        )}
      </div>
      
      <div className="flex flex-col gap-1 mb-6">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none mb-2">
          {manufacturer === model ? model : `${manufacturer} ${model}`}
        </h1>
        <p className="text-sm text-gray-500 leading-snug">
          {shortDescription || productName}
        </p>
      </div>
      
      <div className="flex flex-col gap-1.5 mt-2">
        {mpn && (
          <p className="text-xs text-gray-500 font-mono">MPN: {mpn}</p>
        )}
        <p className="text-xs text-gray-500 font-mono">SKU: {sku}</p>
      </div>
      
      <div className="mt-auto pt-4">
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 flex items-start gap-2">
          <Info className="text-blue-500 shrink-0 mt-0.5" size={16} />
          <p className="text-sm text-blue-800 leading-snug">
            Please verify what is physically included with this item.
          </p>
        </div>
      </div>
    </div>
  );
}

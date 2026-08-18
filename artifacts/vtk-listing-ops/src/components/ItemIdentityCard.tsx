import { Package } from "lucide-react";

interface ItemIdentityCardProps {
  manufacturer: string;
  model: string;
  mpn?: string;
  sku: string;
  productName: string;
}

export function ItemIdentityCard({
  manufacturer,
  model,
  mpn,
  sku,
  productName,
}: ItemIdentityCardProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="aspect-square bg-gray-100 rounded-md border border-gray-200 flex items-center justify-center p-6">
        <div className="text-gray-300 flex flex-col items-center gap-2">
          <Package size={48} strokeWidth={1.5} />
          <span className="text-sm font-medium">No Image Available</span>
        </div>
      </div>
      
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium text-gray-500 tracking-tight">{manufacturer}</h2>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight leading-none mb-1">
          {model}
        </h1>
        {mpn && mpn !== model && (
          <p className="text-sm text-gray-600 font-mono">MPN: {mpn}</p>
        )}
        <p className="text-sm text-gray-500 font-mono">SKU: {sku}</p>
      </div>
      
      <div className="pt-4 border-t border-gray-200">
        <p className="text-base text-gray-800 leading-snug">{productName}</p>
      </div>
      
      <div className="mt-auto bg-gray-50 p-4 rounded-md border border-gray-200">
        <p className="text-sm font-medium text-gray-800 flex items-start gap-2">
          <span className="text-primary mt-0.5">●</span>
          Verify what is physically included with this item.
        </p>
      </div>
    </div>
  );
}

interface SixBitPreviewProps {
  data: Record<string, string>;
}

export function SixBitPreview({ data }: SixBitPreviewProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-sm overflow-hidden">
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
          SixBit Export Preview
        </h3>
        <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-mono">CSV</span>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {Object.keys(data).map(key => (
                <th key={key} className="px-4 py-2 font-medium text-gray-500 text-xs whitespace-nowrap">
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {Object.values(data).map((value, idx) => (
                <td key={idx} className="px-4 py-3 font-mono text-gray-900 border-b border-gray-50 whitespace-nowrap">
                  {value}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

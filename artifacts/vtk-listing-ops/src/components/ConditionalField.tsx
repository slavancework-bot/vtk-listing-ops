interface ConditionalFieldConfig {
  id: string;
  label: string;
  type: 'text' | 'number';
  placeholder?: string;
}

interface ConditionalFieldProps {
  config: ConditionalFieldConfig;
  value: string | number;
  onChange: (val: string) => void;
}

export function ConditionalField({ config, value, onChange }: ConditionalFieldProps) {
  return (
    <div className="flex flex-col gap-2 p-4 bg-amber-50/50 border border-amber-200 rounded-md">
      <label htmlFor={config.id} className="text-sm font-semibold text-gray-900">
        {config.label}
      </label>
      <input
        id={config.id}
        type={config.type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={config.placeholder}
        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
        data-testid={`input-conditional-${config.id}`}
      />
    </div>
  );
}

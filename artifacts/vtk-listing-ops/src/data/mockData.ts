export type ConditionValue = 'A' | 'B' | 'C' | 'D' | null;

export interface IncludedItem {
  id: number;
  label: string;
  important?: boolean;
}

export interface ConditionalFieldConfig {
  id: string;
  label: string;
  type: 'text' | 'number';
  placeholder?: string;
  defaultValue?: string | number;
}

export interface ItemScenario {
  id: string;
  manufacturer: string;
  model: string;
  mpn?: string;
  sku: string;
  productName: string;
  includedQuestions: IncludedItem[];
  conditionRequired: boolean;
  conditionalField?: ConditionalFieldConfig;
  preSelectedIncluded: number[];
  preSelectedCondition: ConditionValue;
  categoryName?: string;
}

export const MOCK_SCENARIOS: ItemScenario[] = [
  {
    id: "scenario-1",
    manufacturer: "Cisco",
    model: "C1111-4P",
    mpn: "C1111-4P",
    sku: "VTK-00142",
    productName: "Cisco 1111 4-Port Dual GE WAN Router",
    includedQuestions: [
      { id: 1, label: "External Power Adapter" },
      { id: 2, label: "Rack Mount Brackets" },
      { id: 3, label: "Console Cable" },
      { id: 4, label: "Ethernet Cable" },
      { id: 5, label: "Documentation / Manual" },
      { id: 6, label: "Original Box / Packaging" },
    ],
    conditionRequired: true,
    preSelectedIncluded: [1, 3],
    preSelectedCondition: 'C',
    categoryName: "Routers > Cisco > Enterprise Routers"
  },
  {
    id: "scenario-2",
    manufacturer: "Dell",
    model: "E1715S",
    mpn: "860-BBBI",
    sku: "VTK-00219",
    productName: "Dell 17\" E1715S LCD Monitor",
    includedQuestions: [
      { id: 1, label: "Monitor Stand / Base", important: true },
      { id: 2, label: "Power Cord" },
      { id: 3, label: "VGA Cable" },
      { id: 4, label: "DisplayPort Cable" },
    ],
    conditionRequired: true,
    preSelectedIncluded: [1, 2],
    preSelectedCondition: 'D',
  },
  {
    id: "scenario-3",
    manufacturer: "Topaz",
    model: "F-FL/90/50K/SF/BZ-87",
    sku: "VTK-00331",
    productName: "Topaz 90W LED Flood Light Fixture",
    includedQuestions: [
      { id: 1, label: "LED Flood Light Fixture" },
      { id: 2, label: "Slipfitter Mount / Mounting Bracket" },
      { id: 3, label: "Mounting Hardware / Screws / Bolts" },
      { id: 4, label: "Photocell Sensor" },
      { id: 5, label: "Installation Instructions / Manual" },
      { id: 6, label: "Original Box / Packaging" },
    ],
    conditionRequired: true,
    preSelectedIncluded: [],
    preSelectedCondition: null,
  },
  {
    id: "scenario-4",
    manufacturer: "Zebra",
    model: "ZT231",
    mpn: "ZT23142-T01000FZ",
    sku: "VTK-00408",
    productName: "Zebra ZT231 Industrial Label Printer",
    includedQuestions: [
      { id: 1, label: "Power Cord" },
      { id: 2, label: "USB Cable" },
      { id: 3, label: "Label Roll (sample)" },
      { id: 4, label: "Documentation / Manual" },
    ],
    conditionRequired: true,
    conditionalField: {
      id: "print-options",
      label: "Enter print resolution and installed options if known.",
      type: "text",
      placeholder: "203dpi cutter no RFID"
    },
    preSelectedIncluded: [],
    preSelectedCondition: 'B',
  },
  {
    id: "scenario-5",
    manufacturer: "Various",
    model: "Mixed Lot",
    sku: "VTK-00512",
    productName: "Network Switch Lot",
    includedQuestions: [],
    conditionRequired: true,
    conditionalField: {
      id: "qty-override",
      label: "Qty To List 5 exceeds Qty Uncommitted 1. What should Qty To List be?",
      type: "number",
      placeholder: ""
    },
    preSelectedIncluded: [],
    preSelectedCondition: null,
  },
  {
    id: "scenario-6",
    manufacturer: "HP",
    model: "EliteBook 840 G6",
    mpn: "6XD76EA",
    sku: "VTK-00623",
    productName: "HP EliteBook 840 G6 14\" Laptop",
    includedQuestions: [
      { id: 1, label: "AC Power Adapter" },
      { id: 2, label: "Original Box / Packaging" },
    ],
    conditionRequired: true,
    preSelectedIncluded: [1],
    preSelectedCondition: null,
  }
];

export const MOCK_BATCHES = [
  {
    id: "batch-1",
    name: "Batch 2024-08-18 AM",
    date: "2024-08-18",
    creator: "System",
    totalItems: 47,
    status: "Active",
    counts: {
      researching: 4,
      waitingForEmployee: 12,
      needsReview: 3,
      readyForApproval: 8,
      approved: 21,
      exported: 2
    }
  },
  {
    id: "batch-2",
    name: "Batch 2024-08-17 PM",
    date: "2024-08-17",
    creator: "System",
    totalItems: 48,
    status: "Completed",
    counts: {
      researching: 0,
      waitingForEmployee: 0,
      needsReview: 0,
      readyForApproval: 0,
      approved: 48,
      exported: 48
    }
  },
  {
    id: "batch-3",
    name: "Batch 2024-08-15",
    date: "2024-08-15",
    creator: "M. Rogers",
    totalItems: 35,
    status: "Needs Attention",
    counts: {
      researching: 0,
      waitingForEmployee: 0,
      needsReview: 7,
      readyForApproval: 2,
      approved: 26,
      exported: 26
    }
  }
];

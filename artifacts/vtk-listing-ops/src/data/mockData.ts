export type ConditionValue = 'A' | 'B' | 'C' | 'D' | null;

export interface IncludedItem {
  id: number;
  label: string;
  important?: boolean;
}

export type ConditionalFieldKey = 'qtyToList' | 'checkCount' | 'stockTotal' | 'otherNotes';

export interface ConditionalFieldDef {
  key: ConditionalFieldKey;
  label: string;
  required: boolean;
  defaultValue?: string;
}

export interface ItemScenario {
  id: string;
  scenarioLabel: string;
  manufacturer: string;
  model: string;
  mpn?: string;
  sku: string;
  productName: string;
  shortDescription?: string;
  includedQuestions: IncludedItem[];
  conditionRequired: boolean;
  conditionalFields: ConditionalFieldDef[];
  preSelectedIncluded: number[];
  preSelectedCondition: ConditionValue;
  categoryName?: string;
  scenarioNote?: string;
  requiresReview?: boolean;
}

export const MOCK_SCENARIOS: ItemScenario[] = [
  {
    id: 'scenario-a',
    scenarioLabel: 'A',
    manufacturer: 'HP',
    model: 'EliteBook 840 G6',
    mpn: '6XD76EA',
    sku: 'VTK-00623',
    productName: 'HP EliteBook 840 G6 14-inch Laptop',
    shortDescription: 'HP EliteBook 840 G6 Ultrabook',
    includedQuestions: [
      { id: 1, label: 'AC Power Adapter', important: true },
      { id: 2, label: 'Original Box / Packaging' }
    ],
    conditionRequired: true,
    conditionalFields: [],
    preSelectedIncluded: [],
    preSelectedCondition: null,
    categoryName: 'Laptops > HP > EliteBook'
  },
  {
    id: 'scenario-b',
    scenarioLabel: 'B',
    manufacturer: 'Cisco',
    model: 'C1111-4P',
    mpn: 'C1111-4P',
    sku: 'VTK-C1111-4P-14',
    productName: 'Cisco 1111 4-Port Dual GE WAN Router',
    shortDescription: 'ISR 1111 4-Port Integrated Services Router',
    includedQuestions: [
      { id: 1, label: 'Power Cord' },
      { id: 2, label: 'Rack Mount Brackets' },
      { id: 3, label: 'Console Cable' },
      { id: 4, label: 'Ethernet Cable' },
      { id: 5, label: 'AC Adapter' },
      { id: 6, label: 'Documentation / Manual' },
      { id: 7, label: 'Original Box / Packaging' },
      { id: 8, label: 'Other (specify)' }
    ],
    conditionRequired: true,
    conditionalFields: [],
    preSelectedIncluded: [],
    preSelectedCondition: null,
    categoryName: 'Routers > Cisco > Enterprise'
  },
  {
    id: 'scenario-c',
    scenarioLabel: 'C',
    manufacturer: 'Topaz',
    model: 'F-FL/90/50K/SF/BZ-87',
    sku: 'VTK-00331',
    productName: 'Topaz 90W LED Flood Light Fixture',
    shortDescription: '90W LED Flood Light with Slipfitter Mount',
    includedQuestions: [
      { id: 1, label: 'Slipfitter Mount / Bracket' },
      { id: 2, label: 'Mounting Hardware / Screws' },
      { id: 3, label: 'Photocell Sensor' },
      { id: 4, label: 'Installation Manual' },
      { id: 5, label: 'Original Box / Packaging' },
      { id: 6, label: 'Other (specify)' }
    ],
    conditionRequired: true,
    conditionalFields: [],
    preSelectedIncluded: [],
    preSelectedCondition: null,
    scenarioNote: 'Unit only — accessories not present. Use NONE if nothing is included.',
    categoryName: 'Lighting > LED > Flood'
  },
  {
    id: 'scenario-d',
    scenarioLabel: 'D',
    manufacturer: 'Zebra',
    model: 'DS4608',
    mpn: 'DS4608-SR00007ZZWW',
    sku: 'VTK-00742',
    productName: 'Zebra DS4608 Handheld Barcode Scanner',
    shortDescription: 'DS4608 2D Presentation Scanner (lot of 3)',
    includedQuestions: [],
    conditionRequired: true,
    conditionalFields: [
      { key: 'qtyToList', label: 'QTY TO LIST', required: true, defaultValue: '1' },
      { key: 'stockTotal', label: 'STOCK TOTAL', required: false, defaultValue: '3' }
    ],
    preSelectedIncluded: [],
    preSelectedCondition: null,
    scenarioNote: 'Lot of 3 — confirm quantity to list before saving.',
    categoryName: 'Scanners > Zebra'
  },
  {
    id: 'scenario-e',
    scenarioLabel: 'E',
    manufacturer: 'Dell',
    model: 'E1715S',
    mpn: '860-BBBI',
    sku: 'VTK-00219',
    productName: 'Dell 17 E1715S LCD Monitor',
    shortDescription: 'Dell 17-inch E1715S 1280x1024 Monitor',
    includedQuestions: [
      { id: 1, label: 'Monitor Stand / Base', important: true },
      { id: 2, label: 'Power Cord' },
      { id: 3, label: 'VGA Cable' },
      { id: 4, label: 'DisplayPort Cable' }
    ],
    conditionRequired: true,
    conditionalFields: [
      { key: 'checkCount', label: 'CHECK COUNT?', required: true, defaultValue: 'TRUE' }
    ],
    preSelectedIncluded: [],
    preSelectedCondition: null,
    categoryName: 'Monitors > Dell'
  },
  {
    id: 'scenario-f',
    scenarioLabel: 'F',
    manufacturer: 'Various',
    model: 'Mixed Lot',
    sku: 'VTK-00512',
    productName: 'Network Switch Lot',
    shortDescription: 'Mixed network switches — quantity discrepancy',
    includedQuestions: [],
    conditionRequired: true,
    conditionalFields: [
      { key: 'qtyToList', label: 'QTY TO LIST', required: true, defaultValue: '0' },
      { key: 'stockTotal', label: 'STOCK TOTAL', required: false, defaultValue: '0' }
    ],
    preSelectedIncluded: [],
    preSelectedCondition: null,
    scenarioNote: 'Inventory discrepancy: QTY TO LIST exceeds uncommitted stock. Verify count or send to review.',
    requiresReview: true,
    categoryName: 'Networking > Lots'
  },
  {
    id: 'scenario-g',
    scenarioLabel: 'G',
    manufacturer: 'Zebra',
    model: 'ZT231',
    mpn: 'ZT23142-T01000FZ',
    sku: 'VTK-00408',
    productName: 'Zebra ZT231 Industrial Label Printer',
    shortDescription: 'ZT231 4-inch Industrial Thermal Printer',
    includedQuestions: [
      { id: 1, label: 'Power Cord' },
      { id: 2, label: 'USB Cable' },
      { id: 3, label: 'Label Roll (sample)' },
      { id: 4, label: 'Documentation / Manual' }
    ],
    conditionRequired: true,
    conditionalFields: [
      { key: 'otherNotes', label: 'OTHER NOTES', required: false }
    ],
    preSelectedIncluded: [],
    preSelectedCondition: null,
    scenarioNote: 'Item received with physical damage not matching purchase description. Review may be required.',
    requiresReview: true,
    categoryName: 'Printers > Zebra'
  },
  {
    id: 'scenario-h',
    scenarioLabel: 'H',
    manufacturer: 'Cisco',
    model: 'SG350-28',
    mpn: 'SG350-28-K9-NA',
    sku: 'VTK-00887',
    productName: 'Cisco SG350-28 28-Port Gigabit Managed Switch',
    shortDescription: 'SG350-28 28-Port Gigabit Managed Switch',
    includedQuestions: [
      { id: 1, label: 'Power Cord' },
      { id: 2, label: 'Rack Mount Kit' }
    ],
    conditionRequired: true,
    conditionalFields: [],
    preSelectedIncluded: [],
    preSelectedCondition: null,
    categoryName: 'Networking > Switches > Cisco'
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
export type Language = 'zh' | 'en';
export type Theme = 'light' | 'dark';

export interface FileData {
  name: string;
  data: any[][]; // Raw rows from sheet
}

export interface AppState {
  step: number;
  headerRowIndex: 0 | 1; // 0 for 1st row, 1 for 2nd row
  allHeaders: string[];
  selectedHeaders: string[]; // IDs/Names of selected headers
  orderedHeaders: string[]; // For sorting output
  metadataJson: string;
  rootKeyType: 'custom' | 'field';
  rootKeyCustomName: string;
  rootKeySelectedField: string;
}

export interface ProcessedJson {
  [key: string]: any;
}

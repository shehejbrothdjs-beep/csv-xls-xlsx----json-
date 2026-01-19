import * as XLSX from 'xlsx';
import { FileData } from '../types';

export const parseExcelFile = (file: File): Promise<FileData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        
        // Handle potential default export mismatch from CDN/ESM imports
        // @ts-ignore
        const lib = XLSX.read ? XLSX : XLSX.default;
        
        if (!lib) {
            throw new Error("XLSX library failed to load");
        }

        // Use 'array' type which is more robust for browser binary strings
        const workbook = lib.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to array of arrays (header: 1 gives raw array of arrays)
        const jsonData = lib.utils.sheet_to_json(worksheet, { header: 1 });
        
        resolve({
          name: file.name,
          data: jsonData as any[][],
        });
      } catch (error) {
        console.error("Excel Parsing Error:", error);
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    // Use readAsArrayBuffer for better binary file compatibility
    reader.readAsArrayBuffer(file);
  });
};
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FileData, Language, Theme, AppState } from './types';
import { TRANSLATIONS, DEFAULT_METADATA } from './constants';
import { parseExcelFile } from './utils/excelParser';
import { Button } from './components/Button';
import { Moon, Sun, Upload, Download, RefreshCw, FileText, Check, ArrowUp, ArrowDown, Languages } from 'lucide-react';

export default function App() {
  // --- Global State ---
  const [lang, setLang] = useState<Language>('zh');
  const [theme, setTheme] = useState<Theme>('light');
  
  // --- Data State ---
  const [fileData, setFileData] = useState<FileData | null>(null);
  
  // --- Config State ---
  const [config, setConfig] = useState<AppState>({
    step: 1,
    headerRowIndex: 0,
    allHeaders: [],
    selectedHeaders: [],
    orderedHeaders: [],
    metadataJson: DEFAULT_METADATA,
    rootKeyType: 'custom',
    rootKeyCustomName: 'data',
    rootKeySelectedField: '',
  });

  const [metadataError, setMetadataError] = useState<string | null>(null);

  const t = TRANSLATIONS[lang];

  // --- Effects ---

  // Handle Theme Change
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Update headers when file or row selection changes
  useEffect(() => {
    if (fileData && fileData.data.length > config.headerRowIndex) {
      const row = fileData.data[config.headerRowIndex];
      const headers = row.map((cell: any) => String(cell || '').trim()).filter((h: string) => h !== '');
      setConfig(prev => ({
        ...prev,
        allHeaders: headers,
        selectedHeaders: [], // Reset selection when source changes
        orderedHeaders: [],
      }));
    }
  }, [fileData, config.headerRowIndex]);

  // --- Handlers ---

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const file = e.target.files[0];
        const parsed = await parseExcelFile(file);
        setFileData(parsed);
        setConfig(prev => ({
          ...prev,
          step: 2,
          metadataJson: prev.metadataJson,
        }));
      } catch (err) {
        console.error("Parse error", err);
        alert("文件解析失败，请检查文件格式是否正确。");
      } finally {
        // Reset input so the same file can be selected again if needed
        e.target.value = '';
      }
    }
  };

  const toggleHeaderSelection = (header: string) => {
    setConfig(prev => {
      const isSelected = prev.selectedHeaders.includes(header);
      let newSelected: string[];
      let newOrdered: string[];

      if (isSelected) {
        newSelected = prev.selectedHeaders.filter(h => h !== header);
        newOrdered = prev.orderedHeaders.filter(h => h !== header);
      } else {
        newSelected = [...prev.selectedHeaders, header];
        newOrdered = [...prev.orderedHeaders, header];
      }
      
      return {
        ...prev,
        selectedHeaders: newSelected,
        orderedHeaders: newOrdered,
        // If the root key field was deselected, reset it
        rootKeySelectedField: (prev.rootKeySelectedField === header && isSelected) ? '' : prev.rootKeySelectedField
      };
    });
  };

  const handleSelectAll = () => {
    setConfig(prev => ({
      ...prev,
      selectedHeaders: [...prev.allHeaders],
      orderedHeaders: [...prev.allHeaders]
    }));
  };

  const handleDeselectAll = () => {
    setConfig(prev => ({
      ...prev,
      selectedHeaders: [],
      orderedHeaders: [],
      rootKeySelectedField: ''
    }));
  };

  const moveHeader = (index: number, direction: 'up' | 'down') => {
    const newOrdered = [...config.orderedHeaders];
    if (direction === 'up' && index > 0) {
      [newOrdered[index], newOrdered[index - 1]] = [newOrdered[index - 1], newOrdered[index]];
    } else if (direction === 'down' && index < newOrdered.length - 1) {
      [newOrdered[index], newOrdered[index + 1]] = [newOrdered[index + 1], newOrdered[index]];
    }
    setConfig(prev => ({ ...prev, orderedHeaders: newOrdered }));
  };

  const validateMetadata = (json: string) => {
    if (!json.trim()) return true; // Empty is valid
    try {
      JSON.parse(json);
      setMetadataError(null);
      return true;
    } catch (e) {
      setMetadataError(t.errorInvalidJson);
      return false;
    }
  };

  const handleMetadataChange = (val: string) => {
    setConfig(prev => ({ ...prev, metadataJson: val }));
    if (!val.trim()) {
      setMetadataError(null);
      return;
    }
    try {
      JSON.parse(val);
      setMetadataError(null);
    } catch {
      // Don't set error state immediately on type
    }
  };

  // --- Core Logic: Generate JSON ---
  
  const generateFinalJson = useCallback((onlyPreview = false) => {
    if (!fileData) return null;

    // 1. Parse Metadata
    let metaObj = {};
    const metaString = config.metadataJson.trim();
    
    if (metaString) {
      try {
        metaObj = JSON.parse(metaString);
      } catch (e) {
        if (!onlyPreview) return null;
        metaObj = { error: "Invalid Metadata" };
      }
    }

    // 3. Extract Data
    const startRow = config.headerRowIndex + 1;
    const rawDataRows = fileData.data.slice(startRow);
    
    // Map headers to indices
    const headerIndices: Record<string, number> = {};
    const headerRow = fileData.data[config.headerRowIndex];
    
    if (Array.isArray(headerRow)) {
      headerRow.forEach((h: any, idx: number) => {
        const hStr = String(h || '').trim();
        if (hStr) headerIndices[hStr] = idx;
      });
    }

    // If preview, take slice, else take all
    const rowsToProcess = onlyPreview ? rawDataRows.slice(0, 1) : rawDataRows;

    // --- MODE 1: Dictionary/Map Mode (Root Key from Field) ---
    if (config.rootKeyType === 'field' && config.rootKeySelectedField) {
      const keyField = config.rootKeySelectedField;
      const resultObj: Record<string, any> = { ...metaObj }; // Start with metadata merged at root

      rowsToProcess.forEach(row => {
        // Find the key value for this row (e.g. "H")
        const keyIdx = headerIndices[keyField];
        const rawKey = row[keyIdx];
        
        // Skip rows where the key is missing/empty
        if (rawKey === undefined || rawKey === null || String(rawKey).trim() === '') return;
        
        const key = String(rawKey).trim();
        const itemObj: Record<string, any> = {};

        // Iterate based on user defined order, skipping the key field itself
        config.orderedHeaders.forEach(headerName => {
          if (headerName === keyField) return;

          const colIdx = headerIndices[headerName];
          if (colIdx !== undefined) {
            itemObj[headerName] = row[colIdx];
          } else {
            itemObj[headerName] = null;
          }
        });

        // Assign to root object using the dynamic key
        resultObj[key] = itemObj;
      });

      return resultObj;
    } 
    
    // --- MODE 2: List/Array Mode (Custom Root Name) ---
    else {
      const rootKey = config.rootKeyCustomName || 'data';
      
      const items = rowsToProcess.map(row => {
        const itemObj: Record<string, any> = {};
        config.orderedHeaders.forEach(headerName => {
          const colIdx = headerIndices[headerName];
          if (colIdx !== undefined) {
            itemObj[headerName] = row[colIdx];
          } else {
            itemObj[headerName] = null;
          }
        });
        return itemObj;
      });

      return {
        ...metaObj,
        [rootKey]: items
      };
    }

  }, [fileData, config]);

  const previewJson = useMemo(() => {
    const obj = generateFinalJson(true);
    return JSON.stringify(obj, null, 2);
  }, [generateFinalJson]);

  const handleExport = () => {
    if (!validateMetadata(config.metadataJson)) {
      alert(t.errorInvalidJson);
      return;
    }

    const finalObj = generateFinalJson(false);
    const blob = new Blob([JSON.stringify(finalObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Filename logic: OriginalName.json
    const originalName = fileData?.name || 'export';
    const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
    
    link.href = url;
    link.download = `${nameWithoutExt}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setFileData(null);
    setConfig(prev => ({
        ...prev,
        step: 1,
        selectedHeaders: [],
        orderedHeaders: [],
        rootKeySelectedField: '',
        allHeaders: []
    }));
  };

  // --- Render ---

  return (
    <div className="min-h-screen flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
              {t.title}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setLang(l => l === 'zh' ? 'en' : 'zh')}
              className="flex items-center gap-1 text-sm font-medium hover:text-blue-600 dark:hover:text-blue-400"
            >
              <Languages className="w-4 h-4" />
              {lang === 'zh' ? 'EN' : '中文'}
            </button>
            <button 
              onClick={() => setTheme(th => th === 'light' ? 'dark' : 'light')}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              title={theme === 'light' ? t.darkMode : t.lightMode}
            >
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
        
        {/* Upload Section */}
        {!fileData ? (
          <div className="max-w-xl mx-auto">
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-12 text-center hover:border-blue-500 dark:hover:border-blue-400 transition-colors bg-white dark:bg-gray-800">
              <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium mb-2">{t.uploadTitle}</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">{t.uploadDesc}</p>
              <label className="inline-block relative">
                <Button 
                  as="span" 
                  variant="primary" 
                  className="cursor-pointer"
                >
                   {t.clickToUpload}
                </Button>
                <input 
                  type="file" 
                  accept=".csv, .xls, .xlsx" 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                  onChange={handleFileUpload}
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Left Column: Configuration */}
            <div className="space-y-6">
              
              {/* File Info Bar */}
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg flex justify-between items-center border border-blue-100 dark:border-blue-800">
                <div>
                  <span className="font-semibold text-blue-900 dark:text-blue-100">{fileData.name}</span>
                  <span className="ml-2 text-sm text-blue-700 dark:text-blue-300">
                    ({t.totalRecords.replace('{{count}}', String(Math.max(0, fileData.data.length - config.headerRowIndex - 1)))})
                  </span>
                </div>
                <Button variant="secondary" size="sm" onClick={reset}>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  {t.resetBtn}
                </Button>
              </div>

              {/* Step 1: Row Selection */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300 flex items-center justify-center text-sm mr-2">1</span>
                  {t.step1Title}
                </h3>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="headerRow" 
                      checked={config.headerRowIndex === 0} 
                      onChange={() => setConfig(prev => ({ ...prev, headerRowIndex: 0 }))}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <span>{t.row1}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="headerRow" 
                      checked={config.headerRowIndex === 1} 
                      onChange={() => setConfig(prev => ({ ...prev, headerRowIndex: 1 }))}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <span>{t.row2}</span>
                  </label>
                </div>
              </div>

              {/* Step 2: Field Selection */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-4">
                   <h3 className="text-lg font-semibold flex items-center">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300 flex items-center justify-center text-sm mr-2">2</span>
                    {t.step2Title}
                  </h3>
                  <div className="flex gap-2 text-sm">
                    <button onClick={handleSelectAll} className="text-blue-600 hover:underline">{t.selectAll}</button>
                    <span className="text-gray-300">|</span>
                    <button onClick={handleDeselectAll} className="text-blue-600 hover:underline">{t.deselectAll}</button>
                  </div>
                </div>
               
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                  {config.allHeaders.map((header, idx) => (
                    <label key={idx} className="flex items-start gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-gray-600 transition-all">
                      <input 
                        type="checkbox"
                        checked={config.selectedHeaders.includes(header)}
                        onChange={() => toggleHeaderSelection(header)}
                        className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                      />
                      <span className="text-sm break-all leading-tight">{header}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Step 3: Metadata Editor */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold mb-2 flex items-center">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300 flex items-center justify-center text-sm mr-2">3</span>
                  {t.step3Title}
                </h3>
                <p className="text-sm text-gray-500 mb-3">{t.metadataDesc}</p>
                <div className="relative">
                  <textarea
                    value={config.metadataJson}
                    onChange={(e) => handleMetadataChange(e.target.value)}
                    className={`w-full h-32 p-3 font-mono text-sm bg-gray-50 dark:bg-gray-900 border rounded-md focus:ring-2 focus:outline-none ${metadataError ? 'border-red-500 focus:ring-red-200' : 'border-gray-300 dark:border-gray-600 focus:ring-blue-200'}`}
                    placeholder={t.metadataPlaceholder}
                  />
                  {metadataError && (
                    <div className="absolute bottom-2 right-2 text-xs text-red-500 bg-white dark:bg-gray-800 px-2 py-1 rounded border border-red-200">
                      {metadataError}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Preview & Final Config */}
            <div className="space-y-6 flex flex-col h-full">
              
              {/* Step 4: Configuration */}
               <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300 flex items-center justify-center text-sm mr-2">4</span>
                  {t.step4Title}
                </h3>
                
                {/* Root Key Config */}
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2">{t.rootKeyConfig}</label>
                  <div className="flex flex-col gap-3">
                    <label className="flex items-center gap-2">
                      <input 
                        type="radio" 
                        name="rootKeyType"
                        checked={config.rootKeyType === 'custom'}
                        onChange={() => setConfig(prev => ({ ...prev, rootKeyType: 'custom' }))}
                        className="text-blue-600"
                      />
                      <span className="text-sm">{t.useCustomName}</span>
                      {config.rootKeyType === 'custom' && (
                        <input 
                          type="text" 
                          value={config.rootKeyCustomName}
                          onChange={(e) => setConfig(prev => ({ ...prev, rootKeyCustomName: e.target.value }))}
                          placeholder={t.enterRootName}
                          className="ml-2 px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                        />
                      )}
                    </label>
                    
                    <label className="flex items-center gap-2">
                       <input 
                        type="radio" 
                        name="rootKeyType"
                        checked={config.rootKeyType === 'field'}
                        onChange={() => setConfig(prev => ({ ...prev, rootKeyType: 'field' }))}
                        className="text-blue-600"
                      />
                      <span className="text-sm">{t.useFieldName}</span>
                       {config.rootKeyType === 'field' && (
                        <select 
                          value={config.rootKeySelectedField}
                          onChange={(e) => setConfig(prev => ({ ...prev, rootKeySelectedField: e.target.value }))}
                          className="ml-2 px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 max-w-[150px]"
                        >
                          <option value="" disabled>{t.selectField}</option>
                          {config.selectedHeaders.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      )}
                    </label>
                  </div>
                </div>

                {/* Reordering */}
                {config.selectedHeaders.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium mb-2">{t.reorderDesc}</label>
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-700 max-h-48 overflow-y-auto">
                      {config.orderedHeaders.map((header, idx) => (
                        <div key={header} className="flex items-center justify-between p-2 border-b last:border-0 border-gray-100 dark:border-gray-800 text-sm hover:bg-white dark:hover:bg-gray-800 transition-colors">
                          <span className="truncate flex-1 font-mono text-xs">{header}</span>
                          <div className="flex gap-1">
                            <button 
                              onClick={() => moveHeader(idx, 'up')}
                              disabled={idx === 0}
                              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded disabled:opacity-30"
                              title={t.moveUp}
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={() => moveHeader(idx, 'down')}
                              disabled={idx === config.orderedHeaders.length - 1}
                              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded disabled:opacity-30"
                              title={t.moveDown}
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Code Preview */}
              <div className="flex-1 flex flex-col bg-gray-900 rounded-xl overflow-hidden shadow-lg border border-gray-700 min-h-[400px]">
                <div className="bg-gray-800 px-4 py-2 flex justify-between items-center border-b border-gray-700">
                  <span className="text-gray-300 text-sm font-mono">{t.previewTitle}</span>
                  <div className="flex space-x-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  </div>
                </div>
                <div className="flex-1 p-4 overflow-auto custom-scrollbar relative">
                   <pre className="font-mono text-sm text-green-400">
                      <code>{previewJson}</code>
                   </pre>
                </div>
              </div>
              
              {/* Action Button */}
              <div className="sticky bottom-4 z-10">
                 <Button 
                  onClick={handleExport}
                  disabled={config.selectedHeaders.length === 0 || !!metadataError}
                  size="lg"
                  className="w-full shadow-xl"
                >
                  <Download className="w-5 h-5 mr-2" />
                  {t.exportBtn}
                </Button>
              </div>

            </div>
          </div>
        )}
      </main>
    </div>
  );
}
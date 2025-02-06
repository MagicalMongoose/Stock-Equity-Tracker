"use client";
/*
Download your entire Report CSV from Robinhood, then convert it with this:
*/

import React, { useState } from 'react';
import Papa from 'papaparse';

const CSVTransformer = () => {
    const [csvText, setCsvText] = useState('');
    const [error, setError] = useState(null);

    const cleanAmount = (amount) => {
        if (!amount) return '';
        return amount.replace(/[()$,]/g, '').trim();
    };

    const cleanPrice = (price) => {
        if (!price) return '';
        return price.replace(/[$,]/g, '').trim();
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(csvText);
    };

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        setError(null);

        if (!file) {
            setError("Please select a file");
            return;
        }

        if (file.type !== "text/csv" && !file.name.endsWith('.csv')) {
            setError("Please upload a CSV file");
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;

            Papa.parse(text, {
                header: true,
                skipEmptyLines: 'greedy',
                complete: (results) => {
                    try {
                        // Filter for only Buy and Sell transactions and create new structure
                        const transformedRows = results.data
                            .filter(row => row['Trans Code'] && ['Buy', 'Sell'].includes(row['Trans Code']))
                            .map(row => ({
                                'Date': row['Activity Date'] || '',
                                'Stock Ticker': row['Instrument'] || '',
                                'Order': row['Trans Code'] || '',
                                'Quantity': row['Quantity'] || '',
                                'Price': cleanPrice(row['Price']) || '',
                                'Amount': cleanAmount(row['Amount']) || ''
                            }));

                        if (transformedRows.length === 0) {
                            setError("No Buy or Sell transactions found in the file");
                            return;
                        }

                        // Create header row
                        const headers = ['Date', 'Stock Ticker', 'Order', 'Quantity', 'Price', 'Amount'];

                        // Combine headers with data
                        const finalData = [headers, ...transformedRows.map(row => headers.map(header => row[header]))];

                        // Generate CSV text with custom formatting
                        const csvText = Papa.unparse(finalData, {
                            quotes: false,
                            quoteChar: '"'
                        });
                        setCsvText(csvText);
                    } catch (err) {
                        setError("Error processing file: " + err.message);
                    }
                },
                error: (error) => {
                    setError("Error parsing CSV: " + error.message);
                }
            });
        };

        reader.onerror = () => {
            setError("Error reading file");
        };

        reader.readAsText(file);
    };

    return (
        <div className="p-4">
            <h1 className="text-xl font-bold mb-4">Transform Robinhood Report CSV to Simple CSV for Analysis</h1>

            <div className="flex items-center space-x-4">
                <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileUpload}
                    className="px-3 py-1 text-sm text-black bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded"
                />
                {csvText && (
                    <button
                        onClick={handleCopy}
                        className="px-3 py-1 text-sm text-black bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded"
                    >
                        Copy
                    </button>
                )}
            </div>

            {error && (
                <div className="text-red-500 text-sm mt-4">
                    {error}
                </div>
            )}
        </div>
    );
};

export default CSVTransformer;
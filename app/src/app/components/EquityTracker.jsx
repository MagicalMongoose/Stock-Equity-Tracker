"use client";

import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Papa from 'papaparse';
import _ from 'lodash';

const API_KEY = process.env.API_KEY;
// const CACHE_KEY = "cached_stock_prices";

const EquityTracker = () => {
    const [data, setData] = useState({
        transactions: [],
        chartData: [],
        stocks: new Set(),
        prices: {},
        isLoading: false,
        error: null
    });

    useEffect(() => {
        if (data.stocks.length > 0) {
            fetchStockPrices(Array.from(data.stocks));
        }
    }, [data.stocks]);

    const fetchStockPrices = async (stocks) => {
        setData(prev => ({ ...prev, isLoading: true }));
        let updatedPrices = { ...data.prices };
        // let cachedPrices = {};

        try {
            const res = await fetch('/api/cache');
            cachedPrices = await res.json();
        } catch (error) {
            console.error("Error fetching cached data:", error);
        }

        for (const stock of stocks) {
            // if (!cachedPrices[stock]) {
            if (!updatedPrices[stock]) {
                try {
                    const response = await fetch(`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${stock}&apikey=${API_KEY}`);
                    const result = await response.json();
                    console.log(response)

                    if (result["Time Series (Daily)"]) {
                        updatedPrices[stock] = Object.fromEntries(
                            Object.entries(result["Time Series (Daily)"]).map(([date, details]) => [date, parseFloat(details["4. close"])])
                        );
                    }
                } catch (error) {
                    console.error("Error fetching stock data:", error);
                    updatedPrices[stock] = {};
                }
            }
        }

        setData(prev => {
            const newData = {
                ...prev,
                prices: updatedPrices,
                isLoading: false
            };
            // Reprocess chart data with new prices
            newData.chartData = processTransactions(newData.transactions, updatedPrices);
            return newData;
        });
    };

    const processTransactions = (transactions, prices) => {
        if (!transactions.length) return [];

        const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
        const positions = {};
        const chartData = [];

        // Get all unique dates from transactions and API data
        const allDates = new Set();
        sorted.forEach(t => allDates.add(t.date));
        Object.values(prices).forEach(priceData => {
            Object.keys(priceData).forEach(date => allDates.add(date));
        });

        const dateArray = Array.from(allDates).sort();
        const THRESHOLD_PERCENT = 1; // 1% threshold for "Others" category

        dateArray.forEach(date => {
            // Process any transactions for this date
            const dayTransactions = sorted.filter(t => t.date === date);
            dayTransactions.forEach(t => {
                const shares = t.order === 'Buy' ? t.quantity : -t.quantity;
                positions[t.ticker] = (positions[t.ticker] || 0) + shares;
            });

            // First, calculate all equities and total
            const tempEquities = {};
            let totalEquity = 0;


            Object.entries(positions).forEach(([stock, shares]) => {
                if (shares !== 0) {
                    // Try to get price from API data, fall back to transaction price
                    let stockPrice = prices[stock]?.[date];
                    if (!stockPrice) {
                        const lastTransaction = sorted
                            .filter(t => t.ticker === stock && t.date <= date)
                            .pop();
                        stockPrice = lastTransaction?.price || 0;
                    }
                    const equity = shares * stockPrice;
                    tempEquities[stock] = equity;
                    totalEquity += equity;
                }
            });

            // Calculate portfolio value for this date
            const dataPoint = {
                date,
                totalEquity
            };

            // Calculate percentages and split into main/others
            if (totalEquity > 0) {
                const stockEquities = Object.entries(tempEquities)
                    .map(([stock, equity]) => ({
                        stock,
                        equity,
                        percentage: (equity / totalEquity) * 100
                    }))
                    .sort((a, b) => b.equity - a.equity);

                // Split based on threshold
                const mainHoldings = stockEquities.filter(s => s.percentage >= THRESHOLD_PERCENT);
                const otherHoldings = stockEquities.filter(s => s.percentage < THRESHOLD_PERCENT);

                mainHoldings.forEach(holding => {
                    dataPoint[`${holding.stock}_equity`] = holding.equity;
                });

                if (otherHoldings.length > 0) {
                    const othersEquity = otherHoldings.reduce((sum, holding) => sum + holding.equity, 0);
                    if (othersEquity > 0) {
                        dataPoint.Others_equity = othersEquity;
                    }
                }
            }

            chartData.push(dataPoint);
        });

        return chartData;
    };

    const validateCSV = (data) => {
        const requiredColumns = ['Date', 'Stock Ticker', 'Order', 'Quantity', 'Price', 'Amount'];
        const headers = Object.keys(data[0]);
        return requiredColumns.every(col => headers.includes(col));
    };

    const handleCSVUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const csv = e.target.result;
            Papa.parse(csv, {
                header: true,
                skipEmptyLines: true,
                complete: (result) => {
                    if (!validateCSV(result.data)) {
                        alert('Invalid CSV format.\n' +
                            'Please ensure your CSV has the columns:\n' +
                            'Date, Stock Ticker, Order, Quantity, Price, Amount');
                        return;
                    }

                    const transactions = result.data.map(row => ({
                        date: row.Date,
                        ticker: row['Stock Ticker'],
                        order: row.Order,
                        quantity: parseFloat(row.Quantity),
                        price: parseFloat(row.Price.replace('$','')),
                        amount: parseFloat(row.Amount.replace(/[($)]/g, ''))
                    }));

                    const uniqueStocks = new Set(transactions.map(t => t.ticker));

                    setData(prev => ({
                        ...prev,
                        transactions,
                        stocks: uniqueStocks,
                        chartData: processTransactions(transactions, prev.prices)
                    }));
                }
            });
        };

        reader.readAsText(file);
    };

    return (
        <div className="w-full max-w-4xl mx-auto bg-white shadow-md rounded-lg p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Portfolio Equity Over Time</h2>

            {/* CSV Upload */}
            <div className="mb-4">
                <input
                    type="file"
                    accept=".csv"
                    onChange={handleCSVUpload}
                    className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none"
                />
            </div>

            {/* Stock Chart */}
            {data.isLoading ? (
                <div className="text-center py-4">Loading stock data...</div>
            ) : (
                <div className="min-h-[400px] h-auto">
                    <ResponsiveContainer width="100%" height={800}>
                        <AreaChart data={data.chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis
                                min="-1000"
                            />
                            <Tooltip
                                formatter={(value) => value.toLocaleString('en-US', {
                                    style: 'currency',
                                    currency: 'USD'
                                })}
                            />
                            <Legend />
                            {(() => {
                                const lastDataPoint = data.chartData[data.chartData.length - 1] || {};
                                const totalEquity = lastDataPoint.totalEquity || 0;

                                // Get all stock keys (including Others) and their current values
                                const stockKeys = Object.keys(lastDataPoint)
                                    .filter(key => key.endsWith('_equity'))
                                    .map(key => ({
                                        key: key,
                                        name: key.replace('_equity', ''),
                                        equity: lastDataPoint[key] || 0,
                                        percentage: ((lastDataPoint[key] || 0) / totalEquity) * 100
                                    }))
                                    .sort((a, b) => b.percentage - a.percentage); // Sort by percentage descending

                                // Render areas in reverse order (larger percentages at bottom)
                                return stockKeys.map((stock, index) => (
                                    <Area
                                        key={stock.name}
                                        type="monotone"
                                        dataKey={stock.key}
                                        name={`${stock.name} (${stock.percentage.toFixed(1)}%)`}
                                        stackId="1"
                                        fill={stock.name === 'Others' ? '#808080' : `hsl(${index * 137.508}deg, 70%, 65%)`}
                                        stroke={stock.name === 'Others' ? '#666666' : `hsl(${index * 137.508}deg, 70%, 45%)`}
                                    />
                                ));
                            })()}

                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Transaction History */}
            <div className="mt-6">
                <h3 className="text-lg font-semibold mb-2 text-black">Transaction History</h3>
                <div className="space-y-2">
                    {data.transactions.length > 0 ? (
                        data.transactions.map((t, i) => (
                            <div
                                key={i}
                                className={`p-2 rounded relative text-black ${t.order === 'Buy' ? 'bg-green-100' : 'bg-red-100'}`}
                            >
                                {t.date}: {t.ticker} --- {t.order} {Math.abs(t.quantity)} shares @ ${t.price.toFixed(2)} --- (${t.amount.toFixed(2)})
                            </div>
                        ))
                    ) : (
                        <p className="text-gray-500">No transactions uploaded.</p>
                    )}
                </div>
            </div>
        </div>
    );



};

export default EquityTracker;

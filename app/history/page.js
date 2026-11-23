'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import HospitalInfoBanner from '@/components/HospitalInfoBanner';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';

const historyDateFormatter = new Intl.DateTimeFormat('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true, timeZone: 'America/Lima'
});

const historyMetrics = [
    {
        label: 'Temp.OUT (°C)', field: 'dsTemperature', color: 'rgba(6, 182, 212, 1)',
        title: 'Temperature OUT (Probe) - °C', marker: 'bg-cyan-500',
        panel: 'from-cyan-50 to-cyan-100 border-cyan-200',
    },
    {
        label: 'Temp.IN (°C)', field: 'temperature', color: 'rgba(244, 63, 94, 1)',
        title: 'Temperature IN (Ambient) - °C', marker: 'bg-rose-500',
        panel: 'from-rose-50 to-rose-100 border-rose-200',
    },
    {
        label: 'Hum.IN (%)', field: 'humidity', color: 'rgba(99, 102, 241, 1)',
        title: 'Humidity IN (Ambient) - %', marker: 'bg-indigo-500',
        panel: 'from-indigo-50 to-indigo-100 border-indigo-200',
    },
];

export default function HistoryPage() {
    const { user, hydrated } = useAuth();
    const [devices, setDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState('');
    const [searchResult, setSearchResult] = useState(null);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [loading, setLoading] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const [error, setError] = useState('');

    const apiBase = process.env.NEXT_PUBLIC_API_BASE_RAILWAY;

    useEffect(() => {
        if (hydrated && user) {
            fetch(`${apiBase}/api/devices/hospital/${user.hospital._id}`)
                .then(res => res.json())
                .then(setDevices);
        }
    }, [hydrated, user, apiBase]);

    const fetchHistory = async () => {
        const device = devices.find(dev => dev._id === selectedDevice);
        if (!device) {
            setError('Please select a device');
            return;
        }

        if (from && to && from > to) {
            setError('From Date must be on or before To Date.');
            return;
        }

        setLoading(true);
        setError('');
        setSearchResult(null);

        try {
            const url = new URL(`${apiBase}/api/v1/datas/by-device/${encodeURIComponent(device._id)}`);
            if (from) url.searchParams.set('from', new Date(`${from}T00:00:00.000-05:00`).toISOString());
            if (to) url.searchParams.set('to', new Date(`${to}T23:59:59.999-05:00`).toISOString());

            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const records = await response.json();
            if (!Array.isArray(records)) throw new Error('Invalid history response');

            setSearchResult({ device, from, to, records });
            if (records.length === 0) {
                setError('No data found for the selected criteria');
            }
        } catch (err) {
            console.error('Fetch history error:', err);
            setError('Failed to load data. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const groupByDay = (dataset) => {
        return dataset.reduce((acc, item) => {
            const localDate = new Date(item.datetime).toLocaleDateString('es-PE', {
                timeZone: 'America/Lima',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });

            if (!acc[localDate]) acc[localDate] = [];
            acc[localDate].push(item);
            return acc;
        }, {});
    };

    if (!hydrated || !user) return null;

    const data = searchResult?.records ?? [];
    const selectedDeviceInfo = searchResult?.device;
    const filtersMatch = searchResult !== null && selectedDeviceInfo._id === selectedDevice
        && searchResult.from === from && searchResult.to === to;

    const chartData = ({ label, field, color }, dayData, labels) => ({
        labels,
        datasets: [{
            label,
            data: dayData.map(d => parseFloat(d[field])),
            fill: false,
            borderColor: color,
            backgroundColor: color,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
        }],
    });

    const chartOptions = {
        maintainAspectRatio: false,
        responsive: true,
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: {
                    font: {
                        size: 12,
                        weight: '600'
                    },
                    padding: 15,
                    usePointStyle: true,
                }
            },
            tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: 12,
                titleFont: {
                    size: 14,
                    weight: 'bold'
                },
                bodyFont: {
                    size: 13
                }
            }
        },
        scales: {
            x: {
                grid: {
                    display: true,
                    color: 'rgba(0, 0, 0, 0.05)',
                },
                ticks: {
                    maxRotation: 45,
                    minRotation: 45,
                    font: {
                        size: 10
                    }
                },
            },
            y: {
                grid: {
                    display: true,
                    color: 'rgba(0, 0, 0, 0.05)',
                },
                ticks: {
                    font: {
                        size: 11
                    }
                }
            }
        },
    };

    const dailyCharts = Object.entries(groupByDay(data)).map(([day, records]) => {
        const labels = records.map(record => historyDateFormatter.format(new Date(record.datetime)));
        const charts = historyMetrics.map(metric => ({
            ...metric,
            data: chartData(metric, records, labels),
        }));
        return { day, count: records.length, charts };
    });

    const generatePDF = async () => {
        if (!filtersMatch || !data.length || loading || exportingPdf) return;

        setError('');
        setExportingPdf(true);
        try {
            const { downloadHistoryPdf } = await import('./downloadHistoryPdf');
            downloadHistoryPdf({
                user,
                searchResult,
                dailyCharts,
                chartOptions,
                dateFormatter: historyDateFormatter,
            });
        } catch (err) {
            console.error('History PDF error:', err);
            setError('Failed to generate the PDF. Please try again.');
        } finally {
            setExportingPdf(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                Historical Data Analysis
                            </h1>
                            <p className="text-sm text-gray-600 mt-1">View and analyze historical temperature and humidity data</p>
                        </div>
                    </div>
                </div>
            </div>

            <HospitalInfoBanner user={user} />

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Filters Card */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6">
                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                        Search Filters
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Device Selection */}
                        <div className="lg:col-span-2">
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Select Device
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                                    </svg>
                                </div>
                                <select
                                    value={selectedDevice}
                                    onChange={e => setSelectedDevice(e.target.value)}
                                    className="pl-10 pr-4 py-2.5 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                                >
                                    <option value="">-- Select Device --</option>
                                    {devices.map(dev => (
                                        <option key={dev._id} value={dev._id}>
                                            {dev.name} ({dev.brand} {dev.model})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Date From */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                From Date
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <input
                                    type="date"
                                    value={from}
                                    onChange={e => setFrom(e.target.value)}
                                    className="pl-10 pr-4 py-2.5 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                />
                            </div>
                        </div>

                        {/* Date To */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                To Date
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <input
                                    type="date"
                                    value={to}
                                    onChange={e => setTo(e.target.value)}
                                    className="pl-10 pr-4 py-2.5 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Search Button */}
                    <div className="mt-4 flex gap-3">
                        <button
                            onClick={fetchHistory}
                            disabled={loading || exportingPdf}
                            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <>
                                    <svg className="animate-spin w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Loading...
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    Search Data
                                </>
                            )}
                        </button>

                        {data.length > 0 && selectedDeviceInfo && (
                            <button
                                onClick={generatePDF}
                                disabled={!filtersMatch || loading || exportingPdf}
                                title={filtersMatch ? undefined : 'Search again to download a report with these filters'}
                                className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-md font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                {exportingPdf ? 'Generating PDF…' : 'Download PDF Report'}
                            </button>
                        )}
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mt-4 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg">
                            <div className="flex items-start gap-3">
                                <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-red-800 text-sm font-medium">{error}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Device Info Card */}
                {data.length > 0 && selectedDeviceInfo && (
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-md border border-blue-200 p-6 mb-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Report Information
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="bg-white rounded-lg p-4 border border-blue-200">
                                <p className="text-xs text-gray-600 uppercase font-semibold mb-1">Hospital</p>
                                <p className="text-gray-900 font-bold">{user.hospital.name}</p>
                            </div>
                            <div className="bg-white rounded-lg p-4 border border-blue-200">
                                <p className="text-xs text-gray-600 uppercase font-semibold mb-1">Area</p>
                                <p className="text-gray-900 font-bold">{user.area.name}</p>
                            </div>
                            <div className="bg-white rounded-lg p-4 border border-blue-200">
                                <p className="text-xs text-gray-600 uppercase font-semibold mb-1">Device</p>
                                <p className="text-gray-900 font-bold">{selectedDeviceInfo.name}</p>
                            </div>
                            <div className="bg-white rounded-lg p-4 border border-blue-200">
                                <p className="text-xs text-gray-600 uppercase font-semibold mb-1">Model</p>
                                <p className="text-gray-900 font-bold">{selectedDeviceInfo.model}</p>
                            </div>
                            <div className="bg-white rounded-lg p-4 border border-blue-200">
                                <p className="text-xs text-gray-600 uppercase font-semibold mb-1">Brand</p>
                                <p className="text-gray-900 font-bold">{selectedDeviceInfo.brand}</p>
                            </div>
                            <div className="bg-white rounded-lg p-4 border border-blue-200">
                                <p className="text-xs text-gray-600 uppercase font-semibold mb-1">Serie</p>
                                <p className="text-gray-900 font-bold">{selectedDeviceInfo.serie}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Data Table */}
                {data.length > 0 && (
                    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mb-6">
                        <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                4-Hour Data Records ({data.length} entries)
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                        Datetime (UTC-5)
                                    </th>
                                    <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                                        Temp.OUT
                                    </th>
                                    <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                                        Temp.IN
                                    </th>
                                    <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                                        Hum.IN
                                    </th>
                                </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                {data.map((d, i) => (
                                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {historyDateFormatter.format(new Date(d.datetime))}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-cyan-100 text-cyan-800">
                                                {d.dsTemperature} °C
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-rose-100 text-rose-800">
                                                {d.temperature} °C
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-indigo-100 text-indigo-800">
                                                {d.humidity} %
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Charts by Day */}
                {dailyCharts.map(({ day, count, charts }) => (
                    <div key={day} className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mb-6">
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                Historical Charts - {day}
                            </h2>
                            <p className="text-blue-100 text-sm mt-1">{count} data points recorded</p>
                        </div>

                        <div className="p-6 space-y-6">
                            {charts.map(chart => (
                                <div key={chart.field} className={`bg-gradient-to-br rounded-lg border p-4 ${chart.panel}`}>
                                    <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                                        <span className={`w-3 h-3 rounded-full ${chart.marker}`} />
                                        {chart.title}
                                    </h3>
                                    <div className="bg-white rounded-lg p-4">
                                        <div className="h-80">
                                            <Line data={chart.data} options={chartOptions} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {/* Empty State */}
                {!loading && data.length === 0 && !error && (
                    <div className="text-center py-16 bg-white rounded-xl shadow-sm border border-gray-200">
                        <svg className="w-24 h-24 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">No Data Available</h3>
                        <p className="text-gray-600 mb-6">Select a device and date range to view historical data</p>
                        <div className="flex flex-col items-center gap-2 text-sm text-gray-500">
                            <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>Select a device from the dropdown above</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span>Choose a date range (optional)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <span>Click &quot;Search Data&quot; to load results</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="bg-white border-t border-gray-200 mt-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="text-sm text-gray-600">
                            © 2025 MHUTEMP Historical Data Analysis
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span>Export to PDF available</span>
                            </div>
                            <div className="h-4 w-px bg-gray-300"></div>
                            <span>Timezone: America/Lima (UTC-5)</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

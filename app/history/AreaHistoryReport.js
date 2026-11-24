'use client';

import { useEffect, useRef, useState } from 'react';
import { buildDailyCharts, chartOptions, fetchDeviceHistory, historyDateFormatter, previousLimaWeek } from './historyReportData';

const fieldClass = 'mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 disabled:bg-gray-100';
const actionClass = 'rounded-lg px-4 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50';

export default function AreaHistoryReport({ hospital, areas, groups, token, deviceListState }) {
    const [areaId, setAreaId] = useState('');
    const [preset, setPreset] = useState('week');
    const [range, setRange] = useState(previousLimaWeek);
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(null);
    const [error, setError] = useState('');
    const request = useRef(null);
    const active = useRef(false);
    const options = [...new Map([...groups.map(group => group.area), ...areas]
        .map(area => [area._id, area])).values()].sort((a, b) => a.name.localeCompare(b.name));
    const selectedArea = options.find(area => area._id === areaId);
    const devices = groups.find(group => group.area._id === areaId)?.items ?? [];
    const { from, to } = range;
    const busy = loading || Boolean(exporting);
    const currentIds = new Set(devices.map(device => device._id));
    const canDownload = Boolean(deviceListState === 'ready' && report && report.area._id === selectedArea?._id && report.from === from && report.to === to
        && report.entries.length === currentIds.size && report.entries.every(entry => currentIds.has(entry.device._id)));

    useEffect(() => {
        active.current = true;
        return () => {
            active.current = false;
            request.current?.abort();
        };
    }, []);

    async function loadReport(event) {
        event.preventDefault();
        if (busy) return;
        setError('');
        setReport(null);
        if (!selectedArea || !devices.length || !from || !to || from > to) {
            setError(!devices.length ? 'Select an area with devices.' : 'Choose a valid date range.');
            return;
        }

        const controller = new AbortController();
        request.current = controller;
        setLoading(true);
        try {
            // Limit simultaneous requests when an area contains many devices.
            const entries = [];
            for (let index = 0; index < devices.length; index += 5) {
                const batch = await Promise.all(devices.slice(index, index + 5).map(async device => {
                    try {
                        const records = await fetchDeviceHistory(device._id, { from, to, token, signal: controller.signal });
                        return { device, records };
                    } catch {
                        throw new Error(`Could not load records for ${device.name}. Try again to generate the complete report.`);
                    }
                }));
                entries.push(...batch);
            }
            if (!controller.signal.aborted) {
                entries.sort((a, b) => a.device.name.localeCompare(b.device.name));
                setReport({ area: selectedArea, from, to, entries });
            }
        } catch (err) {
            if (!controller.signal.aborted) setError(err.message);
            controller.abort();
        } finally {
            if (active.current) setLoading(false);
        }
    }

    async function download(mode) {
        if (!canDownload || busy) return;
        setError('');
        setExporting(mode);
        try {
            const { downloadAreaHistoryPdf } = await import('./downloadHistoryPdf');
            if (!active.current) return;
            downloadAreaHistoryPdf({
                hospital,
                area: selectedArea,
                from,
                to,
                entries: report.entries.map(entry => ({
                    ...entry,
                    dailyCharts: mode === 'report' ? buildDailyCharts(entry.records) : [],
                })),
                includeCharts: mode === 'report',
                chartOptions,
                dateFormatter: historyDateFormatter,
            });
        } catch (err) {
            if (active.current) {
                console.error('Area history PDF error:', err);
                setError('Failed to generate the PDF. Please try again.');
            }
        } finally {
            if (active.current) setExporting(null);
        }
    }

    return (
        <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-lg font-bold text-gray-900">Area history report</h2>
                <form onSubmit={loadReport} className="space-y-4">
                    <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="text-sm font-semibold">
                            Area
                            <select className={fieldClass} value={areaId} onChange={event => setAreaId(event.target.value)} required>
                                <option value="">Select an area</option>
                                {options.map(area => <option key={area._id} value={area._id}>{area.name}</option>)}
                            </select>
                        </label>
                        <label className="text-sm font-semibold">
                            Period
                            <select className={fieldClass} value={preset} onChange={event => {
                                setPreset(event.target.value);
                                if (event.target.value === 'week') setRange(previousLimaWeek());
                            }}>
                                <option value="week">Previous week</option>
                                <option value="custom">Custom dates</option>
                            </select>
                        </label>
                        <label className="text-sm font-semibold">
                            From Date
                            <input className={fieldClass} type="date" value={from} readOnly={preset === 'week'} max={to || undefined} required
                                onChange={event => setRange({ ...range, from: event.target.value })} />
                        </label>
                        <label className="text-sm font-semibold">
                            To Date
                            <input className={fieldClass} type="date" value={to} readOnly={preset === 'week'} min={from || undefined} required
                                onChange={event => setRange({ ...range, to: event.target.value })} />
                        </label>
                    </fieldset>
                    {preset === 'week' && <p className="text-sm text-gray-600">Previous Monday through Sunday, Lima time.</p>}
                    {deviceListState === 'loading' && <p role="status" className="text-sm text-gray-600">Loading devices…</p>}
                    {deviceListState === 'error' && <p role="alert" className="text-sm text-red-800">Failed to load devices.</p>}
                    {deviceListState === 'ready' && selectedArea && devices.length === 0 && (
                        <p className="text-sm text-gray-600">This area has no registered devices.</p>
                    )}
                    <div className="flex flex-wrap gap-3">
                        <button type="submit" disabled={busy || deviceListState !== 'ready' || !devices.length || !from || !to}
                            className={`${actionClass} bg-blue-700 text-white hover:bg-blue-800`}>
                            {loading ? 'Loading…' : 'Search Area Data'}
                        </button>
                        <button type="button" onClick={() => download('data')} disabled={busy || !canDownload}
                            className={`${actionClass} bg-green-700 text-white hover:bg-green-800`}>
                            {exporting === 'data' ? 'Generating PDF…' : 'Download Data PDF'}
                        </button>
                        <button type="button" onClick={() => download('report')} disabled={busy || !canDownload}
                            className={`${actionClass} border border-green-600 text-green-800 hover:bg-green-50`}>
                            {exporting === 'report' ? 'Generating PDF…' : 'Download PDF Report'}
                        </button>
                    </div>
                </form>
                {error && <p role="alert" className="mt-4 text-sm text-red-800">{error}</p>}
            </div>
            {canDownload && (
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h3 className="font-bold text-gray-900">{selectedArea.name} · {report.entries.length} devices</h3>
                    <ul className="mt-2 divide-y divide-gray-200">
                        {report.entries.map(({ device, records }) => (
                            <li key={device._id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                                <span>{device.name}{device.serie && ` · ${device.serie}`}{device.archived_at && ' · Archivado'}</span>
                                <span className="text-gray-700">{records.length ? `${records.length} records` : 'No records in this period'}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}

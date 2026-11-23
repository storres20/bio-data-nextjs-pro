'use client';

import { useState } from 'react';
import { authHeaders } from '@/lib/hospitalAccess';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_RAILWAY;
const fields = [
    ['name', 'Device name'],
    ['brand', 'Brand'],
    ['model', 'Model'],
    ['serie', 'Serial number'],
];

export default function CreateDeviceForm({ hospital, areas, areasLoading, token, onCreated }) {
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    async function createDevice(event) {
        event.preventDefault();
        if (saving) return;
        const values = new FormData(event.currentTarget);
        const details = Object.fromEntries(fields.map(([name]) => [name, values.get(name).trim()]));
        const areaId = values.get('area_id');
        setError('');
        if (Object.values(details).some(value => !value) || !areas.some(area => area._id === areaId)) {
            setError('Enter the device details and select an area.');
            return;
        }
        setSaving(true);
        try {
            const response = await fetch(`${apiBase}/api/devices`, {
                method: 'POST',
                headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...details, hospital_id: hospital._id, area_id: areaId }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.message || 'Could not create the device.');
            }
            const device = await response.json();
            onCreated({
                ...device,
                hospital_id: hospital,
                area_id: areas.find(area => area._id === areaId),
            });
            setMessage(`${details.name} added to ${hospital.name}. Assign its sensor from the device card.`);
            setOpen(false);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
            {!open && (
                <button
                    type="button"
                    onClick={() => { setOpen(true); setMessage(''); setError(''); }}
                    className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800"
                >
                    Add Device
                </button>
            )}
            {message && <p role="status" className="mt-3 text-sm text-green-800">{message}</p>}
            {open && (
                <form onSubmit={createDevice} className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-semibold text-gray-900">Add Device</h2>
                    <p className="mb-4 text-sm text-gray-700">{hospital.name}</p>
                    <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <label className="block text-sm font-semibold">
                            Area
                            <select name="area_id" defaultValue="" required className="mt-1 block w-full rounded border border-gray-300 p-2">
                                <option value="">{areasLoading ? 'Loading areas…' : 'Select an area'}</option>
                                {areas.map(area => <option key={area._id} value={area._id}>{area.name}</option>)}
                            </select>
                        </label>
                        {fields.map(([name, label]) => (
                            <label key={name} className="block text-sm font-semibold">
                                {label}
                                <input required name={name} type="text" className="mt-1 block w-full rounded border border-gray-300 p-2" />
                            </label>
                        ))}
                    </fieldset>
                    {!areasLoading && areas.length === 0 && (
                        <p className="mt-3 text-sm text-gray-700">No areas are configured for this hospital.</p>
                    )}
                    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
                    <div className="mt-4 flex gap-3">
                        <button type="submit" disabled={saving || areasLoading || areas.length === 0} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50">
                            {saving ? 'Saving…' : 'Save Device'}
                        </button>
                        <button type="button" disabled={saving} onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2">Cancel</button>
                    </div>
                </form>
            )}
        </section>
    );
}

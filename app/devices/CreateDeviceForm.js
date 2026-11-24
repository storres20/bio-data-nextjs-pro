'use client';

import { useEffect, useState } from 'react';
import { authHeaders } from '@/lib/hospitalAccess';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_RAILWAY;
const fields = [
    ['name', 'Device name'],
    ['brand', 'Brand'],
    ['model', 'Model'],
    ['serie', 'Serial number'],
];

export default function CreateDeviceForm({ hospital, editingDevice, token, onSaved, onCancelEdit }) {
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [areas, setAreas] = useState(null);
    const [catalogError, setCatalogError] = useState('');
    const formOpen = open || Boolean(editingDevice);

    useEffect(() => {
        if (!formOpen) return;
        const controller = new AbortController();
        setAreas(null);
        setCatalogError('');
        fetch(`${apiBase}/api/devices/area-catalog`, {
            headers: authHeaders(token),
            signal: controller.signal,
        })
            .then(response => {
                if (!response.ok) throw new Error('Could not load the area catalog.');
                return response.json();
            })
            .then(result => {
                if (!controller.signal.aborted) setAreas(result);
            })
            .catch(err => {
                if (!controller.signal.aborted) setCatalogError(err.message);
            });
        return () => controller.abort();
    }, [formOpen, editingDevice?._id, token]);

    async function saveDevice(event) {
        event.preventDefault();
        if (saving) return;
        const values = new FormData(event.currentTarget);
        const details = Object.fromEntries(fields.map(([name]) => [name, values.get(name).trim()]));
        const areaId = values.get('area_id');
        setError('');
        if (Object.values(details).some(value => !value) || !areas?.some(area => area._id === areaId)) {
            setError('Enter the device details and select an area.');
            return;
        }
        setSaving(true);
        try {
            const endpoint = editingDevice ? `/${encodeURIComponent(editingDevice._id)}` : '';
            const response = await fetch(`${apiBase}/api/devices${endpoint}`, {
                method: editingDevice ? 'PATCH' : 'POST',
                headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...details, hospital_id: hospital._id, area_id: areaId }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.message || 'Could not save the device.');
            }
            const device = await response.json();
            onSaved(device, Boolean(editingDevice));
            setMessage(editingDevice ? `${details.name} updated.` : `${details.name} added to ${hospital.name}.`);
            setOpen(false);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <section id="device-editor" className="mx-auto max-w-7xl scroll-mt-4 px-4 pt-6 sm:px-6 lg:px-8">
            {!formOpen && (
                <button
                    type="button"
                    onClick={() => { setOpen(true); setMessage(''); setError(''); }}
                    className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800"
                >
                    Add Device
                </button>
            )}
            {!formOpen && message && <p role="status" className="mt-3 text-sm text-green-800">{message}</p>}
            {formOpen && (
                <form key={editingDevice?._id ?? 'new'} onSubmit={saveDevice} className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-semibold text-gray-900">{editingDevice ? 'Edit Device' : 'Add Device'}</h2>
                    <p className="mb-4 text-sm text-gray-700">{hospital.name}</p>
                    <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <label className="block text-sm font-semibold">
                            Area
                            {areas ? (
                                <select name="area_id" defaultValue={editingDevice?.area_id?._id ?? ''} required className="mt-1 block w-full rounded border border-gray-300 p-2">
                                    <option value="">Select an area</option>
                                    {areas.map(area => <option key={area._id} value={area._id}>{area.name}</option>)}
                                </select>
                            ) : <span className="mt-1 block text-gray-600">{catalogError || 'Loading areas…'}</span>}
                        </label>
                        {fields.map(([name, label]) => (
                            <label key={name} className="block text-sm font-semibold">
                                {label}
                                <input required name={name} type="text" defaultValue={editingDevice?.[name] ?? ''} className="mt-1 block w-full rounded border border-gray-300 p-2" />
                            </label>
                        ))}
                    </fieldset>
                    {areas?.length === 0 && (
                        <p className="mt-3 text-sm text-gray-700">No areas are available in the catalog.</p>
                    )}
                    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
                    <div className="mt-4 flex gap-3">
                        <button type="submit" disabled={saving || !areas?.length} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50">
                            {saving ? 'Saving…' : 'Save Device'}
                        </button>
                        <button type="button" disabled={saving} onClick={() => { setOpen(false); setError(''); onCancelEdit(); }} className="rounded-lg border border-gray-300 px-4 py-2">Cancel</button>
                    </div>
                </form>
            )}
        </section>
    );
}

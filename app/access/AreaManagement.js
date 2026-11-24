'use client';

import { useEffect, useState } from 'react';
import { authHeaders } from '@/lib/hospitalAccess';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_RAILWAY;
const blockerLabels = {
    activeDevices: 'Equipos activos',
    archivedDevices: 'Equipos archivados',
    userAccess: 'Usuarios con acceso',
    pendingRequests: 'Solicitudes pendientes',
    hospitals: 'Hospitales donde está habilitada',
};

export default function AreaManagement({ user, token, hospitalId, hospitals, onHospitalChange, onChanged }) {
    const isWebAdmin = user.role === 'web-admin';
    const [allAreas, setAllAreas] = useState(null);
    const [hospitalAreas, setHospitalAreas] = useState(null);
    const [editing, setEditing] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState('');
    const [revision, setRevision] = useState(0);
    const [hospitalAreaId, setHospitalAreaId] = useState('');
    const linked = hospitalAreas?.hospitalId === hospitalId ? hospitalAreas.areas : null;
    const enabledIds = new Set(linked?.map(area => area._id));
    const hospitalAreaEnabled = enabledIds.has(hospitalAreaId);

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            try {
                const options = { headers: authHeaders(token), signal: controller.signal };
                const responses = await Promise.all([
                    fetch(`${apiBase}/api/auth/areas`, options),
                    fetch(`${apiBase}/api/auth/hospitals/${encodeURIComponent(hospitalId)}/areas`, options),
                ]);
                if (responses.some(response => !response.ok)) throw new Error('No se pudieron cargar las áreas.');
                const [catalog, areas] = await Promise.all(responses.map(response => response.json()));
                if (controller.signal.aborted) return;
                setAllAreas(catalog);
                setHospitalAreas({ hospitalId, areas });
            } catch (err) {
                if (!controller.signal.aborted) setError({ message: err.message });
            }
        }
        load();
        return () => controller.abort();
    }, [hospitalId, revision, token]);

    function clearNotice() {
        setMessage('');
        setError(null);
    }

    async function apply(path, method, body, success, after) {
        clearNotice();
        setBusy(true);
        try {
            const response = await fetch(`${apiBase}/api/auth${path}`, {
                method,
                headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
                ...(body && { body: JSON.stringify(body) }),
            });
            const data = response.status === 204 ? null : await response.json().catch(() => null);
            if (!response.ok) {
                setError(data ?? { message: 'No se pudo aplicar el cambio.' });
                return;
            }
            after?.(data);
            setMessage(success);
            setRevision(value => value + 1);
            onChanged();
        } catch {
            setError({ message: 'No se pudo contactar al servidor.' });
        } finally {
            setBusy(false);
        }
    }

    async function reviewRemoval(area) {
        clearNotice();
        setBusy(true);
        const path = `/areas/${encodeURIComponent(area._id)}`;
        try {
            const response = await fetch(`${apiBase}/api/auth${path}/references`, { headers: authHeaders(token) });
            if (!response.ok) throw new Error('No se pudo comprobar el uso de esta área.');
            const blockers = await response.json();
            if (Object.values(blockers).some(Boolean)) {
                setError({ blockers });
                return;
            }
            if (!window.confirm(`¿Eliminar «${area.name}» del catálogo global de forma definitiva?`)) return;
            await apply(path, 'DELETE', null, 'Área eliminada.', () => {
                if (editing?._id === area._id) setEditing(null);
                if (hospitalAreaId === area._id) setHospitalAreaId('');
            });
        } catch (err) {
            setError({ message: err.message });
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="mt-5 space-y-5">
            {isWebAdmin && (
                <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-lg font-semibold text-gray-900">Catálogo global de áreas</h2>
                        <button type="button" disabled={busy} onClick={() => {
                            clearNotice();
                            setEditing({ name: '' });
                        }} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Agregar área</button>
                    </div>
                    {editing && (
                        <form onSubmit={event => {
                            event.preventDefault();
                            const path = editing._id ? `/areas/${encodeURIComponent(editing._id)}` : '/areas';
                            apply(path, editing._id ? 'PATCH' : 'POST', { name: editing.name }, 'Área guardada.', () => setEditing(null));
                        }} className="flex flex-wrap items-end gap-3 rounded-lg bg-blue-50 p-4">
                            <label className="flex-1 text-sm font-semibold">
                                Nombre del área
                                <input required value={editing.name} disabled={busy} onChange={event => setEditing({ ...editing, name: event.target.value })}
                                    className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2" />
                            </label>
                            <button type="submit" disabled={busy || !editing.name.trim()} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50">
                                Guardar
                            </button>
                            <button type="button" disabled={busy} onClick={() => setEditing(null)} className="rounded-lg border border-gray-300 px-4 py-2">Cancelar</button>
                        </form>
                    )}
                    {!allAreas && !error && <p className="text-sm text-gray-600">Cargando áreas…</p>}
                    {allAreas?.length === 0 && <p className="text-sm text-gray-600">El catálogo está vacío.</p>}
                    <ul className="divide-y divide-gray-200">
                        {allAreas?.map(area => (
                            <li key={area._id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                                <span className="font-medium">{area.name}</span>
                                <div className="flex gap-2">
                                    <button type="button" disabled={busy} onClick={() => {
                                        clearNotice();
                                        setEditing(area);
                                    }} className="rounded border border-gray-300 px-3 py-1.5 text-sm">Editar</button>
                                    <button type="button" disabled={busy} onClick={() => reviewRemoval(area)}
                                        className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-800">Eliminar…</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">Áreas por hospital</h2>
                {isWebAdmin ? (
                    <label className="block text-sm font-semibold">
                        Hospital
                        <select value={hospitalId} disabled={busy} onChange={event => {
                            clearNotice();
                            setHospitalAreaId('');
                            onHospitalChange(event.target.value);
                        }} className="mt-1 block w-full rounded-lg border border-gray-300 p-2">
                            {hospitals.map(hospital => <option key={hospital._id} value={hospital._id}>{hospital.name}</option>)}
                        </select>
                    </label>
                ) : <p>{user.hospital.name}</p>}
                <label className="block text-sm font-semibold">
                    Área
                    <select value={hospitalAreaId} disabled={!linked || busy} onChange={event => {
                        clearNotice();
                        setHospitalAreaId(event.target.value);
                    }} className="mt-1 block w-full rounded-lg border border-gray-300 p-2">
                        <option value="">Selecciona un área</option>
                        {allAreas?.map(area => (
                            <option key={area._id} value={area._id}>{area.name}{enabledIds.has(area._id) ? ' · Habilitada' : ''}</option>
                        ))}
                    </select>
                </label>
                <button type="button" disabled={!hospitalAreaId || !linked || busy} onClick={() => {
                    const enabled = !hospitalAreaEnabled;
                    apply(`/hospitals/${encodeURIComponent(hospitalId)}/areas/${encodeURIComponent(hospitalAreaId)}`,
                        'PATCH', { enabled }, enabled ? 'Área habilitada para este hospital.' : 'Área deshabilitada para este hospital.',
                        areas => setHospitalAreas({ hospitalId, areas }));
                }} className="rounded-lg border border-blue-300 px-4 py-2 font-semibold text-blue-800 disabled:opacity-50">
                    {hospitalAreaEnabled ? 'Deshabilitar en el hospital' : 'Habilitar en el hospital'}
                </button>
            </div>
            {error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    <p>{error.blockers ? 'Aún hay referencias a esta área.' : error.message}</p>
                    {error.blockers && (
                        <ul className="mt-2 list-inside list-disc">
                            {Object.entries(error.blockers).filter(([, count]) => count > 0).map(([key, count]) => (
                                <li key={key}>{blockerLabels[key]} · {count}</li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
            {message && <p role="status" className="rounded-lg bg-green-50 p-4 text-sm text-green-800">{message}</p>}
        </section>
    );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { authHeaders, canManageAccess } from '@/lib/hospitalAccess';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_RAILWAY;

export default function AccessPage() {
    const { user, token, hydrated } = useAuth();
    const router = useRouter();
    const [hospitals, setHospitals] = useState([]);
    const [selectedHospital, setSelectedHospital] = useState('');
    const [catalog, setCatalog] = useState(null);
    const [selectedUser, setSelectedUser] = useState('');
    const [areaIds, setAreaIds] = useState([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);
    const canManage = canManageAccess(user);
    const isWebAdmin = user?.role === 'web-admin';
    const hospitalId = isWebAdmin && selectedHospital ? selectedHospital : user?.hospital?._id;

    useEffect(() => {
        if (hydrated && !token) router.replace('/login');
        else if (hydrated && user && !canManage) router.replace('/profile');
    }, [hydrated, token, user, canManage, router]);

    useEffect(() => {
        if (!isWebAdmin) return;
        const controller = new AbortController();
        fetch(`${apiBase}/api/auth/hospitals`, { signal: controller.signal })
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(result => {
                if (!controller.signal.aborted) setHospitals(result);
            })
            .catch(() => {
                if (!controller.signal.aborted) setError('Could not load hospitals.');
            });
        return () => controller.abort();
    }, [isWebAdmin]);

    useEffect(() => {
        if (!canManage || !hospitalId || !token) return;
        const controller = new AbortController();
        fetch(`${apiBase}/api/auth/users?hospitalId=${encodeURIComponent(hospitalId)}`, {
            headers: authHeaders(token),
            signal: controller.signal,
        })
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(result => {
                if (!controller.signal.aborted) setCatalog({ ...result, hospitalId });
            })
            .catch(() => {
                if (!controller.signal.aborted) setError('Could not load users and areas.');
            });
        return () => controller.abort();
    }, [canManage, hospitalId, token]);

    if (!hydrated || !token || !canManage) return null;

    const currentCatalog = catalog?.hospitalId === hospitalId ? catalog : null;
    const target = currentCatalog?.users.find(account => account._id === selectedUser);
    const requestedArea = currentCatalog?.areas.find(area => area._id === target?.requestedAreaId);

    const saveAccess = async event => {
        event.preventDefault();
        if (!target || saving) return;
        setSaving(true);
        setError('');
        setSaved(false);
        try {
            const res = await fetch(`${apiBase}/api/auth/users/${encodeURIComponent(target._id)}/areas`, {
                method: 'PATCH',
                headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
                body: JSON.stringify({ areaIds }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || 'Could not update access.');
            setCatalog(previous => ({
                ...previous,
                users: previous.users.map(account =>
                    account._id === target._id ? { ...account, areaIds: result.areaIds, requestedAreaId: null } : account
                ),
            }));
            setAreaIds(result.areaIds);
            setSaved(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
                <h1 className="mb-2 text-2xl font-bold text-gray-900">Manage Access</h1>
                {!isWebAdmin && <p className="mb-5 text-gray-700">{user.hospital.name}</p>}
                <form onSubmit={saveAccess} className="mt-5 space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                    {isWebAdmin && (
                        <label className="block space-y-1 text-sm font-semibold">
                            <span>Hospital</span>
                            <select
                                className="block w-full rounded-lg border border-gray-300 p-2.5"
                                value={hospitalId}
                                disabled={saving}
                                onChange={event => {
                                    setSelectedHospital(event.target.value);
                                    setSelectedUser('');
                                    setAreaIds([]);
                                    setError('');
                                    setSaved(false);
                                }}
                            >
                                {(hospitals.length ? hospitals : [user.hospital]).map(hospital => (
                                    <option key={hospital._id} value={hospital._id}>{hospital.name}</option>
                                ))}
                            </select>
                        </label>
                    )}
                    <label className="block space-y-1 text-sm font-semibold">
                        <span>User</span>
                        <select
                            className="block w-full rounded-lg border border-gray-300 p-2.5"
                            value={target?._id ?? ''}
                            disabled={!currentCatalog?.users.length || saving}
                            onChange={event => {
                                const account = currentCatalog.users.find(item => item._id === event.target.value);
                                setSelectedUser(account?._id ?? '');
                                setAreaIds(account?.areaIds ?? []);
                                setError('');
                                setSaved(false);
                            }}
                        >
                            <option value="">{currentCatalog ? 'Select a user' : 'Loading users…'}</option>
                            {currentCatalog?.users.map(account => (
                                <option key={account._id} value={account._id}>{account.username}</option>
                            ))}
                        </select>
                    </label>
                    {currentCatalog?.users.length === 0 && <p className="text-sm text-gray-600">No users in this hospital.</p>}
                    {target && (
                        <fieldset disabled={saving} className="space-y-3">
                            <legend className="font-semibold text-gray-900">Authorized Areas</legend>
                            {requestedArea && <p className="text-sm text-gray-600">Requested area · {requestedArea.name}</p>}
                            {currentCatalog.areas.map(area => (
                                <label key={area._id} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
                                    <input
                                        type="checkbox"
                                        checked={areaIds.includes(area._id)}
                                        onChange={event => {
                                            const checked = event.target.checked;
                                            setAreaIds(previous => checked ? [...previous, area._id] : previous.filter(id => id !== area._id));
                                            setSaved(false);
                                        }}
                                    />
                                    {area.name}
                                </label>
                            ))}
                            <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50">
                                {saving ? 'Saving…' : 'Save Access'}
                            </button>
                        </fieldset>
                    )}
                    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
                    {saved && <p role="status" className="text-sm text-green-700">Access updated.</p>}
                </form>
            </div>
        </main>
    );
}

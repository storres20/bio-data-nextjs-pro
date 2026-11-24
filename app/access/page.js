'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { authHeaders, canManageAccess } from '@/lib/hospitalAccess';
import AreaManagement from './AreaManagement';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_RAILWAY;
const roles = { user: 'User', 'hospital-admin': 'Hospital administrator', 'web-admin': 'Web administrator' };

async function request(path, options = {}) {
    const response = await fetch(apiBase + '/api/auth' + path, options);
    if (response.status === 204) return null;
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message || 'Could not complete this operation.');
    return body;
}

export default function AccessPage() {
    const { user, token, hydrated } = useAuth();
    const router = useRouter();
    const canManage = canManageAccess(user);
    const isWebAdmin = user?.role === 'web-admin';
    const [hospitals, setHospitals] = useState([]);
    const [hospitalSelection, setHospitalSelection] = useState('');
    const [catalog, setCatalog] = useState(null);
    const [form, setForm] = useState(null);
    const [transferAreas, setTransferAreas] = useState(null);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [link, setLink] = useState('');
    const [busy, setBusy] = useState(false);
    const [refresh, setRefresh] = useState(0);
    const [tab, setTab] = useState('users');
    const hospitalId = isWebAdmin && hospitalSelection ? hospitalSelection : user?.hospital?._id;
    const currentCatalog = catalog?.hospitalId === hospitalId ? catalog : null;
    const target = currentCatalog?.users.find(account => account._id === form?._id);
    const accountHospital = form?.hospitalId;
    const areas = accountHospital === hospitalId ? currentCatalog?.areas
        : transferAreas?.hospitalId === accountHospital ? transferAreas?.areas : null;

    useEffect(() => {
        if (hydrated && !token) router.replace('/login');
        else if (hydrated && user && !canManage) router.replace('/profile');
    }, [hydrated, token, user, canManage, router]);

    useEffect(() => {
        if (!isWebAdmin) return;
        const controller = new AbortController();
        request('/hospitals', { signal: controller.signal })
            .then(result => { if (!controller.signal.aborted) setHospitals(result); })
            .catch(err => { if (!controller.signal.aborted) setError(err.message); });
        return () => controller.abort();
    }, [isWebAdmin]);

    useEffect(() => {
        if (!canManage || !hospitalId || !token) return;
        const controller = new AbortController();
        request('/users?hospitalId=' + encodeURIComponent(hospitalId), {
            headers: authHeaders(token), signal: controller.signal,
        })
            .then(result => { if (!controller.signal.aborted) setCatalog({ ...result, hospitalId }); })
            .catch(err => { if (!controller.signal.aborted) setError(err.message); });
        return () => controller.abort();
    }, [canManage, hospitalId, token, refresh]);

    useEffect(() => {
        if (!isWebAdmin || !accountHospital || accountHospital === hospitalId) return;
        const controller = new AbortController();
        request('/hospitals/' + encodeURIComponent(accountHospital) + '/areas', { signal: controller.signal })
            .then(result => {
                if (!controller.signal.aborted) setTransferAreas({ hospitalId: accountHospital, areas: result });
            })
            .catch(err => { if (!controller.signal.aborted) setError(err.message); });
        return () => controller.abort();
    }, [isWebAdmin, accountHospital, hospitalId]);

    function clearFeedback() {
        setError('');
        setMessage('');
        setLink('');
    }

    function resetLink(secret) {
        const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || window.location.origin;
        const url = new URL('/reset-password', origin);
        url.hash = 'token=' + encodeURIComponent(secret);
        setLink(url.toString());
    }

    async function mutate(action) {
        if (busy) return;
        setBusy(true);
        clearFeedback();
        try {
            const endpoint = form?._id ? '/users/' + encodeURIComponent(form._id) : '/users';
            const config = { headers: { ...authHeaders(token), 'Content-Type': 'application/json' } };
            if (action === 'save') {
                const result = await request(endpoint, {
                    ...config, method: form._id ? 'PATCH' : 'POST', body: JSON.stringify(form),
                });
                setForm(result.user.hospitalId === hospitalId ? result.user : null);
                if (result.resetToken) resetLink(result.resetToken);
                setMessage(form._id ? 'Account updated.' : 'Account created. Share the setup link privately.');
            } else if (action === 'reset') {
                const result = await request(endpoint + '/reset-password', { ...config, method: 'POST' });
                resetLink(result.resetToken);
                setMessage('Share this one-time link privately.');
            } else if (action === 'reject-area') {
                const result = await request(endpoint + '/area-request', { ...config, method: 'DELETE' });
                setForm(result.user);
                setMessage('Area request rejected.');
            } else if (action === 'delete') {
                await request(endpoint, { ...config, method: 'DELETE' });
                setForm(null);
                setMessage('Account deleted permanently.');
            } else {
                const { user: updated } = await request(endpoint + '/status', {
                    ...config, method: 'PATCH', body: JSON.stringify({ disabled: !target.disabled }),
                });
                setForm(updated);
                setMessage(updated.disabled ? 'Account deactivated.' : 'Account reactivated.');
            }
            setRefresh(previous => previous + 1);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    if (!hydrated || !token || !canManage) return null;
    const ownAccount = Boolean(target && target.username === user.username);
    const selectedHospitals = hospitals.length ? hospitals : [user.hospital];
    const requestedArea = accountHospital === hospitalId
        ? currentCatalog?.areas.find(area => area._id === target?.requestedAreaId)
        : null;

    return (
        <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
                <h1 className="mb-2 text-2xl font-bold text-gray-900">Manage Access</h1>
                <nav aria-label="Manage Access" className="flex gap-3 border-b border-gray-200">
                    <button type="button" aria-pressed={tab === 'users'} disabled={busy} onClick={() => setTab('users')}
                        className={`px-3 py-2 text-sm font-semibold ${tab === 'users' ? 'border-b-2 border-blue-700 text-blue-800' : 'text-gray-600'}`}>Users and permissions</button>
                    <button type="button" aria-pressed={tab === 'areas'} disabled={busy} onClick={() => { clearFeedback(); setTab('areas'); }}
                        className={`px-3 py-2 text-sm font-semibold ${tab === 'areas' ? 'border-b-2 border-blue-700 text-blue-800' : 'text-gray-600'}`}>Áreas</button>
                </nav>
                {tab === 'areas' && (
                    <AreaManagement user={user} token={token} hospitalId={hospitalId} hospitals={selectedHospitals}
                        onHospitalChange={id => { setHospitalSelection(id); setForm(null); }}
                        onChanged={() => setRefresh(value => value + 1)} />
                )}
                {tab === 'users' && (
                <section className="mt-5 space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                    {isWebAdmin ? (
                        <label className="block space-y-1 text-sm font-semibold">
                            <span>Hospital</span>
                            <select className="block w-full rounded-lg border border-gray-300 p-2.5" disabled={busy} value={hospitalId} onChange={event => {
                                setHospitalSelection(event.target.value);
                                setForm(null);
                                clearFeedback();
                            }}>
                                {selectedHospitals.map(hospital => <option key={hospital._id} value={hospital._id}>{hospital.name}</option>)}
                            </select>
                        </label>
                    ) : <p className="text-gray-700">{user.hospital.name}</p>}
                    <div className="flex flex-wrap items-end gap-3">
                        <label className="min-w-52 flex-1 space-y-1 text-sm font-semibold">
                            <span>User</span>
                            <select className="block w-full rounded-lg border border-gray-300 p-2.5"
                                value={form?._id ?? ''} disabled={busy || !currentCatalog?.users.length} onChange={event => {
                                    setForm(currentCatalog.users.find(account => account._id === event.target.value) ?? null);
                                    clearFeedback();
                                }}>
                                <option value="">{currentCatalog ? 'Select a user' : 'Loading users…'}</option>
                                {currentCatalog?.users.map(account => (
                                    <option key={account._id} value={account._id}>
                                        {account.username}{account.disabled ? ' · Inactive' : ''}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <button type="button" disabled={busy || !currentCatalog} onClick={() => {
                            setForm({ username: '', role: 'user', hospitalId, areaIds: [] });
                            clearFeedback();
                        }} className="rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50">Create user</button>
                    </div>
                    {form && (
                        <form onSubmit={event => { event.preventDefault(); mutate('save'); }} className="space-y-4 border-t border-gray-200 pt-5">
                            <fieldset disabled={busy} className="space-y-4">
                                <legend className="font-semibold text-gray-900">{form._id ? 'Edit account' : 'New account'}</legend>
                                <label className="block space-y-1 text-sm font-semibold">
                                    <span>Username</span>
                                    <input required value={form.username} onChange={event => setForm({ ...form, username: event.target.value })}
                                        className="block w-full rounded-lg border border-gray-300 p-2.5" />
                                </label>
                                {isWebAdmin && (
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <label className="block space-y-1 text-sm font-semibold">
                                            <span>Account hospital</span>
                                            <select value={form.hospitalId} className="block w-full rounded-lg border border-gray-300 p-2.5"
                                                onChange={event => setForm({ ...form, hospitalId: event.target.value, areaIds: [] })}>
                                                {selectedHospitals.map(hospital => <option key={hospital._id} value={hospital._id}>{hospital.name}</option>)}
                                            </select>
                                        </label>
                                        <label className="block space-y-1 text-sm font-semibold">
                                            <span>Role</span>
                                            <select value={form.role ?? 'user'} disabled={ownAccount} className="block w-full rounded-lg border border-gray-300 p-2.5"
                                                onChange={event => setForm({ ...form, role: event.target.value })}>
                                                {Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                            </select>
                                        </label>
                                    </div>
                                )}
                                <fieldset className="space-y-2">
                                    <legend className="font-semibold text-gray-900">Authorized areas</legend>
                                    {requestedArea && (
                                        <div className="flex flex-wrap items-center gap-2 text-sm text-amber-800">
                                            <span>Requested area · {requestedArea.name}</span>
                                            <button type="button" disabled={busy} onClick={() => {
                                                if (window.confirm('Reject this area request?')) mutate('reject-area');
                                            }} className="rounded border border-amber-300 px-2 py-1">Reject request</button>
                                        </div>
                                    )}
                                    {!areas && <p className="text-sm text-gray-600">Loading areas…</p>}
                                    {areas?.length === 0 && <p className="text-sm text-gray-600">No areas in this hospital.</p>}
                                    {areas?.map(area => (
                                        <label key={area._id} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
                                            <input type="checkbox" checked={form.areaIds.includes(area._id)} onChange={event => {
                                                const checked = event.target.checked;
                                                setForm(previous => ({
                                                    ...previous,
                                                    areaIds: checked ? [...previous.areaIds, area._id] : previous.areaIds.filter(id => id !== area._id),
                                                }));
                                            }} />
                                            {area.name}
                                        </label>
                                    ))}
                                </fieldset>
                                <button type="submit" disabled={!areas} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50">
                                    {busy ? 'Saving…' : form._id ? 'Save changes' : 'Create and generate link'}
                                </button>
                            </fieldset>
                        </form>
                    )}
                    {target && (
                        <div className="flex flex-wrap gap-3 border-t border-gray-200 pt-4">
                            {!target.disabled && <button disabled={busy} onClick={() => mutate('reset')} className="rounded-lg border px-3 py-2 text-sm">Reset password</button>}
                            {!ownAccount && <button disabled={busy} onClick={() => {
                                if (target.disabled || window.confirm('Deactivate ' + target.username + ' and revoke its sessions?')) mutate('status');
                            }} className="rounded-lg border px-3 py-2 text-sm">{target.disabled ? 'Reactivate' : 'Deactivate'}</button>}
                            {!ownAccount && target.canDelete && <button disabled={busy} onClick={() => {
                                if (window.confirm('Permanently delete ' + target.username + '? This cannot be undone.')) mutate('delete');
                            }} className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-800">Delete permanently</button>}
                        </div>
                    )}
                    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
                    {message && <p role="status" className="text-sm text-green-700">{message}</p>}
                    {link && <label className="block space-y-1 text-sm font-semibold">
                        <span>One-time link · expires in one hour</span>
                        <input readOnly value={link} onFocus={event => event.target.select()} className="block w-full rounded-lg border border-gray-300 p-2.5 font-mono" />
                    </label>}
                </section>
                )}
            </div>
        </main>
    );
}

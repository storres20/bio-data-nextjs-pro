'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function ResetPasswordPage() {
    const [token, setToken] = useState(null);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [done, setDone] = useState(false);

    useEffect(() => {
        const linkToken = new URLSearchParams(window.location.hash.slice(1)).get('token');
        setToken(linkToken ?? '');
    }, []);

    async function submit(event) {
        event.preventDefault();
        if (saving || !token) return;
        const data = new FormData(event.currentTarget);
        const password = data.get('password');
        if (password !== data.get('confirmation')) {
            setError('The passwords must match.');
            return;
        }
        setError('');
        setSaving(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_RAILWAY}/api/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.message || 'Could not set the password.');
            }
            window.history.replaceState(window.history.state, '', window.location.pathname);
            setToken('');
            setDone(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <main className="mx-auto max-w-md px-4 py-8">
            <h1 className="mb-4 text-2xl font-bold text-gray-900">Set your password</h1>
            {done ? (
                <p role="status">Password saved. <Link href="/login" className="font-semibold text-blue-700">Sign in</Link></p>
            ) : token ? (
                <form onSubmit={submit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                    <p className="text-sm text-gray-700">Use at least 12 characters.</p>
                    <fieldset disabled={saving} className="space-y-4">
                        <label className="block text-sm font-semibold">
                            New password
                            <input name="password" type="password" autoComplete="new-password" required minLength={12}
                                className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
                        </label>
                        <label className="block text-sm font-semibold">
                            Confirm password
                            <input name="confirmation" type="password" autoComplete="new-password" required minLength={12}
                                className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
                        </label>
                        <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50">
                            {saving ? 'Saving…' : 'Save password'}
                        </button>
                    </fieldset>
                    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
                </form>
            ) : token === '' ? <p role="alert">Open the link provided by your administrator.</p> : null}
        </main>
    );
}

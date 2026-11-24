'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const resetEndpoint = `${process.env.NEXT_PUBLIC_API_BASE_RAILWAY}/api/auth/reset-password`;
const minPasswordLength = 6;

export default function ResetPasswordPage() {
    const [token, setToken] = useState(null);
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [done, setDone] = useState(false);

    useEffect(() => {
        const linkToken = new URLSearchParams(window.location.hash.slice(1)).get('token');
        if (!linkToken) {
            setToken('');
            return;
        }
        const controller = new AbortController();
        async function validateLink() {
            try {
                const response = await fetch(`${resetEndpoint}/validate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: linkToken }),
                    signal: controller.signal,
                });
                const result = await response.json().catch(() => null);
                if (!response.ok) throw new Error(result?.message || 'Could not validate the link.');
                if (controller.signal.aborted) return;
                setUsername(result.username);
                setToken(linkToken);
            } catch (err) {
                if (controller.signal.aborted) return;
                setError(err.message);
                setToken('');
            }
        }
        validateLink();
        return () => controller.abort();
    }, []);

    async function submit(event) {
        event.preventDefault();
        if (saving || !token) return;
        const data = new FormData(event.currentTarget);
        const password = data.get('password');
        if ([...password].length < minPasswordLength) {
            setError(`Use at least ${minPasswordLength} characters.`);
            return;
        }
        if (password !== data.get('confirmation')) {
            setError('The passwords must match.');
            return;
        }
        setError('');
        setSaving(true);
        try {
            const res = await fetch(resetEndpoint, {
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
                    <p className="text-sm text-gray-700">Username <strong className="ml-1 text-gray-900">{username}</strong></p>
                    <p className="text-sm text-gray-700">Use at least {minPasswordLength} characters.</p>
                    <fieldset disabled={saving} className="space-y-4">
                        <label className="block text-sm font-semibold">
                            New password
                            <input name="password" type="password" autoComplete="new-password" required minLength={minPasswordLength}
                                className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
                        </label>
                        <label className="block text-sm font-semibold">
                            Confirm password
                            <input name="confirmation" type="password" autoComplete="new-password" required minLength={minPasswordLength}
                                className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5" />
                        </label>
                        <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50">
                            {saving ? 'Saving…' : 'Save password'}
                        </button>
                    </fieldset>
                    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
                </form>
            ) : token === '' ? (
                <p role="alert">{error || 'Open the link provided by your administrator.'}</p>
            ) : <p role="status">Checking the link…</p>}
        </main>
    );
}

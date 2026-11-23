'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import HospitalInfoBanner from '@/components/HospitalInfoBanner';
import { getAllowedAreas } from '@/lib/hospitalAccess';

export default function ProfilePage() {
    const { user, token, hydrated } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (hydrated && !token) router.replace('/login');
    }, [hydrated, token, router]);

    if (!hydrated || !token || !user) return null;

    const allowedAreas = getAllowedAreas(user);
    const allowedIds = new Set(allowedAreas.map(area => area._id));
    const areas = user.hospitalAreas ?? allowedAreas;

    return (
        <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
            <HospitalInfoBanner user={user} />
            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
                <h1 className="mb-6 text-2xl font-bold text-gray-900">My Profile</h1>
                <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                    <dl className="grid gap-4 sm:grid-cols-2">
                        <div><dt className="text-sm text-gray-600">Username</dt><dd className="font-semibold">{user.username}</dd></div>
                        <div><dt className="text-sm text-gray-600">Hospital</dt><dd className="font-semibold">{user.hospital.name}</dd></div>
                    </dl>
                </section>
                <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h2 className="text-lg font-bold text-gray-900">Hospital Areas</h2>
                    {user.requestedArea && (
                        <p className="mt-2 text-sm text-amber-800">Pending approval · {user.requestedArea.name}</p>
                    )}
                    <ul className="mt-2 divide-y divide-gray-200">
                        {areas.map(area => {
                            const allowed = allowedIds.has(area._id);
                            return (
                                <li key={area._id} className="flex items-center justify-between gap-4 py-3">
                                    <span>{area.name}</span>
                                    <span className={`rounded-full px-3 py-1 text-sm ${allowed ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                                        {allowed ? 'Access granted' : 'No access'}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                    {areas.length === 0 && <p className="mt-3 text-sm text-gray-600">No hospital areas available.</p>}
                    {user.hospitalAreas === undefined && <p className="mt-3 text-sm text-gray-600">The hospital area list is unavailable.</p>}
                </section>
            </div>
        </main>
    );
}

'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getAllowedAreas } from '@/lib/hospitalAccess';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_RAILWAY;

export default function HospitalWorkspace({ children }) {
    const { user } = useAuth();
    const isWebAdmin = user?.role === 'web-admin';
    const key = `monitoring-hospital:${user?.username}`;
    const [selection, setSelection] = useState(null);
    const [hospitals, setHospitals] = useState([]);
    const [catalog, setCatalog] = useState(null);
    const [hospitalError, setHospitalError] = useState(false);
    const ownHospital = user?.hospital;
    const selectedId = selection?.key === key ? selection.id : ownHospital?._id;
    const hospital = isWebAdmin ? hospitals.find(item => item._id === selectedId) ?? ownHospital : ownHospital;
    const hospitalId = hospital?._id;

    useEffect(() => {
        if (!isWebAdmin) return;
        setSelection({ key, id: sessionStorage.getItem(key) });
        const controller = new AbortController();
        fetch(`${apiBase}/api/auth/hospitals`, { signal: controller.signal })
            .then(response => {
                if (!response.ok) throw new Error('Could not load hospitals');
                return response.json();
            })
            .then(result => {
                if (!controller.signal.aborted) setHospitals(result);
            })
            .catch(() => {
                if (!controller.signal.aborted) setHospitalError(true);
            });
        return () => controller.abort();
    }, [isWebAdmin, key]);

    useEffect(() => {
        if (!isWebAdmin || !hospitalId) return;
        const controller = new AbortController();
        fetch(`${apiBase}/api/auth/hospitals/${encodeURIComponent(hospitalId)}/areas`, { signal: controller.signal })
            .then(response => {
                if (!response.ok) throw new Error('Could not load areas');
                return response.json();
            })
            .then(areas => {
                if (!controller.signal.aborted) setCatalog({ hospitalId, areas });
            })
            .catch(() => {
                if (!controller.signal.aborted) setCatalog({ hospitalId, areas: [], error: true });
            });
        return () => controller.abort();
    }, [isWebAdmin, hospitalId]);

    const currentCatalog = catalog?.hospitalId === hospitalId ? catalog : null;
    const areas = !isWebAdmin ? getAllowedAreas(user) : currentCatalog?.areas
        ?? (hospitalId === ownHospital?._id ? user.hospitalAreas ?? [] : []);

    return (
        <>
            {isWebAdmin && (
                <div className="border-b border-blue-200 bg-blue-50">
                    <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
                        <label className="flex flex-wrap items-center gap-3 text-sm font-semibold text-blue-900">
                            Viewing hospital
                            <select
                                value={hospitalId ?? ''}
                                className="max-w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-gray-900"
                                onChange={event => {
                                    const id = event.target.value;
                                    sessionStorage.setItem(key, id);
                                    setSelection({ key, id });
                                }}
                            >
                                {(hospitals.length ? hospitals : [ownHospital].filter(Boolean)).map(item => (
                                    <option key={item._id} value={item._id}>{item.name}</option>
                                ))}
                            </select>
                        </label>
                        {(hospitalError || currentCatalog?.error) && (
                            <p role="alert" className="mt-2 text-sm text-red-700">
                                {hospitalError ? 'Could not load hospitals.' : 'Could not load this hospital’s areas.'}
                            </p>
                        )}
                    </div>
                </div>
            )}
            {children({ hospital, areas, areasLoading: isWebAdmin && !currentCatalog })}
        </>
    );
}

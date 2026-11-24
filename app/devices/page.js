'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import HospitalInfoBanner from '@/components/HospitalInfoBanner';
import HospitalWorkspace from '@/components/HospitalWorkspace';
import CreateDeviceForm from './CreateDeviceForm';
import WebSocket from 'isomorphic-ws';
import { authHeaders, canViewDevice, groupDevicesByArea, liveSocketUrl } from '@/lib/hospitalAccess';

export default function DevicesPage() {
    return (
        <HospitalWorkspace>
            {scope => <Devices key={scope.hospital?._id} {...scope} />}
        </HospitalWorkspace>
    );
}

function Devices({ hospital, areas }) {
    const { user, token, hydrated } = useAuth();
    const hospitalId = hospital?._id;
    const [devices, setDevices] = useState([]);
    const [connectedSensors, setConnectedSensors] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [archiveFilter, setArchiveFilter] = useState('active');
    const [editingDevice, setEditingDevice] = useState(null);
    const [deviceAction, setDeviceAction] = useState(null);
    const [actionMessage, setActionMessage] = useState('');
    const [actionError, setActionError] = useState('');
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    const apiBase = process.env.NEXT_PUBLIC_API_BASE_RAILWAY;

    // 🔒 Redirigir si no está autenticado
    useEffect(() => {
        if (hydrated && !token) {
            window.location.href = '/login';
        }
    }, [hydrated, token]);

    // 📥 Obtener dispositivos por hospital
    useEffect(() => {
        if (!hydrated || !user || !token || !hospitalId) return;
        const controller = new AbortController();
        fetch(`${apiBase}/api/devices/hospital/${encodeURIComponent(hospitalId)}?includeArchived=true`, {
            headers: authHeaders(token),
            signal: controller.signal,
        })
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                if (!controller.signal.aborted) setDevices(data);
            })
            .catch(err => {
                if (!controller.signal.aborted) {
                    setDevices([]);
                    console.error('Error loading devices:', err);
                }
            });
        return () => controller.abort();
    }, [hydrated, user, token, apiBase, hospitalId]);

    // 📡 Obtener sensores conectados en tiempo real desde WebSocket
    useEffect(() => {
        if (!token || !user?.allowedAreas || !apiBase || !hospitalId) return;
        const ws = new WebSocket(liveSocketUrl(apiBase));
        const connected = new Map();
        const canAssign = user.role === 'web-admin';
        ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', token, hospitalId, sensors: canAssign }));

        const updateOnlineSensors = () => {
            const cutoff = Date.now() - 5000;
            for (const [username, lastSeen] of connected) {
                if (lastSeen < cutoff) connected.delete(username);
            }
            setConnectedSensors([...connected.keys()]);
        };
        const interval = setInterval(updateOnlineSensors, 5000);
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (typeof data.username !== 'string') return;
                if (!(canViewDevice(user, data.device, hospitalId) || (canAssign && data.type === 'available-sensor'))) return;
                const username = data.username;
                connected.set(username, Date.now());
                updateOnlineSensors();
            } catch (err) {
                console.error('Error parsing WebSocket data:', err);
            }
        };

        return () => {
            clearInterval(interval);
            ws.onmessage = null;
            ws.close();
        };
    }, [token, user, apiBase, hospitalId]);

    // 🔄 Asignar sensor a un dispositivo
    const assignSensorToDevice = async (deviceId, username, deviceName) => {
        try {
            const res = await fetch(`${apiBase}/api/devices/${deviceId}/assign-sensor`, {
                method: 'PATCH',
                headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const updatedDevice = await res.json();

            setDevices((prev) =>
                prev.map((dev) => (dev._id === deviceId ? updatedDevice : dev))
            );

            // Mostrar mensaje de éxito
            setSuccessMessage(username
                ? `Sensor "${username}" assigned to "${deviceName}" successfully!`
                : `Sensor unassigned from "${deviceName}" successfully!`
            );
            setShowSuccessModal(true);
            setTimeout(() => setShowSuccessModal(false), 3000);
        } catch (error) {
            console.error('Error assigning sensor:', error);
        }
    };

    const updateDeviceStatus = async (device, action) => {
        if (deviceAction) return;
        const isDelete = action === 'delete';
        const archive = action === 'archive';
        if (isDelete && !window.confirm('Permanently delete ?' + device.name + '?? This cannot be undone.')) return;
        if (archive && !window.confirm('Archive ?' + device.name + '? and release its sensor? History will be preserved.')) return;
        setDeviceAction(device._id);
        setActionMessage('');
        setActionError('');
        try {
            const suffix = isDelete ? '' : '/archive';
            const response = await fetch(`${apiBase}/api/devices/${encodeURIComponent(device._id)}${suffix}`, {
                method: isDelete ? 'DELETE' : 'PATCH',
                headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
                ...(isDelete ? {} : { body: JSON.stringify({ archived: archive }) }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.message || 'Could not update the device.');
            }
            const updated = isDelete ? null : await response.json();
            setDevices(previous => updated ? previous.map(item => item._id === device._id ? updated : item)
                : previous.filter(item => item._id !== device._id));
            setEditingDevice(current => current?._id === device._id ? null : current);
            setActionMessage(device.name + (isDelete ? ' deleted permanently.' : archive ? ' archived.' : ' restored.'));
        } catch (err) {
            setActionError(err.message);
        } finally {
            setDeviceAction(null);
        }
    };

    if (!hydrated || !user) return null;

    const normalizedSearch = searchQuery.toLowerCase();
    const visibleDevices = devices.filter(device => canViewDevice(user, device, hospitalId));
    const activeDevices = visibleDevices.filter(device => !device.archived_at);
    const filteredDevices = visibleDevices.filter(device => {
        if (archiveFilter === 'active' && device.archived_at) return false;
        if (archiveFilter === 'archived' && !device.archived_at) return false;
        const matchesSearch =
            device.name.toLowerCase().includes(normalizedSearch) ||
            device.brand.toLowerCase().includes(normalizedSearch) ||
            device.model.toLowerCase().includes(normalizedSearch) ||
            device.serie.toLowerCase().includes(normalizedSearch);

        const matchesFilter =
            Boolean(device.archived_at) || filterStatus === 'all' ||
            (filterStatus === 'assigned' && device.assigned_sensor_username) ||
            (filterStatus === 'unassigned' && !device.assigned_sensor_username);

        return matchesSearch && matchesFilter;
    });

    const deviceGroups = groupDevicesByArea(filteredDevices, device => device.area_id);
    const assignedDevices = activeDevices.filter(device => device.assigned_sensor_username);
    const assignedCount = assignedDevices.length;
    const unassignedCount = activeDevices.length - assignedCount;
    const assignedSensors = new Set(assignedDevices.map(device => device.assigned_sensor_username));
    const availableSensors = connectedSensors.filter(sensor => !assignedSensors.has(sensor));
    const canAssign = user.role === 'web-admin';

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                                </svg>
                                Device Management
                            </h1>
                            <p className="text-sm text-gray-600 mt-1">Configure and assign sensors to medical equipment</p>
                        </div>
                    </div>
                </div>
            </div>

            <HospitalInfoBanner user={{ ...user, hospital, allowedAreas: areas }} />

            {/* Success Modal */}
            {showSuccessModal && (
                <div className="fixed top-4 right-4 z-50">
                    <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-lg shadow-lg flex items-start gap-3 max-w-md">
                        <svg className="w-6 h-6 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                            <h3 className="text-green-900 font-bold">Success!</h3>
                            <p className="text-green-800 text-sm mt-1">{successMessage}</p>
                        </div>
                    </div>
                </div>
            )}

            {canAssign && (
                <CreateDeviceForm
                    hospital={hospital}
                    editingDevice={editingDevice}
                    token={token}
                    onCancelEdit={() => setEditingDevice(null)}
                    onSaved={(device, wasEditing) => {
                        setDevices(previous => [...previous.filter(item => item._id !== device._id), device]);
                        setEditingDevice(null);
                        if (!wasEditing) {
                            setArchiveFilter('active');
                            setSearchQuery('');
                            setFilterStatus('all');
                        }
                    }}
                />
            )}

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Active Devices</p>
                                <p className="text-3xl font-bold text-gray-900 mt-1">{activeDevices.length}</p>
                            </div>
                            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Assigned</p>
                                <p className="text-3xl font-bold text-green-600 mt-1">{assignedCount}</p>
                            </div>
                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Unassigned</p>
                                <p className="text-3xl font-bold text-amber-600 mt-1">{unassignedCount}</p>
                            </div>
                            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Active Sensors</p>
                                <p className="text-3xl font-bold text-cyan-600 mt-1">{connectedSensors.length}</p>
                            </div>
                            <div className="w-12 h-12 bg-cyan-100 rounded-full flex items-center justify-center relative">
                                <svg className="w-6 h-6 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                                </svg>
                                {connectedSensors.length > 0 && (
                                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filters and Search */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        {/* Search */}
                        <div className="flex-1">
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search by name, brand, model, or serie..."
                                    className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Status Filter */}
                        <div className="flex gap-2">
                            <button
                                onClick={() => setFilterStatus('all')}
                                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                                    filterStatus === 'all'
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                All
                            </button>
                            <button
                                onClick={() => setFilterStatus('assigned')}
                                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                                    filterStatus === 'assigned'
                                        ? 'bg-green-600 text-white shadow-md'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                Assigned
                            </button>
                            <button
                                onClick={() => setFilterStatus('unassigned')}
                                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                                    filterStatus === 'unassigned'
                                        ? 'bg-amber-600 text-white shadow-md'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                Unassigned
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mb-4 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                        Device status
                        <select value={archiveFilter} onChange={event => setArchiveFilter(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2">
                            <option value="active">Active</option>
                            <option value="archived">Archived</option>
                            <option value="all">All</option>
                        </select>
                    </label>
                    {actionMessage && <p role="status" className="text-sm text-green-800">{actionMessage}</p>}
                    {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}
                </div>

                {/* Devices Grid */}
                {deviceGroups.map(({ area, items }) => (
                    <section key={area._id} className="mb-6 overflow-hidden rounded-xl border border-blue-200 bg-white shadow-sm">
                        <h2 className="bg-blue-700 px-5 py-3 text-lg font-semibold text-white">{area.name}</h2>
                        <div className="grid grid-cols-1 gap-6 p-5 md:grid-cols-2 lg:grid-cols-3">
                    {items.map((device) => {
                        const archived = Boolean(device.archived_at);
                        const isAssigned = !archived && Boolean(device.assigned_sensor_username);
                        const sensorIsOnline = connectedSensors.includes(device.assigned_sensor_username);

                        return (
                            <div
                                key={device._id}
                                className={`group bg-white rounded-xl shadow-md border-2 transition-all duration-300 hover:shadow-xl overflow-hidden ${
                                    isAssigned
                                        ? 'border-green-300 hover:border-green-400'
                                        : 'border-gray-200 hover:border-blue-400'
                                }`}
                            >
                                {/* Status Badge */}
                                <div className={`h-2 ${isAssigned ? 'bg-green-500' : 'bg-amber-500'}`}></div>

                                <div className="p-6">
                                    {/* Device Header */}
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex-1">
                                            <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
                                                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                                                </svg>
                                                {device.name}
                                            </h2>
                                            {archived && <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">Archivado</span>}
                                        </div>
                                        {isAssigned && sensorIsOnline && (
                                            <div className="flex items-center gap-1 bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-semibold">
                                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                                Online
                                            </div>
                                        )}
                                        {isAssigned && !sensorIsOnline && (
                                            <div className="flex items-center gap-1 bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs font-semibold">
                                                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                                Offline
                                            </div>
                                        )}
                                    </div>

                                    {/* Device Info */}
                                    <div className="space-y-2 mb-4">
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className="text-gray-600 w-16">Brand:</span>
                                            <span className="font-semibold text-gray-900">{device.brand}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className="text-gray-600 w-16">Model:</span>
                                            <span className="font-semibold text-gray-900">{device.model}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className="text-gray-600 w-16">Serie:</span>
                                            <span className="font-semibold text-gray-900">{device.serie}</span>
                                        </div>
                                    </div>

                                    {canAssign && (
                                        <div className="mb-4 flex flex-wrap gap-2">
                                            <button type="button" disabled={Boolean(deviceAction)} onClick={() => {
                                                setEditingDevice(device);
                                                document.getElementById("device-editor")?.scrollIntoView({ block: "start" });
                                            }} className="rounded border border-blue-300 px-3 py-1.5 text-sm font-semibold text-blue-800">Edit</button>
                                            <button type="button" disabled={Boolean(deviceAction)} onClick={() => updateDeviceStatus(device, archived ? "restore" : "archive")} className="rounded border border-gray-300 px-3 py-1.5 text-sm font-semibold">
                                                {archived ? "Restore" : "Archive"}
                                            </button>
                                            {archived && <button type="button" disabled={Boolean(deviceAction)} onClick={() => updateDeviceStatus(device, "delete")} className="rounded border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-800">Delete permanently</button>}
                                        </div>
                                    )}
                                    {/* Sensor Assignment */}
                                    {!archived && <div className="border-t border-gray-200 pt-4">
                                        {!isAssigned && canAssign && (
                                            <>
                                                <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                                                    </svg>
                                                    Assign Sensor
                                                </label>
                                                <select
                                                    value=""
                                                    onChange={(e) => assignSensorToDevice(device._id, e.target.value, device.name)}
                                                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                                                >
                                                    <option value="">-- Select Sensor --</option>
                                                    {availableSensors.length > 0 ? (
                                                        availableSensors.map(username => (
                                                            <option key={username} value={username}>
                                                                {username}
                                                            </option>
                                                        ))
                                                    ) : (
                                                        <option disabled>No available sensors</option>
                                                    )}
                                                </select>
                                            </>
                                        )}
                                        {!isAssigned && !canAssign && (
                                            <p className="text-sm text-gray-600">No sensor assigned.</p>
                                        )}
                                        {isAssigned && (
                                            <div className="space-y-3">
                                                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                                                    <div className="flex items-start gap-2">
                                                        <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        <div className="flex-1">
                                                            <p className="text-sm font-semibold text-green-900">Sensor Assigned</p>
                                                            <p className="text-sm text-green-700 mt-1">
                                                                <strong>{device.assigned_sensor_username}</strong>
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                                {canAssign && <button
                                                    onClick={() => assignSensorToDevice(device._id, '', device.name)}
                                                    className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                    Unassign Sensor
                                                </button>}
                                            </div>
                                        )}
                                    </div>}
                                </div>
                            </div>
                        );
                    })}
                        </div>
                    </section>
                ))}

                {/* Empty State */}
                {filteredDevices.length === 0 && (
                    <div className="text-center py-16 bg-white rounded-xl shadow-sm border border-gray-200">
                        <svg className="w-24 h-24 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                        </svg>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">No Devices Found</h3>
                        <p className="text-gray-600">
                            {searchQuery || filterStatus !== 'all' || archiveFilter !== 'active'
                                ? 'Try adjusting your filters or search terms'
                                : canAssign ? 'No devices registered for this hospital' : 'No devices in your authorized areas'}
                        </p>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="bg-white border-t border-gray-200 mt-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="text-sm text-gray-600">
                            © 2025 MHUTEMP Device Management System
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                <span>{connectedSensors.length} sensors online</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

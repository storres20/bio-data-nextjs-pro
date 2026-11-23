export function getAllowedAreas(user) {
    return user?.allowedAreas ?? (user?.area ? [user.area] : []);
}

export function canViewDevice(user, device) {
    return Boolean(device && user?.hospital?._id
        && device.hospital_id?._id === user.hospital._id
        && getAllowedAreas(user).some(area => area._id === device.area_id?._id));
}

export function groupDevicesByArea(items, getArea) {
    const groups = new Map();
    for (const item of items) {
        const area = getArea(item);
        if (!area) continue;
        if (!groups.has(area._id)) groups.set(area._id, { area, items: [] });
        groups.get(area._id).items.push(item);
    }
    return [...groups.values()].sort((a, b) => a.area.name.localeCompare(b.area.name));
}

export function authHeaders(token) {
    return { Authorization: `Bearer ${token}` };
}

export function canManageAccess(user) {
    return user?.role === 'hospital-admin' || user?.role === 'web-admin';
}

export function liveSocketUrl(apiBase) {
    const url = new URL(apiBase);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
}

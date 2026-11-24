import { authHeaders } from '@/lib/hospitalAccess';

export const historyDateFormatter = new Intl.DateTimeFormat('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true, timeZone: 'America/Lima'
});

const historyMetrics = [
    {
        label: 'Temp.OUT (°C)', field: 'dsTemperature', color: 'rgba(6, 182, 212, 1)',
        title: 'Temperature OUT (Probe) - °C', marker: 'bg-cyan-500',
        panel: 'from-cyan-50 to-cyan-100 border-cyan-200',
    },
    {
        label: 'Temp.IN (°C)', field: 'temperature', color: 'rgba(244, 63, 94, 1)',
        title: 'Temperature IN (Ambient) - °C', marker: 'bg-rose-500',
        panel: 'from-rose-50 to-rose-100 border-rose-200',
    },
    {
        label: 'Hum.IN (%)', field: 'humidity', color: 'rgba(99, 102, 241, 1)',
        title: 'Humidity IN (Ambient) - %', marker: 'bg-indigo-500',
        panel: 'from-indigo-50 to-indigo-100 border-indigo-200',
    },
];

const groupByDay = (dataset) => {
    return dataset.reduce((acc, item) => {
        const localDate = new Date(item.datetime).toLocaleDateString('es-PE', {
            timeZone: 'America/Lima',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });

        if (!acc[localDate]) acc[localDate] = [];
        acc[localDate].push(item);
        return acc;
    }, {});
};

const chartData = ({ label, field, color }, dayData, labels) => ({
    labels,
    datasets: [{
        label,
        data: dayData.map(d => parseFloat(d[field])),
        fill: false,
        borderColor: color,
        backgroundColor: color,
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
    }],
});

export const chartOptions = {
    maintainAspectRatio: false,
    responsive: true,
    plugins: {
        legend: {
            display: true,
            position: 'top',
            labels: {
                font: {
                    size: 12,
                    weight: '600'
                },
                padding: 15,
                usePointStyle: true,
            }
        },
        tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            titleFont: {
                size: 14,
                weight: 'bold'
            },
            bodyFont: {
                size: 13
            }
        }
    },
    scales: {
        x: {
            grid: {
                display: true,
                color: 'rgba(0, 0, 0, 0.05)',
            },
            ticks: {
                maxRotation: 45,
                minRotation: 45,
                font: {
                    size: 10
                }
            },
        },
        y: {
            grid: {
                display: true,
                color: 'rgba(0, 0, 0, 0.05)',
            },
            ticks: {
                font: {
                    size: 11
                }
            }
        }
    },
};

export function buildDailyCharts(data) {
    return Object.entries(groupByDay(data)).map(([day, records]) => {
        const labels = records.map(record => historyDateFormatter.format(new Date(record.datetime)));
        const charts = historyMetrics.map(metric => ({
            ...metric,
            data: chartData(metric, records, labels),
        }));
        return { day, count: records.length, charts };
    });
}

const apiBase = process.env.NEXT_PUBLIC_API_BASE_RAILWAY;
const limaDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function previousLimaWeek(now = new Date()) {
    const parts = Object.fromEntries(limaDate.formatToParts(now).map(({ type, value }) => [type, value]));
    const monday = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(sunday.getUTCDate() - 1);
    monday.setUTCDate(monday.getUTCDate() - 7);
    return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}

export async function fetchDeviceHistory(deviceId, { from, to, token, signal }) {
    const url = new URL(`${apiBase}/api/v1/datas/by-device/${encodeURIComponent(deviceId)}`);
    if (from) url.searchParams.set('from', new Date(`${from}T00:00:00.000-05:00`).toISOString());
    if (to) url.searchParams.set('to', new Date(`${to}T23:59:59.999-05:00`).toISOString());
    const response = await fetch(url, { headers: authHeaders(token), signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const records = await response.json();
    if (!Array.isArray(records)) throw new Error('Invalid history response');
    return records;
}

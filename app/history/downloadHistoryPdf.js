import Chart from 'chart.js/auto';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

function formatFilterDate(date) {
    return date.split('-').reverse().join('/');
}

function writeDeviceRecords(pdf, { device, records }, { hospital, area, from, to, title, dateFormatter, margin }) {
    pdf.setFont('helvetica', 'bold').setFontSize(18);
    pdf.text(title, margin, 20);
    pdf.setFont('helvetica', 'normal').setFontSize(10);
    pdf.text('Time zone: America/Lima (UTC-5)', margin, 27);

    const details = [
        ['Hospital', hospital?.name ?? device.hospital_id?.name ?? '-'],
        ['Area', area?.name ?? device.area_id?.name ?? '-'],
        ['Device', device.name ?? '-'],
        ['Brand', device.brand ?? '-'],
        ['Model', device.model ?? '-'],
        ['Serial', device.serie ?? '-'],
        ['From Date', formatFilterDate(from) || 'No start date'],
        ['To Date', formatFilterDate(to) || 'No end date'],
        ['Records', String(records.length)],
    ];
    if (device.archived_at) details.splice(6, 0, ['Status', 'Archivado']);

    autoTable(pdf, {
        startY: 33,
        margin,
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: 2 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 26 } },
        body: details,
    });

    autoTable(pdf, {
        startY: pdf.lastAutoTable.finalY + 5,
        margin,
        showHead: 'everyPage',
        head: [['Datetime (UTC-5)', 'Temp.OUT (°C)', 'Temp.IN (°C)', 'Hum.IN (%)']],
        body: records.length ? records.map(record => [
            dateFormatter.format(new Date(record.datetime)).replace(/\s/g, ' '),
            record.dsTemperature ?? '-',
            record.temperature ?? '-',
            record.humidity ?? '-',
        ]) : [[{ content: 'No records in this period', colSpan: 4 }]],
    });
}

function writeChartPages(pdf, { device, dailyCharts }, { area, margin, contentWidth, chartOptions, canvas }) {
    if (!dailyCharts.length) return;
    const chartHeight = contentWidth * canvas.height / canvas.width;

    for (const { day, charts } of dailyCharts) {
        pdf.addPage();
        pdf.setFont('helvetica', 'bold').setFontSize(15);
        pdf.text(`Historical Charts - ${day}`, margin, 20);
        if (area) {
            const label = [device.name, device.serie].filter(Boolean).join(' / ');
            pdf.setFont('helvetica', 'normal').setFontSize(10);
            pdf.text(pdf.splitTextToSize(label, contentWidth)[0] ?? '', margin, 27);
        }

        let y = area ? 38 : 31;
        for (const { title, data } of charts) {
            pdf.setFontSize(11);
            pdf.text(title, margin, y);
            const chart = new Chart(canvas, {
                type: 'line',
                data,
                options: {
                    ...chartOptions,
                    responsive: false,
                    animation: false,
                    devicePixelRatio: 1,
                },
            });

            try {
                pdf.addImage(chart.toBase64Image(), 'PNG', margin, y + 3, contentWidth, chartHeight, undefined, 'FAST');
            } finally {
                chart.destroy();
            }
            y += chartHeight + 12;
        }
    }
}

function downloadReport({ entries, hospital, area, from, to, title, filename, chartOptions, dateFormatter }) {
    const pdf = new jsPDF({ format: 'a4', compress: true });
    const margin = 14;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidth = pageWidth - 2 * margin;
    const canvas = entries.some(entry => entry.dailyCharts.length) ? document.createElement('canvas') : null;
    if (canvas) {
        canvas.width = 1100;
        canvas.height = 400;
    }

    pdf.setProperties({ title });
    entries.forEach((entry, index) => {
        if (index > 0) pdf.addPage();
        writeDeviceRecords(pdf, entry, { hospital, area, from, to, title, dateFormatter, margin });
        writeChartPages(pdf, entry, { area, margin, contentWidth, chartOptions, canvas });
    });

    const pageCount = pdf.getNumberOfPages();
    for (let page = 1; page <= pageCount; page++) {
        pdf.setPage(page);
        pdf.setFont('helvetica', 'normal').setFontSize(9);
        pdf.text(`${page} / ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
    }

    pdf.save(filename);
}

export function downloadHistoryPdf({ searchResult, dailyCharts = [], chartOptions, dateFormatter }) {
    const { device, from, to, records } = searchResult;
    const deviceName = (device.model || device.name || device._id).replace(/[^a-z0-9_-]+/gi, '_');
    const prefix = dailyCharts.length ? 'historial' : 'historial_datos';
    downloadReport({
        entries: [{ device, records, dailyCharts }],
        from,
        to,
        title: 'Historical Data Report',
        filename: `${prefix}_${deviceName}_${from || 'inicio'}_a_${to || 'fin'}.pdf`,
        chartOptions,
        dateFormatter,
    });
}

export function downloadAreaHistoryPdf({ hospital, area, entries, from, to, includeCharts, chartOptions, dateFormatter }) {
    const areaName = area.name.normalize('NFD').replace(/\p{Mark}/gu, '').replace(/[^a-z0-9_-]+/gi, '_');
    const hospitalName = hospital.name.normalize('NFD').replace(/\p{Mark}/gu, '').replace(/[^a-z0-9_-]+/gi, '_');
    const prefix = includeCharts ? 'historial_area' : 'historial_area_datos';
    downloadReport({
        entries,
        hospital,
        area,
        from,
        to,
        title: 'Area History Report',
        filename: `${prefix}_${hospitalName}_${areaName}_${from}_a_${to}.pdf`,
        chartOptions,
        dateFormatter,
    });
}

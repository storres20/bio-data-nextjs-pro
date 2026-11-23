import Chart from 'chart.js/auto';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

function formatFilterDate(date) {
    return date.split('-').reverse().join('/');
}

export function downloadHistoryPdf({ searchResult, dailyCharts, chartOptions, dateFormatter }) {
    const { device, from, to, records } = searchResult;
    const pdf = new jsPDF({ format: 'a4', compress: true });
    const margin = 14;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidth = pageWidth - 2 * margin;

    pdf.setProperties({ title: 'Historical Data Report' });
    pdf.setFont('helvetica', 'bold').setFontSize(18);
    pdf.text('Historical Data Report', margin, 20);
    pdf.setFont('helvetica', 'normal').setFontSize(10);
    pdf.text('Time zone: America/Lima (UTC-5)', margin, 27);

    autoTable(pdf, {
        startY: 33,
        margin,
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: 2 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 26 } },
        body: [
            ['Hospital', device.hospital_id?.name ?? '-'],
            ['Area', device.area_id?.name ?? '-'],
            ['Device', device.name ?? '-'],
            ['Brand', device.brand ?? '-'],
            ['Model', device.model ?? '-'],
            ['Serial', device.serie ?? '-'],
            ['From Date', formatFilterDate(from) || 'No start date'],
            ['To Date', formatFilterDate(to) || 'No end date'],
            ['Records', String(records.length)],
        ],
    });

    autoTable(pdf, {
        startY: pdf.lastAutoTable.finalY + 5,
        margin,
        showHead: 'everyPage',
        head: [['Datetime (UTC-5)', 'Temp.OUT (°C)', 'Temp.IN (°C)', 'Hum.IN (%)']],
        body: records.map(record => [
            dateFormatter.format(new Date(record.datetime)).replace(/\s/g, ' '),
            record.dsTemperature ?? '-',
            record.temperature ?? '-',
            record.humidity ?? '-',
        ]),
    });

    const canvas = document.createElement('canvas');
    canvas.width = 1100;
    canvas.height = 400;
    const chartHeight = contentWidth * canvas.height / canvas.width;

    for (const { day, charts } of dailyCharts) {
        pdf.addPage();
        pdf.setFont('helvetica', 'bold').setFontSize(15);
        pdf.text(`Historical Charts - ${day}`, margin, 20);

        let y = 31;
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

    const pageCount = pdf.getNumberOfPages();
    for (let page = 1; page <= pageCount; page++) {
        pdf.setPage(page);
        pdf.setFont('helvetica', 'normal').setFontSize(9);
        pdf.text(`${page} / ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
    }

    const deviceName = (device.model || device.name || device._id).replace(/[^a-z0-9_-]+/gi, '_');
    pdf.save(`historial_${deviceName}_${from || 'inicio'}_a_${to || 'fin'}.pdf`);
}

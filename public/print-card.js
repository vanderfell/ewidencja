// File: public/print-card.js
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('print-cards')?.addEventListener('click', async () => {
    const ids          = window.OBS_SUPPORT_IDS || [];
    const year         = window.YEAR;
    const month        = window.MONTH;
    const absenceTypes = window.absenceTypes || [];

    if (!ids.length) {
      alert('Brak pracowników do wydruku!');
      return;
    }

    // Load footer once
    let footer = '';
    try {
      footer = await fetch('/footer_print.html').then(r => r.text());
    } catch {
      footer = '<div style="color:#d00;font-size:12px;">(Błąd ładowania stopki)</div>';
    }

    // Begin print document
    let html = `
      <html>
      <head>
        <meta charset="utf-8">
        <title>Karty ewidencji</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          html, body { margin:0; padding:0; height:100%; background:#fff; }
          body { font-family: Arial, sans-serif; }

          table { border-collapse: collapse; width: 100%; }

          .print-card { page-break-after: always; box-sizing: border-box; }

          /* —— CENTER THE HEADER CELLS —— */
          .card-container .main-header th,
          .card-container .main-header td,
          .card-container .small-header th,
          .card-container .small-header td {
            text-align: center;
            vertical-align: middle;
          }

          /* give the Faktyczna-header some room so it won't wrap */
          .card-container .main-faktyczna th:first-child {
            min-width: 120px;
            white-space: nowrap;
          }

          /* center the day-columns in the .main-day table */
          .card-container .main-day td:not(.label) {
            text-align: center;
          }

          /* center the “–” placeholders in .main-faktyczna */
          .card-container .main-faktyczna td:not([rowspan]):not([colspan]) {
            text-align: center;
          }

          /* small gap before the “Faktyczna liczba godzin czasu pracy” */
          .card-container .faktyczna-wrapper {
            margin-top: 4mm;
          }

          /* small gap before the “Nieobecności w pracy z powodu:” */
          .card-container .absence-wrapper {
            margin-top: 4mm;
          }

          /* a little breathing room under the header block */
          .card-container .card-header-wrapper {
            margin-bottom: 8px;
          }

          /* footer styling */
          .print-footer {
            font-size: 10px; color: #666; text-align: right; padding-top: 4mm;
          }
          @media print {
            .print-footer {
              position: fixed; bottom: 10mm; left: 10mm; right: 10mm; background: #fff;
            }
          }
        </style>
      </head>
      <body>
    `;

    // Append each card
    for (const id of ids) {
      try {
        const resp     = await fetch(`/card/${id}?year=${year}&month=${month}`);
        const cardHtml = await resp.text();
        html += `
          <div class="print-card">
            <div class="card-container">
              ${cardHtml}
            </div>
            <div class="print-footer">
              ${footer}
            </div>
          </div>
        `;
      } catch {
        html += `
          <div class="print-card" style="color:#b00; padding:2em;">
            Błąd ładowania karty pracownika o ID ${id}
          </div>
        `;
      }
    }

    html += `
      </body>
      </html>
    `;

    // Open and print
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.print();
  });
});

// File: public/print-card.js
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('print-cards')?.addEventListener('click', async () => {
    const ids   = window.OBS_SUPPORT_IDS || [];
    const year  = window.YEAR;
    const month = window.MONTH;

    if (!ids.length) {
      alert('Brak pracowników do wydruku!');
      return;
    }

    // Budujemy podstawowy layout i marginesy
    let html = `
      <html>
      <head>
        <meta charset="utf-8">
        <title>Karty ewidencji</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          html, body { margin:0; padding:0; background:#fff; }
          body { font-family: Arial, sans-serif; }
          .print-card { page-break-after: always; box-sizing: border-box; }
          .footer-print { position: fixed !important; bottom: 8mm; right: 12mm; }

          /* USUWANIE WSZELKICH SZCZELIN W TABELACH */
          table, .aligned-table, .nieobecnosci, .uwagi, .card-container table {
            border-collapse: collapse !important;
            border-spacing: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .aligned-table td, .aligned-table th,
          .nieobecnosci td, .nieobecnosci th {
            border: 1px solid #000;
            padding: 2px 1px;    /* minimalny padding do środka komórki */
            vertical-align: middle;
            min-width: 28px;
            font-size: 0.89em;
            background: #fff;
          }
          .aligned-table th, .nieobecnosci th {
            background: #f5f5f5;
            font-weight: bold;
          }
          .aligned-table tr, .nieobecnosci tr {
            height: 18px;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* GŁÓWNY UKŁAD (flex) */
          .card-header-wrapper,
          .day-wrapper,
          .faktyczna-wrapper,
          .absence-wrapper {
            display: flex;
            gap: 8px;
          }
          .main-header, .main-day, .main-faktyczna, .main-absence {
            flex: 1;
            min-width: 0;
          }
          .small-header, .small-day, .small-faktyczna, .small-absence {
            flex: 0 0 170px;
            max-width: 170px;
            min-width: 130px;
          }

          .small-header td,
          .small-header th,
          .small-day td,
          .small-day th {
            text-align: center;
            font-size: 0.9em;
            padding: 2px 1px;
          }

          /* Specjalne wyśrodkowanie kluczowych komórek */
          .center, 
          .aligned-table .center, 
          .aligned-table td.center, 
          .aligned-table th.center {
            text-align: center !important;
            vertical-align: middle !important;
          }

          /* Uwagi i podpisy */
          .uwagi {
            width: 100%;
            border-collapse: collapse !important;
            border-spacing: 0 !important;
            margin-top: 8px;
          }
          .uwagi td, .uwagi th {
            border: 1px solid #B5B5B5;
            padding: 4px 2px;
            vertical-align: middle;
            text-align: center;
          }
          .uwagi tr:first-child td {
            height: 15px !important;
            line-height: 13px !important;
            font-size: 0.86em;
            padding: 0 !important;
          }
          .uwagi tr:first-child td p {
            margin: 0 !important;
            padding: 0 !important;
          }
          .uwagi tr:nth-child(2) td {
            height: 60px !important;
            line-height: 60px !important;
            font-size: 0.94em;
          }

          /* Wyśrodkowanie ważnych komórek nagłówkowych w tabelach */
          .aligned-table th,
          .aligned-table td {
            text-align: center;
          }
          /* Możesz tu dołożyć selektory dla konkretnych nazw kolumn, jeśli chcesz tylko wybrane komórki */
          
          .card-header-wrapper {
  display: flex;
  gap: 8px;
  margin-bottom: 4px !important;    /* odstęp po Miesiąc */
}
.day-wrapper {
  display: flex;
  gap: 8px;
  margin-bottom: 4px !important;    /* odstęp po Normatywny czas pracy */
}
.faktyczna-wrapper {
  display: flex;
  gap: 8px;
  margin-bottom: 4px !important;    /* odstęp po Faktyczna liczba godzin */
}
.absence-wrapper {
  display: flex;
  gap: 8px;
  margin-top: 4px !important;       /* odstęp przed Nieobecnościami */
}

          
        </style>
      </head>
      <body>
    `;

    for (const id of ids) {
      try {
        const resp     = await fetch(`/card/${id}?year=${year}&month=${month}`);
        const cardHtml = await resp.text();
        html += `
          <div class="print-card">
            ${cardHtml}
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

const footer = await fetch('/footer_print.html').then(r => r.text());

html += `
    ${footer}
  </body>
  </html>
`;


    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.print();
  });
});

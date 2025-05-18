// --- DRUKUJ ZESTAWIENIE KWARTALNE ---
document.addEventListener('DOMContentLoaded', () => {
  document.body.addEventListener('click', function(e) {
    if (e.target && e.target.id === 'print-quarterly') {
      // Szukamy tabeli (najbliższy .table table)
      const table = e.target.closest('body').querySelector('.table table');
      if (!table) return;

      const tableClone = table.cloneNode(true);

      // CSS do druku
      let css = `
        @page { size: A4 landscape; margin: 10mm; }
        body { font-family: Arial, sans-serif; margin: 0; background: #fff; }
        h2 { margin-top: 0; font-size: 1.13em; }
        table {
          width: 100%; border-collapse: collapse;
          margin-bottom: 0.7em; table-layout: fixed;
        }
        th, td {
          border: 0.3px solid #000;
          padding: 2px;
          text-align: center;
          vertical-align: middle;
          font-size: 10px;
          word-break: break-word;
          box-sizing: border-box;
        }
        .sum-cell { background-color: #ccc !important; }
        .stripe { background-color: #f5f5f5 !important; }
        .name-nowrap { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: normal; }
        .month-col, .year-col { word-wrap: break-word; white-space: normal; font-size: .8em; }
        button { display:none !important; }
        @media print {
          html, body { height: 100%; }
          table { page-break-inside: avoid; }
        }
        .footer-print {
          width: 100%;
          margin-top: 30px;
          color: #888;
          font-size: 9px;
          text-align: right;
          position: fixed;
          bottom: 8mm;
          right: 12mm;
        }
      `;

      // Rok z window lub nowy Date
      const year = window.YEAR || new Date().getFullYear();
      const header = `<h2 style="margin-bottom: 0.4em;">Zestawienie kwartalne — ${year}</h2>`;
      const footer = `<div class="footer-print">Wygenerowano z systemu: EWP/Artur Kluza</div>`;

      let html = `<html><head><title>Zestawienie kwartalne</title>
        <style>${css}</style>
      </head><body>
        ${header}
        ${tableClone.outerHTML}
        ${footer}
      </body></html>`;

      const w = window.open('', '_blank');
      w.document.write(html);
      w.document.close();
      w.print();
    }
  });
});

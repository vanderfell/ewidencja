// --- DRUKUJ ZESTAWIENIE URLOPOWE ---
document.addEventListener('DOMContentLoaded', () => {

  document.body.addEventListener('click', async e => {
    if (!e.target || e.target.id !== 'print-vac') return;

    const table = document.querySelector('#vac-table');
    if (!table) return;

    const tblClone = table.cloneNode(true);
    
  tblClone.querySelectorAll('input').forEach(inp => {
  const td  = inp.parentNode;     // komórka, w której siedzi input
  td.textContent = inp.value;     // wpisujemy samą wartość
  });

    /* ---------- CSS tylko do wydruku ---------- */
    const css = `
      @page { size: A4 landscape; margin: 10mm; }
      body  { font-family: Arial, sans-serif; margin:0; background:#fff; }
      h2    { margin:0 0 .6em 0; font-size:1.13em; text-align:left; }
      table { width:100%; border-collapse:collapse; table-layout:fixed; }
      th,td { border:.3px solid #000; padding:2px 4px;
              text-align:center; vertical-align:middle; font-size:9px;
              white-space:nowrap; box-sizing:border-box; }
      th    { font-weight:600; }
      .sum-cell { background:#ccc !important; }
      .stripe   { background:#f5f5f5 !important; }
      .name-nowrap { white-space:nowrap; overflow:hidden;
                     text-overflow:ellipsis; font-weight:normal; }
      button, .no-print { display:none !important; }
      
      @media print {
        html,body { height:100%; }
        table     { page-break-inside:avoid; }
        .footer-print { position:fixed!important; bottom:8mm; right:12mm; }
      }
    `;

    /* ---------- Nagłówek + stopka ---------- */
    const headerHTML = `
      <h2>Urlopy wypoczynkowe &mdash; Obsługa</h2>
    `;
    const footerHTML = await fetch('/footer_print.html').then(r => r.text());

    /* ---------- Złożenie całej strony ---------- */
    const html = `
      <html>
      <head>
        <title>Urlopy wypoczynkowe</title>
        <style>${css}</style>
      </head>
      <body>
        ${headerHTML}
        ${tblClone.outerHTML}
        ${footerHTML}
      </body>
      </html>
    `;

    /* ---------- Otwarcie nowego okna i druk ---------- */
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.print();
  });

});

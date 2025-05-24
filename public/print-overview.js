// --- DRUKUJ ZESTAWIENIE (tylko tabelę ewidencji, styl jak w card.ejs) ---
document.getElementById('print-overview')?.addEventListener('click', async () => {
  const table = document.querySelector('#overview-table table');
  if (!table) return;

  // Pobieramy typy absencji (z bazy, z opisami)
  const codeColors = window.CODE_COLORS || {};
  const absenceTypes = window.absenceTypes || Object.entries(codeColors).map(([code, color]) => ({ code, name: code, color }));

  // Aktualny miesiąc i rok
  const year = window.YEAR || new Date().getFullYear();
  const monthNum = window.MONTH || (new Date().getMonth() + 1);
  const monthNames = [
    'styczeń','luty','marzec','kwiecień','maj','czerwiec',
    'lipiec','sierpień','wrzesień','październik','listopad','grudzień'
  ];
  const month = monthNames[monthNum - 1] || '';

  // Klonujemy tabelę bez inputów
  const tableClone = table.cloneNode(true);
  tableClone.querySelectorAll('input').forEach(inp => {
    const td = inp.parentElement;
    td.textContent = inp.value;
  });

  // Dodaj atrybuty do kolorowania kolumn absencji
  let ths = Array.from(tableClone.querySelectorAll('thead tr:last-child th'));
  ths.forEach((th, idx) => {
    const code = th.textContent.trim().toLowerCase();
    if (absenceTypes.some(t => t.code.toLowerCase() === code)) {
      th.setAttribute('abs-code', code);
      Array.from(tableClone.querySelectorAll(`tbody tr`)).forEach(tr => {
        let td = tr.children[idx];
        if (td) td.setAttribute('abs-code', code);
      });
    }
  });

  // Kolorowanie kolumn absencji
  const colorStyle = absenceTypes.map(t =>
    `td[abs-code="${t.code.toLowerCase()}"], th[abs-code="${t.code.toLowerCase()}"] { background: ${t.color} !important; }`
  ).join('\n');

  // LEGEND: generuj na podstawie absenceTypes, z kolorem i pełną nazwą
  let legend = '<div style="margin-bottom:12px; font-size:11px;">';
  legend += '<strong>Legenda:</strong><br>';
  legend += absenceTypes.map(t => {
    return `
      <span style="
        display: inline-flex;
        align-items: center;
        margin: 4px 4px 0px 0;
        font-size: 7px;">
        <span style="
          display:inline-block;
          min-width:12px;
          padding:2px 7px;
          border-radius:2px;
          margin-right:4px;
          background:${t.color};
          border:1px solid #bbb;
          text-align:center;
          font-weight:normal;"
          title="${t.name}">${t.code.toUpperCase()}</span>
        <span style="font-size:11px; color:#222;">${t.name}</span>
      </span>
    `;
  }).join('<br>');
  legend += '</div>';

  // Styl jak w card.ejs: cienkie czarne linie, minimalny padding, dni tygodnia czarne
  let css = `
    @page { size: A4 landscape; margin: 10mm; }
    body { font-family: Arial, sans-serif; margin: 0; background: #fff; }
    h2 { margin-top: 0; font-size: 1.13em; }
    table {
      width: 100%; border-collapse: collapse;
      margin-bottom: 0.7em; table-layout: fixed;
    }
    th, td {
      border: 0.5px solid #000;
      padding: 2px;
      text-align: center;
      vertical-align: middle;
      min-width: 17px;
      font-size: 10px;
      word-break: break-all;
      box-sizing: border-box;
      color: #000;
    }
    th.name-col, td.name-col { 
      text-align: left; 
      font-weight: normal;
      background: #f5f5f5; 
      width: 80px;
    }
    th.summary-sep, td.summary-sep { border-left: 2px solid #000 !important; }
    .blocked { background: #939393 !important; }
    ${colorStyle}
    .legend { margin-top: 10px; font-size: 11px;}
    .legend span { display:inline-block; min-width:22px; padding:2px 7px; border-radius:5px; margin-right:10px; margin-bottom:4px; border:0.5px solid #000;}
    button { display:none !important; }
    /* Dni tygodnia: czarne litery */
    thead tr:nth-child(2) th { color: #000 !important; font-weight: normal; font-size: 10px;}
    @media print {
      html, body { height: 100%; }
      table { page-break-inside: avoid; }
      .legend { page-break-inside: avoid; }
      .footer-print { position: fixed !important; bottom: 8mm; right: 12mm; }
      *{
      -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
    }
      
    }
  `;

  // Pobierz stopkę z pliku
  const footer = await fetch('/footer_print.html').then(r => r.text());

  let html = `<html><head><title>Zestawienie ewidencji</title>
    <style>${css}</style>
  </head><body>
    <h2 style="margin-bottom: 0.4em;">Zestawienie ewidencji — ${month} ${year}</h2>
    ${tableClone.outerHTML}
    ${legend}
    ${footer}
  </body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.print();
});

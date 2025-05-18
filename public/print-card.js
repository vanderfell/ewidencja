// File: public/print-card.js
document.addEventListener('DOMContentLoaded', () => {
  document.body.addEventListener('click', async function(e) {
    if (e.target && e.target.id === 'print-all-cards') {
      const cards = document.querySelectorAll('#all-cards .card-container');
      if (!cards.length) return alert('Brak kart pracowników!');

      // Pobierz typy absencji (z window)
      const absenceTypes = window.absenceTypes || [];

      let css = `…(jak wyżej, możesz przekleić cały blok stylu z poprzedniej wersji)…`;

      // Legenda (opcjonalnie na początku lub pod każdą kartą)
      let legend = '';
      if(absenceTypes && absenceTypes.length > 0) {
        legend = '<div style="margin:10px 0 18px 0;font-size:11px;"><strong>Legenda:</strong><br>' +
          absenceTypes.map(t => `
            <span style="display: inline-flex; align-items: center; margin: 4px 4px 0px 0; font-size: 7px;">
              <span style="display:inline-block; min-width:12px; padding:2px 7px; border-radius:2px; margin-right:4px;
                background:${t.color}; border:1px solid #bbb; text-align:center; font-weight:normal;"
                title="${t.name}">${t.code.toUpperCase()}</span>
              <span style="font-size:11px; color:#222;">${t.name}</span>
            </span>
          `).join('<br>') + '</div>';
      }

      // Stopka z pliku (np. podpisy)
      let footer = '';
      try {
        footer = await fetch('/footer_print.html').then(r => r.text());
      } catch {}

      // Składanie kart do jednego HTML-a (każda karta na osobnej stronie)
      let allCardsHtml = '';
      cards.forEach((card, idx) => {
        const cardClone = card.cloneNode(true);
        cardClone.querySelectorAll('input').forEach(inp => {
          const td = inp.parentElement;
          td.textContent = inp.value;
        });
        allCardsHtml += `
          <div class="print-card" style="page-break-after: always;">
            ${cardClone.outerHTML}
            ${legend}
            ${footer}
          </div>
        `;
      });

      let html = `<html><head><title>Karty ewidencji pracowników</title>
        <style>
          ${css}
          .print-card { page-break-after: always; }
        </style>
      </head><body>
        ${allCardsHtml}
      </body></html>`;

      const w = window.open('', '_blank');
      w.document.write(html);
      w.document.close();
      w.print();
    }
  });
});

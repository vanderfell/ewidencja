// File: public/script.js

document.addEventListener('DOMContentLoaded', () => {
  const YEAR  = window.YEAR;
  const MONTH = window.MONTH;

  // ——— CONTEXT-MENU DELEGATION ———
  const empMenu = document.getElementById('emp-context-menu');
  const dayMenu = document.getElementById('day-context-menu');
  let curEmpId, curDay;

  document.addEventListener('contextmenu', e => {
    // Employee row
    const td = e.target.closest('td.name-col');
    if (td) {
      e.preventDefault();
      curEmpId = td.closest('tr').dataset.emp;
      empMenu.style.top     = `${e.pageY}px`;
      empMenu.style.left    = `${e.pageX}px`;
      empMenu.style.display = 'block';
      return;
    }
    // Day‐override header
    const th = e.target.closest('th.status-cell');
    if (th) {
      e.preventDefault();
      curDay = +th.dataset.day;
      dayMenu.style.top     = `${e.pageY}px`;
      dayMenu.style.left    = `${e.pageX}px`;
      dayMenu.style.display = 'block';
    }
  });
  document.addEventListener('click', () => {
    empMenu.style.display = 'none';
    dayMenu.style.display = 'none';
  });


  // ——— FETCH & RENDER OVERVIEW ———
  async function fetchOverview() {
    const res = await fetch(`/api/overview-data?year=${YEAR}&month=${MONTH}`);
    return res.json();
  }

  async function refreshOverview() {
    const { dayInfos, summary } = await fetchOverview();

    // Update header-status cells
    document.querySelectorAll('.status-cell').forEach((cell, i) => {
      const di = dayInfos[i];
      cell.textContent = di.status;
      cell.classList.toggle('blocked', di.status !== 'P');
    });

    // Update summary rows
    summary.forEach(s => {
      const tr = document.querySelector(`tr[data-emp="${s.id}"]`);
      if (!tr) return;
      tr.querySelector('.sum-days').textContent  = s.days;
      tr.querySelector('.sum-hours').textContent = s.hours;
      ['w','l4','nd','bz','op','ok','sw'].forEach(k => {
        tr.querySelector(`.sum-${k}`).textContent = s[k];
      });
    });

    // Enable/disable inputs per day status
    document.querySelectorAll('input.cell-input').forEach(input => {
      const d = parseInt(input.dataset.day,10);
      const di = dayInfos.find(x=>x.day===d);
      const ok = di && di.status==='P';
      input.disabled = !ok;
      input.parentElement.classList.toggle('blocked', !ok);
    });
  }


  // ——— WORKDAY INPUT HANDLING ———
  function applyColor(input) {
    const txt = input.value.trim().toLowerCase();
    input.parentElement.style.backgroundColor =
      (window.CODE_COLORS[txt] && isNaN(+txt))
        ? window.CODE_COLORS[txt]
        : '';
  }

  function recalcRow(empId) {
    const tr = document.querySelector(`tr[data-emp="${empId}"]`);
    let hrs=0, days=0, codes=[];
    tr.querySelectorAll('input.cell-input').forEach(i => {
      const v = i.value.trim().toLowerCase();
      if (v!=='' && !isNaN(+v)) { hrs+=+v; days++; }
      else if (v!=='') codes.push(v);
    });
    tr.querySelector('.sum-days').textContent  = days;
    tr.querySelector('.sum-hours').textContent = hrs;
    ['w','l4','nd','bz','op','ok','sw'].forEach(c => {
      tr.querySelector(`.sum-${c}`).textContent = codes.filter(x=>x===c).length;
    });
  }

  async function saveWorkday(input) {
    const { emp, year, month, day } = input.dataset;
    const code = input.value.trim();
    const td   = input.parentElement;
    try {
      const res = await fetch('/api/workday', {
        method: 'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ emp_id:+emp, year:+year, month:+month, day:+day, code })
      });
      const { ok } = await res.json();
      td.classList.remove('save-ok','save-error');
      td.classList.add(ok?'save-ok':'save-error');
      setTimeout(()=>td.classList.remove('save-ok','save-error'),1000);
      if (!ok) throw 0;

      applyColor(input);
      recalcRow(emp);
      await refreshOverview();

      // refresh card if open
      const card = document.querySelector('.subtab-content.active[id^="card-"]');
      if (card) {
        const id = card.id.split('-')[1];
        card.innerHTML = await (await fetch(`/card/${id}?year=${YEAR}&month=${MONTH}`)).text();
      }
    } catch {}
  }

  // Delegate for all existing & future inputs
  document.addEventListener('input', e => {
    if (e.target.matches('input.cell-input')) {
      applyColor(e.target);
      recalcRow(e.target.dataset.emp);
    }
  });
  document.addEventListener('blur', e => {
    if (e.target.matches('input.cell-input')) {
      saveWorkday(e.target);
    }
  }, true);


  // ——— TABS & SUBTABS ———
  document.querySelectorAll('.tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tabs .tab').forEach(t=>t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });

  document.querySelectorAll('.subtabs .subtab').forEach(st => {
    st.addEventListener('click', async () => {
      const parent = st.closest('.tab-content');
      parent.querySelectorAll('.subtab').forEach(s=>s.classList.remove('active'));
      parent.querySelectorAll('.subtab-content').forEach(c=>c.classList.remove('active'));
      st.classList.add('active');
      const pane = parent.querySelector('#'+st.dataset.subtab);
      if (pane.id==='kw-tab') {
        pane.innerHTML = await (await fetch(`/kw?year=${YEAR}&month=${MONTH}`)).text();
      } else if (pane.id.startsWith('card-')) {
        const id = pane.id.split('-')[1];
        pane.innerHTML = await (await fetch(`/card/${id}?year=${YEAR}&month=${MONTH}`)).text();
      }
      pane.classList.add('active');
    });
  });


  // ——— DAY OVERRIDE ———
  dayMenu.addEventListener('click', async e => {
    const code = e.target.dataset.code;
    await fetch('/api/calendar-overrides', {
      method:  code ? 'POST' : 'DELETE',
      headers: {'Content-Type':'application/json'},
      body:    JSON.stringify({ year:YEAR, month:MONTH, day:curDay, code })
    });
    await refreshOverview();
    const card = document.querySelector('.subtab-content.active[id^="card-"]');
    if (card) {
      const id = card.id.split('-')[1];
      card.innerHTML = await (await fetch(`/card/${id}?year=${YEAR}&month=${MONTH}`)).text();
    }
  });


  // ——— EDIT / DELETE EMPLOYEE ———
  const empModal = document.getElementById('emp-modal');
  const empForm  = document.getElementById('emp-edit-form');

  // DELETE
  document.getElementById('ctx-delete').addEventListener('click', async () => {
    if (!confirm('Na pewno usunąć pracownika?')) {
      empMenu.style.display = 'none';
      return;
    }
    const res = await fetch(`/api/employees/${curEmpId}`, { method:'DELETE' });
    const { ok } = await res.json();
    empMenu.style.display = 'none';
    if (ok) {
      // pełne odświeżenie
      location.reload();
    }
  });
  
 // ——— NOTE MODAL ———
const noteModal  = document.getElementById('note-modal');
const noteArea   = document.getElementById('note-text');
const btnCancel  = document.getElementById('note-cancel');
const btnSave    = document.getElementById('note-save');
const btnDelete  = document.getElementById('note-delete');

document.getElementById('ctx-note').addEventListener('click', async () => {
  empMenu.style.display = 'none';
  // pobierz istniejącą notatkę
  let existing = '';
  try {
    const resp = await fetch(
      `/api/notes?emp_id=${curEmpId}&year=${YEAR}&month=${MONTH}`
    );
    existing = (await resp.json()).note || '';
  } catch {}
  noteArea.value = existing;
  // pokaż modal
  noteModal.style.display = 'flex';
});

// anuluj
btnCancel.addEventListener('click', () => {
  noteModal.style.display = 'none';
});

// usuń (wywołuje DELETE)
btnDelete.addEventListener('click', async () => {
  if (!confirm('Na pewno usunąć notatkę?')) return;
  try {
    const resp = await fetch('/api/notes', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        emp_id: +curEmpId,
        year:   YEAR,
        month:  MONTH
      })
    });
    const { ok } = await resp.json();
    alert(ok ? 'Notatka usunięta.' : 'Błąd usuwania.');
  } catch {
    alert('Błąd usuwania notatki.');
  } finally {
    noteModal.style.display = 'none';
  }
});

// zapisz (POST)
btnSave.addEventListener('click', async () => {
  const text = noteArea.value.trim();
  try {
    const resp = await fetch('/api/notes', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        emp_id: +curEmpId,
        year:   YEAR,
        month:  MONTH,
        note:   text
      })
    });
    const { ok } = await resp.json();
    alert(ok ? 'Notatka zapisana.' : 'Błąd zapisu.');
  } catch {
    alert('Błąd zapisu notatki.');
  } finally {
    noteModal.style.display = 'none';
  }
});

// kliknięcie poza modalem – też zamknij
noteModal.addEventListener('click', e => {
  if (e.target === noteModal) noteModal.style.display = 'none';
});




  // EDIT (popup)
  document.getElementById('ctx-edit').addEventListener('click', () => {
    const tr = document.querySelector(`tr[data-emp="${curEmpId}"]`);
    empForm.full_name.value      = tr.querySelector('td.name-col').textContent.trim();
    empForm.position.value       = tr.dataset.position;
    empForm.payroll_number.value = tr.dataset.payroll;
    empForm.daily_norm.value     = tr.dataset.daily;
    empForm.department.value     = tr.dataset.department;
    empMenu.style.display   = 'none';
    empModal.style.display  = 'flex';
  });

  document.getElementById('modal-cancel').addEventListener('click', () => {
    empModal.style.display = 'none';
  });
  // SUBMIT EDIT
  empForm.addEventListener('submit', async e => {
    e.preventDefault();
    const data = {
      full_name:      empForm.full_name.value.trim(),
      position:       empForm.position.value.trim(),
      payroll_number: empForm.payroll_number.value.trim(),
      daily_norm:     parseFloat(empForm.daily_norm.value),
      department:     empForm.department.value
    };
    const res = await fetch(`/api/employees/${curEmpId}`, {
      method:'PUT',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(data)
    });
    const { ok } = await res.json();
    empModal.style.display = 'none';
    if (ok) {
      location.reload();
    }
  });


  // ——— PRINT CARDS ———
  document.getElementById('print-cards')?.addEventListener('click', async () => {
    let html = `<html><head><title>Karty pracowników</title><style>
      @page{size:A4 landscape;margin:10mm}
      @media print{*{-webkit-print-color-adjust:exact}}
      body{font-family:sans-serif;margin:1em}
      table{width:100%;border-collapse:collapse;margin-bottom:2em}
      th,td{border:1px solid#999;padding:8px;text-align:center}
      th:first-child,td:first-child{text-align:left}
    </style></head><body>`;
    for (const div of document.querySelectorAll('.subtab-content[id^="card-"]')) {
      const id   = div.id.split('-')[1];
      const resp = await fetch(`/card/${id}?year=${YEAR}&month=${MONTH}`);
      html      += `<div style="page-break-after:always;">${await resp.text()}</div>`;
    }
    html += `</body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  });


  // ——— DEPARTMENT‐SELECT ———
  document.querySelectorAll('select.department-select').forEach(select => {
    select.addEventListener('change', async () => {
      const id   = select.dataset.empId;
      const dept = select.value;
      const res  = await fetch(`/api/employees/${id}`, {
        method:'PUT',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ department: dept })
      });
      const { ok } = await res.json();
      if (ok) {
        // odśwież, by pracownik wędrował między listami
        location.reload();
      }
    });
  });


  // ——— INITIALIZE ———
  refreshOverview();
});

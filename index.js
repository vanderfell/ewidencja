const express    = require('express');
const bodyParser = require('body-parser');
const sqlite3    = require('sqlite3').verbose();
const path       = require('path');

const app = express();
const db  = new sqlite3.Database(path.join(__dirname, 'data', 'ewidencja.db'));

// kolory nieobecności
const CODE_COLORS = {
  l4: '#FFC7CE',
  w:  '#FABF8F',
  ok: '#92CDDC',
  nd: '#CCC0DA',
  sw: '#E26B0A',
  op: '#F6A0F2',
  bz: '#92D050'
};

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// --- inicjalizacja bazy ---
db.serialize(() => {
  // tabela notatek
  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      emp_id INTEGER,
      year INTEGER,
      month INTEGER,
      note TEXT,
      PRIMARY KEY(emp_id,year,month)
    );
  `);

  // tabela pracowników (z department od razu)
  db.run(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT UNIQUE NOT NULL,
      position TEXT,
      payroll_number TEXT,
      work_time_fte REAL,
      daily_norm REAL,
      notes TEXT,
      department TEXT
    );
  `);

  // tabela dni pracy
  db.run(`
    CREATE TABLE IF NOT EXISTS workdays (
      emp_id INTEGER,
      year INTEGER,
      month INTEGER,
      day INTEGER,
      code TEXT,
      PRIMARY KEY(emp_id,year,month,day)
    );
  `);

  // zawsze usuwamy starą wersję calendar_overrides (jeśli istniała w złej strukturze)
  db.run(`DROP TABLE IF EXISTS calendar_overrides;`);

 // tabela nadpisywań z departamentem
  db.run(`
    CREATE TABLE calendar_overrides (
      year INTEGER,
      month INTEGER,
      day INTEGER,
      department TEXT,
      code TEXT,
      PRIMARY KEY(year,month,day,department)
    );
  `);

  // tabela ewidencji obecności nauczycieli
  db.run(`
    CREATE TABLE IF NOT EXISTS teacher_presence (
      teacher_id INTEGER,
      year       INTEGER,
      month      INTEGER,
      date       INTEGER,
      hours      REAL,
      code       TEXT,
      PRIMARY KEY(teacher_id,year,month,date)
    );
  `);

  // tabela ustawień
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // domyślne wartości w settings
  db.run(`
    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('company_name','Nazwa firmy'),
      ('company_nip','0000000000');
  `);
});


// — API for instant refresh in the client (wydzielone per dział)
app.get('/api/overview-data', (req, res) => {
  const year       = parseInt(req.query.year, 10)  || new Date().getFullYear();
  const month      = parseInt(req.query.month,10)  || (new Date().getMonth()+1);
  const department = req.query.dept || 'Obsługa';

  // 1) load calendar overrides tylko dla tego działu
  db.all(
    'SELECT day, code FROM calendar_overrides WHERE year=? AND month=? AND department=?',
    [year, month, department],
    (errO, overrides) => {
      if (errO) return res.json({ dayInfos: [], summary: [] });
      const overrideMap = new Map(overrides.map(o => [o.day, o.code]));

      // build dayInfos
      const ndays  = new Date(year, month, 0).getDate();
      const DOW_PL = ['nd','pn','wt','śr','cz','pt','sb'];
      const FIXED  = [[1,1],[1,6],[5,1],[5,3],[8,15],[11,1],[11,11],[12,25],[12,26]];
      const dayInfos = [];
      for (let d = 1; d <= ndays; d++) {
        const dt        = new Date(year, month-1, d);
        const jsDow     = dt.getDay();
        const kodDow    = DOW_PL[jsDow];
        const isWeekend = jsDow===0 || jsDow===6;
        const isHoliday = FIXED.some(h=>h[0]===month && h[1]===d);
        let status = isHoliday ? 'Ś' : (isWeekend ? '-' : 'P');
        if (overrideMap.has(d)) status = overrideMap.get(d);
        dayInfos.push({ day:d, kodDow, status });
      }

      // 2) load workdays (globalne)
      db.all(
        'SELECT emp_id, day, code FROM workdays WHERE year=? AND month=?',
        [year, month],
        (errW, wds) => {
          if (errW) return res.json({ dayInfos, summary: [] });

          // 3) load employees
          db.all('SELECT * FROM employees ORDER BY full_name', [], (errE, emps) => {
            if (errE) return res.json({ dayInfos, summary: [] });

            const codesList = ['w','l4','nd','bz','op','ok','sw'];
            const summary = emps.map(emp => {
              const codes = wds
                .filter(w=>w.emp_id===emp.id)
                .map(w=>w.code.toLowerCase());
              const hours = codes.reduce((s,c)=>s + (isNaN(+c)?0:+c), 0);
              const days  = codes.filter(c=>c!=='' && !isNaN(+c)).length;
              const counts = {};
              codesList.forEach(k=>counts[k]=codes.filter(c=>c===k).length);
              return { id:emp.id, days, hours, ...counts };
            });

            res.json({ dayInfos, summary });
          });
        }
      );
    }
  );
});

// GET / – główny widok
app.get('/', (req, res) => {
  const year        = parseInt(req.query.year, 10)  || new Date().getFullYear();
  const month       = parseInt(req.query.month, 10) || (new Date().getMonth()+1);
  const monthNames  = ['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
  const currentYear = new Date().getFullYear();

  // 1) wszyscy pracownicy
  db.all('SELECT * FROM employees ORDER BY full_name', [], (err, emps) => {
    if (err) return res.status(500).send(err.message);

    // 2) workdays dla miesiąca
    db.all(
      'SELECT emp_id, day, code FROM workdays WHERE year=? AND month=?',
      [year, month],
      (errW, wds) => {
        if (errW) return res.status(500).send(errW.message);

        // 3) teacher_presence (Ewidencja)
        db.all(
          'SELECT teacher_id AS emp_id, date AS day, code FROM teacher_presence WHERE year=? AND month=?',
          [year, month],
          (errP, teacherPresenceRecords) => {
            if (errP) teacherPresenceRecords = [];

            // 4) teacher_substitutions (Zastępstwa)
            db.all(
              'SELECT teacher_id AS emp_id, date AS day, code FROM teacher_substitutions WHERE year=? AND month=?',
              [year, month],
              (errS, teacherSubstitutionRecords) => {
                if (errS) teacherSubstitutionRecords = [];

                // 5) settings
                db.all('SELECT key,value FROM settings', [], (errS3, settingsRows) => {
                  if (errS3) return res.status(500).send(errS3.message);
                  const settings = Object.fromEntries(settingsRows.map(r=>[r.key,r.value]));

                  // 6) overrides i dayInfos
                  const DOW_PL = ['nd','pn','wt','śr','cz','pt','sb'];
                  const FIXED  = [[1,1],[1,6],[5,1],[5,3],[8,15],[11,1],[11,11],[12,25],[12,26]];
                  function loadOverride(dept, cb) {
                    db.all(
                      'SELECT day,code FROM calendar_overrides WHERE year=? AND month=? AND department=?',
                      [year, month, dept],
                      (e, rows) => cb(new Map((rows||[]).map(o=>[o.day,o.code])))
                    );
                  }
                  loadOverride('Obsługa', supMap => {
                    loadOverride('Nauczyciel', teaMap => {
                      const ndays = new Date(year, month, 0).getDate();
                      function makeInfos(map) {
                        return Array.from({length:ndays},(_,i)=>{
                          const d   = i+1;
                          const dt  = new Date(year,month-1,d);
                          const dow = dt.getDay();
                          let status = FIXED.some(h=>h[0]===month&&h[1]===d)
                                       ? 'Ś'
                                       : (dow===0||dow===6 ? '-' : 'P');
                          if (map.has(d)) status = map.get(d);
                          return { day:d, kodDow:DOW_PL[dow], status };
                        });
                      }
                      const dayInfosObs = makeInfos(supMap);
                      const dayInfosTea = makeInfos(teaMap);

                      // 7) summary dla workdays
                      const codesList = ['w','l4','nd','bz','op','ok','sw'];
                      const summary = emps.map(emp => {
                        const codes = wds.filter(w=>w.emp_id===emp.id).map(w=>w.code.toLowerCase());
                        const hours = codes.reduce((s,c)=>s + (isNaN(+c)?0:+c),0);
                        const days  = codes.filter(c=>c!==''&&!isNaN(+c)).length;
                        const counts = {}; codesList.forEach(k=>counts[k]=codes.filter(c=>c===k).length);
                        return { id:emp.id, days, hours, ...counts };
                      });

                      // 8) summary dla teacher_presence
                      const presSummary = emps.map(emp => {
                        const codes = teacherPresenceRecords
                          .filter(r=>r.emp_id===emp.id).map(r=>r.code.toLowerCase());
                        const hours = codes.reduce((s,c)=>s + (isNaN(+c)?0:+c),0);
                        const days  = codes.filter(c=>c!==''&&!isNaN(+c)).length;
                        const counts = {}; codesList.forEach(k=>counts[k]=codes.filter(c=>c===k).length);
                        return { id:emp.id, days, hours, ...counts };
                      });

                      // 9) summary dla teacher_substitutions
                      const substSummary = emps.map(emp => {
                        const codes = teacherSubstitutionRecords
                          .filter(r=>r.emp_id===emp.id).map(r=>r.code.toLowerCase());
                        const hours = codes.reduce((s,c)=>s + (isNaN(+c)?0:+c),0);
                        const days  = codes.filter(c=>c!==''&&!isNaN(+c)).length;
                        const counts = {}; codesList.forEach(k=>counts[k]=codes.filter(c=>c===k).length);
                        return { id:emp.id, days, hours, ...counts };
                      });

                      // 10) render
                      res.render('index', {
                        emps,
                        wds,
                        teacherPresenceRecords,
                        teacherSubstitutionRecords,
                        summary,
                        presSummary,
                        substSummary,
                        year,
                        month,
                        dayInfosObs,
                        dayInfosTea,
                        CODE_COLORS,
                        settings,
                        monthName:    monthNames[month-1],
                        currentYear,
                        monthNames
                      });
                    });
                  });
                });
              }
            );
          }
        );
      }
    );
  });
});


// AJAX: partial card dla pojedynczego pracownika
app.get('/card/:empId', (req, res) => {
  const empId = +req.params.empId;
  const year  = parseInt(req.query.year,  10) || new Date().getFullYear();
  const month = parseInt(req.query.month, 10) || (new Date().getMonth() + 1);

  db.get('SELECT * FROM employees WHERE id = ?', [empId], (err, emp) => {
    if (err || !emp) return res.status(404).send('Pracownik nie znaleziony');

    // pobieramy ustawienia
    db.all('SELECT key, value FROM settings', [], (err2, settingsRows) => {
      if (err2) return res.status(500).send(err2.message);
      const settings = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));

      // dni pracy pracownika
      db.all(
        'SELECT emp_id, day, code FROM workdays WHERE year=? AND month=?',
        [year, month],
        (err3, wds) => {
          if (err3) return res.status(500).send(err3.message);

          // nadpisania kalendarza
          db.all(
            'SELECT day, code FROM calendar_overrides WHERE year=? AND month=?',
            [year, month],
            (err4, ov) => {
              if (err4) return res.status(500).send(err4.message);

              // build dayInfos
              const overrideMap = new Map(ov.map(o => [o.day, o.code]));
              const ndays       = new Date(year, month, 0).getDate();
              const DOW_PL      = ['nd','pn','wt','śr','cz','pt','sb'];
              const FIXED       = [[1,1],[1,6],[5,1],[5,3],[8,15],[11,1],[11,11],[12,25],[12,26]];
              const dayInfos    = [];

              for (let d = 1; d <= ndays; d++) {
                const dt        = new Date(year, month - 1, d);
                const jsDow     = dt.getDay();
                const kodDow    = DOW_PL[jsDow];
                const isWeekend = jsDow === 0 || jsDow === 6;
                const isHoliday = FIXED.some(h => h[0] === month && h[1] === d);
                let status      = isHoliday ? 'Ś' : (isWeekend ? '-' : 'P');
                if (overrideMap.has(d)) status = overrideMap.get(d);
                dayInfos.push({ day: d, kodDow, status });
              }

              // filtrowanie wpisów dla tego pracownika
              const empWds = wds.filter(w => w.emp_id === emp.id);

              // sumy faktyczne
              let allTotalHours = 0, allTotalDays = 0;
              empWds.forEach(w => {
                const num = +w.code;
                if (!isNaN(num)) allTotalHours += num;
                allTotalDays++;
              });

              // pobranie notatki
              db.get(
                'SELECT note FROM notes WHERE emp_id=? AND year=? AND month=?',
                [emp.id, year, month],
                (errN, rowN) => {
                  if (errN) return res.status(500).send(errN.message);
                  const note = rowN ? rowN.note : '';

                  // nazwa miesiąca
                  const monthNames = [
                    'styczeń','luty','marzec','kwiecień','maj','czerwiec',
                    'lipiec','sierpień','wrzesień','październik','listopad','grudzień'
                  ];
                  const monthName = monthNames[month - 1];

                  // i render
                  res.render('card', {
                    emp, settings, year, monthName,
                    dayInfos, wds, empWds,
                    allTotalHours, allTotalDays,
                    CODE_COLORS, note
                  });
                }
              );
            }
          );
        }
      );
    });
  });
});


// POST /settings – zapis ustawień
app.post('/settings', (req, res) => {
  const entries = Object.entries(req.body);
  db.serialize(() => {
    const stmt = db.prepare('REPLACE INTO settings (key,value) VALUES(?,?)');
    entries.forEach(([k, v]) => stmt.run(k, v));
    stmt.finalize(() => res.redirect('/'));
  });
});

// POST /employees – dodaj pracownika
app.post('/employees', (req, res) => {
  const { full_name, position, daily_norm, payroll_number, department } = req.body;
  const daily = parseFloat(daily_norm) || 8;
  const fte   = daily / 8;
  db.run(
    `INSERT INTO employees(full_name,position,payroll_number,work_time_fte,daily_norm,notes,department)
      VALUES(?,?,?,?,?,?,?);`,
    [full_name, position, payroll_number, fte, daily, '', department],
    () => res.redirect(`/?year=${req.query.year||''}&month=${req.query.month||''}`)
  );
});

// POST /api/workday – zapis kodu pracownika
app.post('/api/workday', (req, res) => {
  const { emp_id, year, month, day, code } = req.body;
  const c = (code||'').trim().toLowerCase();
  if (c) {
    db.run(
      `INSERT INTO workdays(emp_id,year,month,day,code)
         VALUES(?,?,?,?,?)
       ON CONFLICT(emp_id,year,month,day) DO UPDATE SET code=excluded.code;`,
      [emp_id, year, month, day, c],
      err => res.json({ ok: !err })
    );
  } else {
    db.run(
      `DELETE FROM workdays WHERE emp_id=? AND year=? AND month=? AND day=?;`,
      [emp_id, year, month, day],
      err => res.json({ ok: !err })
    );
  }
});

// POST /api/calendar-overrides – ustawienie statusu dnia (z departamentem)
app.post('/api/calendar-overrides', (req, res) => {
  const { year, month, day, code, department } = req.body;
  db.run(
    `INSERT INTO calendar_overrides(year,month,day,department,code)
       VALUES(?,?,?,?,?)
     ON CONFLICT(year,month,day,department) DO UPDATE SET code=excluded.code;`,
    [year, month, day, department, code],
    err => res.json({ ok: !err })
  );
});

// DELETE /api/calendar-overrides – usuń nadpisanie dnia tylko dla działu
app.delete('/api/calendar-overrides', (req, res) => {
  const { year, month, day, department } = req.body;
  db.run(
    `DELETE FROM calendar_overrides
       WHERE year=? AND month=? AND day=? AND department=?;`,
    [year, month, day, department],
    err => res.json({ ok: !err })
  );
});


app.delete('/api/notes', (req, res) => {
  const { emp_id, year, month } = req.body;
  db.run(
    'DELETE FROM notes WHERE emp_id=? AND year=? AND month=?',
    [emp_id, year, month],
    err => res.json({ ok: !err })
  );
});


// PUT /api/employees/:id – edycja pracownika (partial update)
app.put('/api/employees/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM employees WHERE id = ?', [id], (err, existing) => {
    if (err || !existing) return res.json({ ok: false });
    const full_name      = req.body.full_name      ?? existing.full_name;
    const position       = req.body.position       ?? existing.position;
    const payroll_number = req.body.payroll_number ?? existing.payroll_number;
    const daily_norm     = req.body.daily_norm     !== undefined
                             ? parseFloat(req.body.daily_norm)
                             : existing.daily_norm;
    const department     = req.body.department     ?? existing.department;
    const fte            = daily_norm / 8;
    db.run(
      `UPDATE employees
         SET full_name=?, position=?, payroll_number=?, work_time_fte=?, daily_norm=?, department=?
       WHERE id=?;`,
      [full_name, position, payroll_number, fte, daily_norm, department, id],
      err2 => res.json({ ok: !err2 })
    );
  });
});

// DELETE /api/employees/:id – usuń pracownika
app.delete('/api/employees/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM employees WHERE id=?;', [id], err => res.json({ ok: !err }));
});

// POST /api/notes – zapis/aktualizacja uwagi
app.post('/api/notes', (req, res) => {
  const { emp_id, year, month, note } = req.body;
  db.run(
    `INSERT INTO notes(emp_id,year,month,note)
       VALUES(?,?,?,?)
     ON CONFLICT(emp_id,year,month) DO UPDATE SET note=excluded.note;`,
    [emp_id, year, month, note],
    err => res.json({ ok: !err })
  );
});

// Zestawienie kwartalne – tylko Obsługa
app.get('/kw', (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  db.serialize(() => {
    db.all(
      'SELECT id, full_name, department FROM employees ORDER BY full_name',
      [],
      (err1, emps) => {
        if (err1) return res.status(500).send(err1.message);
        // wybieramy tylko Obsługę
        const supportEmps = emps.filter(e => e.department === 'Obsługa');
        db.all(
          'SELECT emp_id, month, code FROM workdays WHERE year=?',
          [year],
          (err2, wds) => {
            if (err2) return res.status(500).send(err2.message);
            res.render('kwartalne', { year, emps: supportEmps, wds });
          }
        );
      }
    );
  });
});


// GET / – główny widok
app.get('/', (req, res) => {
  const year  = parseInt(req.query.year, 10) || new Date().getFullYear();
  const month = parseInt(req.query.month,10) || (new Date().getMonth()+1);

  // 1) pobierz pracowników
  db.all('SELECT * FROM employees ORDER BY full_name', [], (err, emps) => {
    if (err) return res.status(500).send(err.message);

    // 2) pobierz workdays (Nieobecności)
    db.all(
      'SELECT emp_id, day, code FROM workdays WHERE year=? AND month=?',
      [year, month],
      (err2, wds) => {
        if (err2) return res.status(500).send(err2.message);

        // 3) pobierz ustawienia
        db.all('SELECT key,value FROM settings', [], (err3, settingsRows) => {
          if (err3) return res.status(500).send(err3.message);
          const settings = Object.fromEntries(settingsRows.map(r=>[r.key,r.value]));

          // 4) pobierz nadpisania kalendarza dla Obsługi i Nauczycieli
          db.all(
            'SELECT day,code FROM calendar_overrides WHERE year=? AND month=? AND department=?',
            [year, month, 'Obsługa'],
            (errO1, ovSup) => {
              if (errO1) return res.status(500).send(errO1.message);
              const supMap = new Map(ovSup.map(o=>[o.day,o.code]));

              db.all(
                'SELECT day,code FROM calendar_overrides WHERE year=? AND month=? AND department=?',
                [year, month, 'Nauczyciel'],
                (errO2, ovTea) => {
                  if (errO2) return res.status(500).send(errO2.message);
                  const teaMap = new Map(ovTea.map(o=>[o.day,o.code]));

                  // 5) buduj dayInfos dla obu działów
                  const ndays = new Date(year,month,0).getDate();
                  const DOW_PL = ['nd','pn','wt','śr','cz','pt','sb'];
                  const FIXED = [[1,1],[1,6],[5,1],[5,3],[8,15],[11,1],[11,11],[12,25],[12,26]];
                  function makeInfos(map){
                    return Array.from({length:ndays},(_,i)=>{
                      const d = i+1;
                      const dt = new Date(year,month-1,d);
                      const dow = dt.getDay();
                      let status = FIXED.some(h=>h[0]===month&&h[1]===d)
                                    ? 'Ś'
                                    : (dow===0||dow===6?'-':'P');
                      if(map.has(d)) status = map.get(d);
                      return { day:d, kodDow:DOW_PL[dow], status };
                    });
                  }
                  const dayInfosObs = makeInfos(supMap);
                  const dayInfosTea = makeInfos(teaMap);

                  // 6) podsumowanie workdays (dla Nieobecności i Zastępstw)
                  const codesList = ['w','l4','nd','bz','op','ok','sw'];
                  const summary = emps.map(emp=>{
                    const codes = wds.filter(w=>w.emp_id===emp.id).map(w=>w.code.toLowerCase());
                    const hours = codes.reduce((s,c)=>s + (isNaN(+c)?0:+c),0);
                    const days  = codes.filter(c=>c!==''&&!isNaN(+c)).length;
                    const counts = {}; codesList.forEach(k=>counts[k]=codes.filter(c=>c===k).length);
                    return { id:emp.id, days, hours, ...counts };
                  });

                  // 7) pobierz ewidencję obecności nauczycieli
                  db.all(
                    'SELECT teacher_id AS emp_id, date, hours, code FROM teacher_presence WHERE year=? AND month=?',
                    [year, month],
                    (errTP, teacherPresenceRecords) => {
                      if(errTP) teacherPresenceRecords = [];

                      // 8) renderuj widok
                      res.render('index',{
                        emps,
                        wds,
                        year,
                        month,
                        dayInfosObs,
                        dayInfosTea,
                        summary,
                        CODE_COLORS,
                        settings,
                        monthName:    ['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'][month-1],
                        currentYear:  new Date().getFullYear(),
                        monthNames:   ['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'],
                        teacherPresenceRecords    // ← specjalnie dla Ewidencji
                      });
                    }
                  );
                }
              );
            }
          );
        });
      }
    );
  });
});

// GET /api/teacher-presence — pobranie ewidencji obecności
app.get('/api/teacher-presence', (req, res) => {
  const year  = parseInt(req.query.year,10);
  const month = parseInt(req.query.month,10);
  db.all(
    `SELECT p.teacher_id, t.full_name, p.date, p.hours, p.code
       FROM teacher_presence p
       JOIN employees t ON t.id = p.teacher_id
      WHERE p.year=? AND p.month=?
      ORDER BY t.full_name, p.date`,
    [year, month],
    (err, rows) => err ? res.json([]) : res.json(rows)
  );
});

// POST /api/teacher-presence — dodaj/edytuj wpis obecności
app.post('/api/teacher-presence', (req, res) => {
  const { teacher_id, year, month, date, hours, code } = req.body;
  db.run(
    `INSERT INTO teacher_presence(teacher_id,year,month,date,hours,code)
       VALUES(?,?,?,?,?,?)
     ON CONFLICT(teacher_id,year,month,date)
       DO UPDATE SET hours=excluded.hours, code=excluded.code;`,
    [teacher_id, year, month, date, hours, code],
    err => res.json({ ok: !err })
  );
});

// DELETE /api/teacher-presence — usuń wpis obecności
app.delete('/api/teacher-presence', (req, res) => {
  const { teacher_id, year, month, date } = req.body;
  db.run(
    `DELETE FROM teacher_presence
       WHERE teacher_id=? AND year=? AND month=? AND date=?;`,
    [teacher_id, year, month, date],
    err => res.json({ ok: !err })
  );
});




app.listen(process.env.PORT || 3000, () => console.log('Server listening on port 3000'));

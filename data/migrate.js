/*
 * Миграции на базата.
 *
 * db.json се вчитува како што е и НИКОГАШ не се презапишува од seed — затоа новите
 * параметри и поправките на формулите мора да стигнат до постоечка база преку миграција.
 *
 * Правила:
 *  · Секоја миграција е идемпотентна и се извршува најмногу еднаш (db.schemaVersion).
 *  · Рачните измени на админот се посветени: формула се менува САМО ако сè уште ја има
 *    точната стара вредност. Ако админот веќе ја допрел ставката, се прескокнува.
 *  · Секоја промена се пријавува во конзола за да се види што се случило при подигање.
 */

const SCHEMA_VERSION = 5;

// [код, стара фиксна количина, нова формула]
const REWIRE_QTY = [
  ['V03', 3, 'WC_SANITARY * (1 - BEZ_GALANT)'],
  ['V04', 3, 'WC_SANITARY * (1 - BEZ_GALANT)'],
  ['V05', 3, 'WC_SANITARY * (1 - BEZ_GALANT)'],
  ['V06', 3, 'WC_SANITARY * (1 - BEZ_GALANT)'],
  ['V07', 18, 'WC_SANITARY * 6 * (1 - BEZ_GALANT)'],
  ['V08', 18, 'WC_SANITARY * 6 * (1 - BEZ_GALANT)'],
  ['PD02', 90, 'OSB_POD'],
  ['PD16', 18, 'GARAZA_PLOCHKI'],
  ['L08', 0, 'KRAN'],
  ['L10', 1, 'SKELE'],
  ['X01', 1, 'METALNA'],
  ['X02', 0, 'SKALI_M'],
  ['F18', 0, 'PREMIUM_FAS_M2'],
];

// [код, стара формула, нова формула] — галантерија во електриката
const REWIRE_FORMULA = [
  ['E33', 'qty("E24")', 'qty("E24") * (1 - EL_BEZ_GALANT)'],
  ['E34', 'qty("E25")', 'qty("E25") * (1 - EL_BEZ_GALANT)'],
  ['E35', 'qty("E26")', 'qty("E26") * (1 - EL_BEZ_GALANT)'],
  ['E36', 'qty("E27")', 'qty("E27") * (1 - EL_BEZ_GALANT)'],
  ['E37', '(AREA/25)*ELEKTRIKA', '(AREA/25)*ELEKTRIKA * (1 - EL_BEZ_GALANT)'],
  ['E38', 'SHUKO - qty("E37")', '(SHUKO - qty("E37")) * (1 - EL_BEZ_GALANT)'],
  ['E39', 'qty("E43")', 'qty("E43") * (1 - EL_BEZ_GALANT)'],
  ['E40', 'qty("E58")+qty("E57")', '(qty("E58")+qty("E57")) * (1 - EL_BEZ_GALANT)'],
  ['E41', '(AREA/30)*ELEKTRIKA', '(AREA/30)*ELEKTRIKA * (1 - EL_BEZ_GALANT)'],
  ['E42', '(AREA/5)*ELEKTRIKA', '(AREA/5)*ELEKTRIKA * (1 - EL_BEZ_GALANT)'],
  ['E44', 'qty("E23")/250', 'qty("E23")/250 * (1 - EL_BEZ_GALANT)'],
];

// [код, нова priceFormula] — се додава само ако ставката сè уште нема своја
const ADD_PRICE_FORMULA = [
  ['X01', 'METALNA_CENA'],
  ['X02', 'SKALI_CENA'],
  ['R03', 'PRICE * BOJA_LIM'],
  ['R04', 'PRICE * BOJA_LIM'],
  ['D01', 'PRICE * BOJA_VRATI'],
  ['D02', 'PRICE * BOJA_VRATI'],
];

// [код, прифатливи стари формули, нова формула] — ѕидови и висина по кат (куќа на два ката).
// За еднокатна куќа (WALL_OUT2 = WALL_IN2 = FLOOR_H2 = 0) новите формули даваат исти бројки.
const TWO_FLOOR_FORMULA = [
  ['K06', ['WALL_OUT + WALL_IN'], 'WALL_OUT + WALL_IN + WALL_OUT2 + WALL_IN2'],
  ['S01', ['(((WALL_OUT+WALL_IN)*FLOOR_H)+ROOF)*SIP'], '(WALL_OUT_M2+WALL_IN_M2+ROOF)*SIP'],
  ['Z01', ['((WALL_OUT*FLOOR_H)+ROOF+30)*KAMENA'], '(WALL_OUT_M2+ROOF+30)*KAMENA'],
  ['Z02', ['((WALL_OUT*FLOOR_H)+ROOF+30)*KAMENA'], '(WALL_OUT_M2+ROOF+30)*KAMENA'],
  ['F07', ['((FLOOR_H*WALL_OUT)+5)*ABRIB'], '(WALL_OUT_M2+5)*ABRIB'],
  ['F08', ['((FLOOR_H*WALL_OUT)+20)*ABRIB'], '(WALL_OUT_M2+20)*ABRIB'],
  ['I01', ['(((WALL_OUT+WALL_IN)*FLOOR_H)+ROOF)*KAMENA'], '(WALL_OUT_M2+WALL_IN_M2+ROOF)*KAMENA'],
  ['G01', ['(((WALL_OUT+(WALL_IN*2))*FLOOR_H)+AREA_HOUSE)*GIPS'], '(WALL_OUT_M2+(WALL_IN_M2*2)+AREA_HOUSE)*GIPS'],
  ['R06', ['(FLOOR_H*9)*ROOF_LIM'], '(HEIGHT*9)*ROOF_LIM'],
  ['L10', ['((WALL_OUT*FLOOR_H))', 'WALL_OUT*FLOOR_H'], 'WALL_OUT_M2'],
];

// Нови параметри од seed што ги нема во базата (по редослед од seed)
function addMissingInputs(db, seed, log) {
  const have = new Set(db.inputs.map((i) => i.key));
  for (const inp of seed.inputs) {
    if (have.has(inp.key)) continue;
    db.inputs.push(JSON.parse(JSON.stringify(inp)));
    log('нов параметар: ' + inp.key);
  }
}

const MIGRATIONS = [
  /* 0 → 1: фиксните количини стануваат параметри на калкулаторот. */
  function paramitizeFixedQuantities(db, seed, log) {
    const byCode = {};
    for (const mat of db.materials) byCode[mat.code] = mat;

    for (const g of seed.inputGroups) {
      if (!db.inputGroups.includes(g)) { db.inputGroups.push(g); log('нова група: ' + g); }
    }

    const have = new Set(db.inputs.map((i) => i.key));
    for (const inp of seed.inputs) {
      if (have.has(inp.key)) continue;
      db.inputs.push(JSON.parse(JSON.stringify(inp)));
      log('нов параметар: ' + inp.key);
    }

    // Метаподатоци врз веќе постоечките параметри (ексклузивност, услов, улога).
    for (const inp of seed.inputs) {
      const cur = db.inputs.find((i) => i.key === inp.key);
      if (!cur) continue;
      for (const k of ['exclusive', 'gate', 'role', 'target']) {
        if (inp[k] != null && cur[k] == null) { cur[k] = inp[k]; log(inp.key + ' → ' + k + '=' + inp[k]); }
      }
    }

    for (const [code, oldQty, formula] of REWIRE_QTY) {
      const mat = byCode[code];
      if (!mat) continue;
      if (mat.formula != null || Number(mat.defQty || 0) !== oldQty) {
        log('ПРЕСКОКНАТО ' + code + ' — рачно изменето, провери го сам');
        continue;
      }
      delete mat.defQty;
      mat.formula = formula;
      log(code + ' фикс. ' + oldQty + ' → ' + formula);
    }

    for (const [code, oldF, newF] of REWIRE_FORMULA) {
      const mat = byCode[code];
      if (!mat) continue;
      if (mat.formula !== oldF) { log('ПРЕСКОКНАТО ' + code + ' — рачно изменето, провери го сам'); continue; }
      mat.formula = newF;
      log(code + ' → ' + newF);
    }

    for (const [code, pf] of ADD_PRICE_FORMULA) {
      const mat = byCode[code];
      if (!mat || mat.priceFormula) continue;
      mat.priceFormula = pf;
      log(code + ' цена → ' + pf);
    }
  },

  /* 1 → 2: куќа на два ката — параметри по кат и формули за ѕидови по површина. */
  function twoFloors(db, seed, log) {
    addMissingInputs(db, seed, log);
    for (const [code, olds, newF] of TWO_FLOOR_FORMULA) {
      const mat = db.materials.find((m) => m.code === code);
      if (!mat) continue;
      const cur = String(mat.formula || '').replace(/\s+/g, '');
      if (!olds.some((o) => o.replace(/\s+/g, '') === cur)) {
        log('ПРЕСКОКНАТО ' + code + ' — рачно изменето (' + mat.formula + '), провери го сам за два ката');
        continue;
      }
      mat.formula = newF;
      log(code + ' → ' + newF);
    }
  },

  /* 2 → 3: прекинувач „Фасада патос / дрво" — патосот и окапниците важат само кога е вклучен. */
  function facadeWood(db, seed, log) {
    if (!db.inputs.some((i) => i.key === 'FAS_DRVO')) {
      const def = JSON.parse(JSON.stringify(seed.inputs.find((i) => i.key === 'FAS_DRVO')));
      const at = db.inputs.findIndex((i) => i.key === 'FAS_PATOS');
      db.inputs.splice(at >= 0 ? at : db.inputs.length, 0, def);
      log('нов параметар: FAS_DRVO');
    }
    for (const key of ['FAS_PATOS', 'OKAPNICI']) {
      const cur = db.inputs.find((i) => i.key === key);
      if (!cur || cur.gate) continue;
      cur.gate = 'FAS_DRVO';
      cur.reveal = true;
      log(key + ' → gate=FAS_DRVO');
    }
    // Зачувани понуди со патос → прекинувачот вклучен, за да не се изгуби патосот
    for (const q of db.quotes || []) {
      const i = q.inputs || {};
      if (i.FAS_DRVO == null && (i.FAS_PATOS > 0 || i.OKAPNICI > 0)) { i.FAS_DRVO = 1; log('понуда ' + q.id + ' → FAS_DRVO=1'); }
    }
  },

  /* 3 → 4: фасадниот лим (и ленти) исто така спаѓа под „Фасада патос / дрво". */
  function facadeSheetUnderWood(db, seed, log) {
    // Прекинувачот оди пред лимот, за полињата да стојат под него
    const at = db.inputs.findIndex((i) => i.key === 'FAS_DRVO');
    const lim = db.inputs.findIndex((i) => i.key === 'FAS_LIM');
    if (at > lim && lim >= 0) {
      db.inputs.splice(lim, 0, db.inputs.splice(at, 1)[0]);
      log('FAS_DRVO преместен пред FAS_LIM');
    }
    for (const key of ['FAS_LIM', 'FAS_LIM_LENTI']) {
      const cur = db.inputs.find((i) => i.key === key);
      if (!cur || cur.gate) continue;
      cur.gate = 'FAS_DRVO';
      cur.reveal = true;
      log(key + ' → gate=FAS_DRVO');
    }
    for (const q of db.quotes || []) {
      const i = q.inputs || {};
      if (!i.FAS_DRVO && (i.FAS_LIM > 0 || i.FAS_LIM_LENTI > 0)) { i.FAS_DRVO = 1; log('понуда ' + q.id + ' → FAS_DRVO=1'); }
    }
  },

  /* 4 → 5: посебна група WC меѓу ВНАТРЕШНОСТ и ЕЛЕКТРИКА. */
  function wcGroup(db, seed, log) {
    // Ако групата веќе постои (рачно додадена), само се преместува на вистинското место
    const groups = db.inputGroups.filter((g) => g !== 'WC');
    const after = groups.indexOf('ВНАТРЕШНОСТ');
    groups.splice(after >= 0 ? after + 1 : groups.length, 0, 'WC');
    db.inputGroups = groups;
    log('група WC по ВНАТРЕШНОСТ');
    for (const key of ['WC', 'WC_PERIM', 'WC_SANITARY', 'BEZ_GALANT']) {
      const cur = db.inputs.find((i) => i.key === key);
      if (!cur || cur.group !== 'ВНАТРЕШНОСТ') continue;
      cur.group = 'WC';
      log(key + ' → WC');
    }
  },
];

/* Извршува ги сите неизвршени миграции. Враќа true ако базата е променета. */
function migrate(db, seed) {
  const from = Number(db.schemaVersion) || 0;
  if (from >= SCHEMA_VERSION) return false;

  for (let v = from; v < SCHEMA_VERSION; v++) {
    const lines = [];
    MIGRATIONS[v](db, seed, (m) => lines.push(m));
    console.log(`↻ Миграција ${v} → ${v + 1} (${lines.length} промени)`);
    lines.forEach((l) => console.log('   · ' + l));
  }
  db.schemaVersion = SCHEMA_VERSION;
  return true;
}

module.exports = { migrate, SCHEMA_VERSION };

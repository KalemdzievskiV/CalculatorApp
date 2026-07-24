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

const SCHEMA_VERSION = 1;

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

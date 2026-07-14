// Почетна база на податоци — извлечена од PRESMETKA 26.03.2026.xlsx (лист CALCULATOR).
// Цените се во МКД со вклучен ДДВ. Формулите за количина ги користат влезните
// параметри (клучеви од `inputs`) и qty("КОД") / total("КОД") за други ставки.

const settings = {
  companyName: 'MODULAR DESIGN ARCHITECTS',
  vatPct: 18,          // ДДВ %
  eurRate: 62,         // курс МКД за 1 ЕУР
  adminPassword: 'admin123',
  phone: '071 336 108',
};

const inputGroups = ['ОСНОВНИ МЕРКИ', 'КОНСТРУКЦИЈА И СИСТЕМ', 'ФАСАДА', 'ВНАТРЕШНОСТ', 'ЕЛЕКТРИКА', 'КРОВ', 'ВРАТИ'];

const inputs = [
  { key: 'AREA_HOUSE',    label: 'Површина на куќа', unit: 'm²', type: 'number', def: 166,   group: 'ОСНОВНИ МЕРКИ' },
  { key: 'AREA_TERRACE',  label: 'Површина на тераса', unit: 'm²', type: 'number', def: 12.41, group: 'ОСНОВНИ МЕРКИ' },
  { key: 'FLOOR_H',       label: 'Висина на кат', unit: 'm', type: 'number', def: 2.85,  group: 'ОСНОВНИ МЕРКИ' },
  { key: 'WALL_OUT',      label: 'Надворешни ѕидови должина', unit: 'm', type: 'number', def: 75, group: 'ОСНОВНИ МЕРКИ' },
  { key: 'WALL_IN',       label: 'Внатрешни ѕидови должина', unit: 'm', type: 'number', def: 59, group: 'ОСНОВНИ МЕРКИ' },
  { key: 'ROOF',          label: 'Плоштина на кров', unit: 'm²', type: 'number', def: 152, group: 'ОСНОВНИ МЕРКИ' },
  { key: 'SIMS',          label: 'Симс околу објект', unit: 'm²', type: 'number', def: 11, group: 'ОСНОВНИ МЕРКИ' },
  { key: 'AREA',          label: 'Вкупна површина', unit: 'm²', type: 'derived', formula: 'AREA_HOUSE + AREA_TERRACE', group: 'ОСНОВНИ МЕРКИ' },

  { key: 'KAMENA',        label: 'Камена волна конструкција', type: 'boolean', def: 1, group: 'КОНСТРУКЦИЈА И СИСТЕМ' },
  { key: 'SIP',           label: 'СИП панел конструкција', type: 'boolean', def: 0, group: 'КОНСТРУКЦИЈА И СИСТЕМ' },
  { key: 'MONTAZA',       label: 'МДА монтажа', type: 'boolean', def: 1, group: 'КОНСТРУКЦИЈА И СИСТЕМ' },
  { key: 'KOSHULKA',      label: 'Кошулка', type: 'boolean', def: 0, group: 'КОНСТРУКЦИЈА И СИСТЕМ' },

  { key: 'ABRIB',         label: 'Фасада абриб', type: 'boolean', def: 1, group: 'ФАСАДА' },
  { key: 'FAS_LIM',       label: 'Фасаден лим', unit: 'm²', type: 'number', def: 0, group: 'ФАСАДА' },
  { key: 'FAS_LIM_LENTI', label: 'Фасаден лим ленти', unit: 'm¹', type: 'number', def: 0, group: 'ФАСАДА' },
  { key: 'FAS_PATOS',     label: 'Фасада патос', unit: 'm²', type: 'number', def: 0, group: 'ФАСАДА' },
  { key: 'OKAPNICI',      label: 'Фасада патос ленти окапници', unit: 'm¹', type: 'number', def: 0, group: 'ФАСАДА' },

  { key: 'GIPS',          label: 'Гипс картон внатре', type: 'boolean', def: 1, group: 'ВНАТРЕШНОСТ' },
  { key: 'CEILING',       label: 'Спуштен плафон', type: 'boolean', def: 1, group: 'ВНАТРЕШНОСТ' },
  { key: 'WC',            label: 'Број на WC', unit: 'ком', type: 'number', def: 4, group: 'ВНАТРЕШНОСТ' },
  { key: 'WC_PERIM',      label: 'Периметар WC', unit: 'm', type: 'number', def: 29, group: 'ВНАТРЕШНОСТ' },
  { key: 'LAMINAT',       label: 'Под ламинат', type: 'boolean', def: 1, group: 'ВНАТРЕШНОСТ' },
  { key: 'PLOCHKI',       label: 'Под плочки (внатре)', type: 'boolean', def: 0, group: 'ВНАТРЕШНОСТ' },
  { key: 'TILE_EXTRA',    label: 'Додаток плочки надвор', unit: 'm²', type: 'number', def: 0, group: 'ВНАТРЕШНОСТ' },

  { key: 'ELEKTRIKA',     label: 'Електрика', type: 'boolean', def: 0, group: 'ЕЛЕКТРИКА' },
  { key: 'SHUKO',         label: 'Шуко приклучоци', unit: 'ком', type: 'number', def: 0, group: 'ЕЛЕКТРИКА' },
  { key: 'SVETLA',        label: 'Светла', unit: 'ком', type: 'number', def: 0, group: 'ЕЛЕКТРИКА' },
  { key: 'ORMAR',         label: 'Приклучен ормар', unit: 'ком', type: 'number', def: 0, group: 'ЕЛЕКТРИКА' },

  { key: 'ROOF_LIM',      label: 'Кров лим', type: 'boolean', def: 1, group: 'КРОВ' },
  { key: 'ROOF_PUR',      label: 'Кров ПУР панел', type: 'boolean', def: 0, group: 'КРОВ' },

  { key: 'DOORS_IN',      label: 'Внатрешни врати', unit: 'ком', type: 'number', def: 8, group: 'ВРАТИ' },
  { key: 'DOORS_BLIND',   label: 'Блиндор врата', unit: 'ком', type: 'number', def: 0, group: 'ВРАТИ' },
];

const categories = [
  { id: 'KONSTRUKCIJA',  name: 'КОНСТРУКЦИЈА' },
  { id: 'SIP_PANEL',     name: 'СИП ПАНЕЛ' },
  { id: 'ZASHTITA',      name: 'ХИДРО И ПАРНА ЗАШТИТА' },
  { id: 'PUR_PANEL',     name: 'ПУР ПАНЕЛ' },
  { id: 'FASADA',        name: 'ФАСАДИРАЊЕ' },
  { id: 'IZOLACIJA',     name: 'ИЗОЛАЦИЈА' },
  { id: 'SHTRAFOVI',     name: 'ШТРАФОВСКА РОБА' },
  { id: 'GIPS_KARTON',   name: 'ГИПС КАРТОН И БОЈАДИСУВАЊЕ' },
  { id: 'VODOVOD',       name: 'ВОДОВОДНА ИНСТАЛАЦИЈА' },
  { id: 'ELEKTRIKA',     name: 'ЕЛЕКТРИЧНА ИНСТАЛАЦИЈА' },
  { id: 'PODOVI',        name: 'ПОДОПОЛАГАЊЕ И КЕРАМИКА' },
  { id: 'DOGRAMA',       name: 'ПВЦ ДОГРАМА И ВРАТИ' },
  { id: 'POKRIVANJE',    name: 'КРОВОПОКРИВАЊЕ' },
  { id: 'RABOTNA',       name: 'ИЗРАБОТКА И МОНТАЖА' },
  { id: 'DOPOLNITELNI',  name: 'ДОПОЛНИТЕЛНИ ЕЛЕМЕНТИ' },
];

// m(код, категорија, име, ед.мера, цена МКД со ДДВ, формула-за-количина | фиксна количина, опции)
function m(code, cat, name, unit, price, formula, extra) {
  const it = { code, cat, name, unit, price, active: true, grey: 0 };
  if (typeof formula === 'number') it.defQty = formula;
  else it.formula = formula;
  return Object.assign(it, extra || {});
}

const materials = [
  // ─── КОНСТРУКЦИЈА ───
  m('K01', 'KONSTRUKCIJA', 'КОНСТРУКЦИЈА 2Х10', 'м3', 24525, '(AREA/120)*KAMENA', { grey: 1 }),
  m('K02', 'KONSTRUKCIJA', 'КОНСТРУКЦИЈА 5Х5', 'м3', 24525, '(AREA/120)*KAMENA', { grey: 1 }),
  m('K03', 'KONSTRUKCIJA', 'КОНСТРУКЦИЈА 5Х10', 'м3', 24525, '(AREA/120)*KAMENA', { grey: 1 }),
  m('K04', 'KONSTRUKCIJA', 'КОНСТРУКЦИЈА 5Х15', 'м3', 24525, '(AREA/10)*KAMENA', { grey: 1 }),
  m('K05', 'KONSTRUKCIJA', 'КОНСТРУКЦИЈА 5Х20', 'м3', 24525, '(AREA/24)*KAMENA', { grey: 1 }),
  m('K06', 'KONSTRUKCIJA', 'ТЕР ХАРТИЈА ПОД', 'м1', 250, 'WALL_OUT + WALL_IN', { grey: 1 }),
  m('K07', 'KONSTRUKCIJA', 'РАБОТНА ДРВО', 'кол', 12262.5, 'qty("K01")+qty("K02")+qty("K03")+qty("K04")+qty("K05")', { grey: 1 }),

  // ─── СИП ПАНЕЛ ───
  m('S01', 'SIP_PANEL', 'СИП ПАНЕЛ 12cm', 'м2', 1565, '(((WALL_OUT+WALL_IN)*FLOOR_H)+ROOF)*SIP'),
  m('S02', 'SIP_PANEL', 'КОНСТРУКЦИЈА 10Х10', 'м3', 23560, 'qty("S01")/40'),
  m('S03', 'SIP_PANEL', 'КНАУФ ШТРАФ СИП ПАНЕЛ', 'кол', 2, 'qty("S01")*20'),
  m('S04', 'SIP_PANEL', 'РАБОТНА СИП', 'м2', 390, 'qty("S01")'),

  // ─── ЗАШТИТА ───
  m('Z01', 'ZASHTITA', 'ПАРНА БРАНА', 'м2', 60, '((WALL_OUT*FLOOR_H)+ROOF+30)*KAMENA'),
  m('Z02', 'ZASHTITA', 'ПАРОПРОПУСТНА ФОЛИЈА', 'м2', 60, '((WALL_OUT*FLOOR_H)+ROOF+30)*KAMENA', { grey: 1 }),
  m('Z03', 'ZASHTITA', 'ХЕФТ МУНИЦИЈА 8016', 'кол', 300, 'qty("Z01")/50', { grey: 1 }),
  m('Z04', 'ZASHTITA', 'РАБОТНА ФОЛИЈА', 'пауш', 60, 'qty("Z01")+qty("Z02")', { grey: 0.5 }),

  // ─── ПУР ПАНЕЛ (ѕидови) ───
  m('P01', 'PUR_PANEL', 'PUR PANEL 10см', 'м2', 2000, 0),
  m('P02', 'PUR_PANEL', 'КОНСТРУКЦИЈА PUR PANEL', 'м2', 800, 0),
  m('P03', 'PUR_PANEL', 'ШТРАФОВИ PUR ПАНЕЛ', 'кол', 2, 0),
  m('P04', 'PUR_PANEL', 'РАБОТНА PUR', 'кол', 950, 'qty("P01")'),

  // ─── ФАСАДИРАЊЕ ───
  m('F01', 'FASADA', 'ФАСАДЕН ЛИМ', 'м2', 1200, 'FAS_LIM'),
  m('F02', 'FASADA', 'ФАСАДЕН ЛИМ ЛЕНТИ', 'м1', 700, 'FAS_LIM_LENTI'),
  m('F03', 'FASADA', 'ФАСАДЕН ПАТОС 16mm', 'м2', 1500, 'FAS_PATOS'),
  m('F04', 'FASADA', 'БОЈА СМОЛА', 'л', 680, 'qty("F03")/2.5'),
  m('F05', 'FASADA', 'КЛАМФИ ЗА ПАТОС 9040', 'кол', 400, 'qty("F03")/10'),
  m('F06', 'FASADA', 'ЛАЈСНИ ОД ДРВО', 'м1', 500, 'OKAPNICI'),
  m('F07', 'FASADA', 'СТИРОПОР 5СМ', 'м2', 170, '((FLOOR_H*WALL_OUT)+5)*ABRIB', { grey: 1 }),
  m('F08', 'FASADA', 'ОСБ 9мм', 'м2', 260, '((FLOOR_H*WALL_OUT)+20)*ABRIB', { grey: 2 }),
  m('F09', 'FASADA', 'ШТРАФОВИ 3Х7 КНАУФ', 'кол', 2, 'qty("F07")*10', { grey: 1 }),
  m('F10', 'FASADA', 'КАПИ ЗА СТИРОПОР', 'кол', 2, 'qty("F09")', { grey: 1 }),
  m('F11', 'FASADA', 'ПУР ЛЕПИЛО', 'кол', 370, 'qty("F07")/8', { grey: 1 }),
  m('F12', 'FASADA', 'РАБОТНА СТИРОПОР', 'м2', 365, 'qty("F07")', { grey: 1 }),
  m('F13', 'FASADA', 'АБРИБ ФАСАДА', 'м2', 0, 'qty("F07")', { grey: 1 }),
  m('F14', 'FASADA', 'МРЕЖА ЛЕПАК ФАСАДА', 'м2', 380, 'qty("F13")', { grey: 1 }),
  m('F15', 'FASADA', 'МИНЕРАЛ АБРИБ ФАСАДА', 'м2', 380, 'qty("F13")', { grey: 1 }),
  m('F16', 'FASADA', 'РАБОТНА АБРИБ ФАСАДА', 'м2', 730, 'qty("F13")', { grey: 1 }),
  m('F17', 'FASADA', 'РАБОТНА РАКА ПАТОС', 'м2', 950, 'FAS_PATOS'),
  m('F18', 'FASADA', 'ПРЕМИУМ ФАСАДА', 'м2', 3238, 0),

  // ─── ИЗОЛАЦИЈА ───
  m('I01', 'IZOLACIJA', 'ТЕРВОЛ 5СМ', 'м2', 75, '(((WALL_OUT+WALL_IN)*FLOOR_H)+ROOF)*KAMENA'),
  m('I02', 'IZOLACIJA', 'ТЕРВОЛ 10СМ', 'м2', 150, 'qty("I01")', { grey: 1 }),
  m('I03', 'IZOLACIJA', 'СТАКЛЕНА ВОЛНА СО А.5СМ', 'м2', 180, 0),
  m('I04', 'IZOLACIJA', 'ТЕРВОЛ 30КГ 5СМ', 'м2', 160, 0),
  m('I05', 'IZOLACIJA', 'ТЕРВОЛ 30КГ 10СМ', 'м2', 320, 0),
  m('I06', 'IZOLACIJA', 'КОНЕЦ ЗАТЕГНУВАЊЕ', 'м2', 20, 'qty("I01")', { grey: 1 }),
  m('I07', 'IZOLACIJA', 'РАБОТНА ТЕРВОЛ', 'пауш', 75, 'qty("I01")+qty("I02")+qty("I03")+qty("I04")+qty("I05")', { grey: 1 }),

  // ─── ШТРАФОВСКА РОБА ───
  m('SR01', 'SHTRAFOVI', 'ШТРАФОВИ 6Х6 - 1000ком', 'пак', 2800, '(AREA/25)*KAMENA', { grey: 1 }),
  m('SR02', 'SHTRAFOVI', 'ШТРАФОВИ 6Х8 - 250 ком', 'пак', 3000, '(AREA/30)*KAMENA', { grey: 1 }),
  m('SR03', 'SHTRAFOVI', 'ШТРАФОВИ 6Х10 - 1000 ком', 'пак', 3200, '(AREA/30)*KAMENA', { grey: 1 }),
  m('SR04', 'SHTRAFOVI', 'ШТРАФОВИ 6Х12 - 1000 ком', 'пак', 3500, '(AREA/50)*KAMENA', { grey: 1 }),
  m('SR05', 'SHTRAFOVI', 'ШТРАФОВИ 6Х15 - 1000 ком', 'пак', 3800, '(AREA/80)*KAMENA', { grey: 1 }),
  m('SR06', 'SHTRAFOVI', 'ТОРНАДО 6Х10 - 1000 ком', 'пак', 8500, '(AREA/200)*KAMENA', { grey: 1 }),
  m('SR07', 'SHTRAFOVI', 'ТОРНАДО 6Х15 - 1000 ком', 'пак', 9500, '(AREA/200)*KAMENA', { grey: 1 }),
  m('SR08', 'SHTRAFOVI', 'ТОРНАДО 6Х20 - 1000 ком', 'пак', 12000, 0),
  m('SR09', 'SHTRAFOVI', 'КНАУФ ШТРАФ СИП ПАНЕЛ', 'пар', 2, 0),
  m('SR10', 'SHTRAFOVI', 'КОЈЛИРАНИ ШАЈКИ', 'кг', 95, '(AREA/8)*KAMENA', { grey: 1 }),
  m('SR11', 'SHTRAFOVI', 'АНКЕР ШТРАФОВИ парче', 'пар', 34, '(AREA/2)*KAMENA', { grey: 1 }),

  // ─── ГИПС КАРТОН ───
  m('G01', 'GIPS_KARTON', 'ГИПС КАРТОН 1.25', 'м2', 138, '(((WALL_OUT+(WALL_IN*2))*FLOOR_H)+AREA_HOUSE)*GIPS'),
  m('G02', 'GIPS_KARTON', 'ЗЕЛЕН ГИПС КАРТОН 1.25', 'м2', 195, 'qty("G01")/10'),
  m('G03', 'GIPS_KARTON', 'ШТРАФОВИ КНАУФ 3.5', 'пар', 2, '(qty("G01")+qty("G02"))*10'),
  m('G04', 'GIPS_KARTON', 'РАДИКОЛ 30кг', 'пак', 900, '(qty("G01")+qty("G02"))/50'),
  m('G05', 'GIPS_KARTON', 'ГЛЕТ МАСА 25кг', 'пак', 450, '(qty("G01")+qty("G02"))/80'),
  m('G06', 'GIPS_KARTON', 'БАНДАЖ ТРАКА', 'м1', 5, 'AREA_HOUSE*4'),
  m('G07', 'GIPS_KARTON', 'ЛАЈСНИ АЛУ. СО РАБОТНА', 'пар', 300, '(qty("G01")+qty("G02"))/10'),
  m('G08', 'GIPS_KARTON', 'ДИСПЕРЗИРАНА БОЈА', 'пар', 1100, '(qty("G01")+qty("G02"))/75'),
  m('G09', 'GIPS_KARTON', 'РАБОТНА ГИПС КАРТОН', 'м2', 125, 'qty("G01")+qty("G02")'),
  m('G10', 'GIPS_KARTON', 'РАБОТНА БАНДАЖИРАЊЕ', 'м1', 90, 'qty("G06")'),
  m('G11', 'GIPS_KARTON', 'РАБОТНА ГЛЕТУВАЊЕ', 'м2', 120, 'qty("G01")+qty("G02")'),
  m('G12', 'GIPS_KARTON', 'РАБОТНА ФАРБАЊЕ', 'м2', 120, 'qty("G01")+qty("G02")'),
  m('G13', 'GIPS_KARTON', 'ПОДКОНСТРУКЦИЈА ГИПС', 'м2', 1200, 'AREA*CEILING'),

  // ─── ВОДОВОД ───
  m('V01', 'VODOVOD', 'ВОДОВОДНИ ЦЕВКИ', 'кол', 20000, 'WC'),
  m('V02', 'VODOVOD', 'РАБОТНА ВОДОВОД', 'кол', 21250, 'WC'),
  m('V03', 'VODOVOD', 'МОНОБЛОК ШКОЛКА', 'кол', 7500, 3),
  m('V04', 'VODOVOD', 'МИЈАЛНИК', 'кол', 3500, 3),
  m('V05', 'VODOVOD', 'ЧЕШМА МИЈАЛНИК', 'кол', 3500, 3),
  m('V06', 'VODOVOD', 'ЧЕШМА ТУШ', 'кол', 3500, 3),
  m('V07', 'VODOVOD', 'ЕК ВЕНТИЛ', 'кол', 250, 18),
  m('V08', 'VODOVOD', 'ПАНЦИР ЦРЕВА', 'кол', 250, 18),

  // ─── ЕЛЕКТРИКА (материјали) ───
  m('E01', 'ELEKTRIKA', 'РАЗВОДНА ТАБЛА 18', 'кол', 1808, '(AREA/100)*ELEKTRIKA'),
  m('E02', 'ELEKTRIKA', 'РАЗВОДНА ТАБЛА 24', 'кол', 3083, 0),
  m('E03', 'ELEKTRIKA', 'РАЗВОДНА ТАБЛА 36', 'кол', 4500, 0),
  m('E04', 'ELEKTRIKA', 'ПРОВОДНИК П6 ЖОЛТ', 'кол', 42, '(AREA/100)*ELEKTRIKA'),
  m('E05', 'ELEKTRIKA', 'ПРИКЛУЧЕН ОРМАР', 'кол', 10500, 'ORMAR'),
  m('E06', 'ELEKTRIKA', 'ОСИГУРАЧ 10А', 'кол', 195, '(AREA/20)*ELEKTRIKA'),
  m('E07', 'ELEKTRIKA', 'ОСИГУРАЧ 16А', 'кол', 195, '(AREA/18)*ELEKTRIKA'),
  m('E08', 'ELEKTRIKA', 'ОСИГУРАЧ 25А', 'кол', 195, '(AREA/18)*ELEKTRIKA'),
  m('E09', 'ELEKTRIKA', 'ОСИГУРАЧ 25А ТРОПОЛЕН', 'кол', 783, 0),
  m('E10', 'ELEKTRIKA', 'ОСИГУРАЧ 32А', 'кол', 195, 0),
  m('E11', 'ELEKTRIKA', 'ОСИГУРАЧ 32А (2)', 'кол', 195, 0),
  m('E12', 'ELEKTRIKA', 'ОСИГУРАЧ 40А', 'кол', 235, 'qty("E05")*3'),
  m('E13', 'ELEKTRIKA', 'Ф СКЛОПКА 40mah', 'кол', 2558, '(AREA/100)*ELEKTRIKA'),
  m('E14', 'ELEKTRIKA', 'СОБИРНИЦА', 'кол', 1000, 'qty("E01")/3'),
  m('E15', 'ELEKTRIKA', 'УВОДНИЦИ', 'кол', 30, 'qty("E01")*10'),
  m('E16', 'ELEKTRIKA', 'КАБЕЛ 3Х1.5', 'кол', 39, '(AREA*2)*ELEKTRIKA'),
  m('E17', 'ELEKTRIKA', 'КАБЕЛ 3Х2.5', 'кол', 61, '(AREA*2)*ELEKTRIKA'),
  m('E18', 'ELEKTRIKA', 'КАБЕЛ 5Х2.5', 'кол', 95, 0),
  m('E19', 'ELEKTRIKA', 'КАБЕЛ 5Х4', 'кол', 154.75, 0),
  m('E20', 'ELEKTRIKA', 'КАБЕЛ 5Х6', 'кол', 224.35, '(AREA/2)*ELEKTRIKA'),
  m('E21', 'ELEKTRIKA', 'ЛАН КАБЕЛ CAT6', 'кол', 45, 'qty("E16")/3'),
  m('E22', 'ELEKTRIKA', 'КОАКСИЈАЛЕН КАБЕЛ', 'кол', 45, 'qty("E21")'),
  m('E23', 'ELEKTRIKA', 'САМОГАСИВО ЦРЕВО', 'кол', 35, 'qty("E16")+qty("E17")+qty("E21")'),
  m('E24', 'ELEKTRIKA', 'ДОЗНА 2М', 'кол', 19, 'qty("E38")/3'),
  m('E25', 'ELEKTRIKA', 'ДОЗНА 3М', 'кол', 27, 'qty("E38")/3'),
  m('E26', 'ELEKTRIKA', 'ДОЗНА 4М', 'кол', 33, 'qty("E38")/3'),
  m('E27', 'ELEKTRIKA', 'ДОЗНА 7М', 'кол', 43, '(AREA/30)*ELEKTRIKA'),
  m('E28', 'ELEKTRIKA', 'ПОДЛОШКА 2М', 'кол', 24, 'qty("E24")'),
  m('E29', 'ELEKTRIKA', 'ПОДЛОШКА 3М', 'кол', 33, 'qty("E25")'),
  m('E30', 'ELEKTRIKA', 'ПОДЛОШКА 4М', 'кол', 39, 'qty("E26")'),
  m('E31', 'ELEKTRIKA', 'ПОДЛОШКА 7М', 'кол', 54, 'qty("E27")'),
  m('E32', 'ELEKTRIKA', 'МАСКА 1М', 'кол', 32, 0),
  m('E33', 'ELEKTRIKA', 'МАСКА 2М', 'кол', 32, 'qty("E24")'),
  m('E34', 'ELEKTRIKA', 'МАСКА 3М', 'кол', 42, 'qty("E25")'),
  m('E35', 'ELEKTRIKA', 'МАСКА 4М', 'кол', 52, 'qty("E26")'),
  m('E36', 'ELEKTRIKA', 'МАСКА 7М', 'кол', 72, 'qty("E27")'),
  m('E37', 'ELEKTRIKA', 'ШУКО 1М', 'кол', 65, '(AREA/25)*ELEKTRIKA'),
  m('E38', 'ELEKTRIKA', 'ШУКО 2М', 'кол', 128, 'SHUKO - qty("E37")'),
  m('E39', 'ELEKTRIKA', 'ШУКО 2М СО КАПАК', 'кол', 162, 'qty("E43")'),
  m('E40', 'ELEKTRIKA', 'ПРЕКИНУВАЧ 1М', 'кол', 68, 'qty("E58")+qty("E57")'),
  m('E41', 'ELEKTRIKA', 'ПРЕКИНУВАЧ НАИЗ. 1М', 'кол', 99, '(AREA/30)*ELEKTRIKA'),
  m('E42', 'ELEKTRIKA', 'СЛЕПО КАПАЧЕ', 'кол', 22, '(AREA/5)*ELEKTRIKA'),
  m('E43', 'ELEKTRIKA', 'ИНДИКАТОР', 'кол', 169, 'qty("V01")'),
  m('E44', 'ELEKTRIKA', 'LAN ШУКО', 'кол', 368, 'qty("E23")/250'),
  m('E45', 'ELEKTRIKA', 'ТВ ШУКО', 'кол', 158, 'qty("E44")'),
  m('E46', 'ELEKTRIKA', 'ПЕРФОРИРАНА ТРАКА', 'кол', 200, 'qty("E01")*5'),
  m('E47', 'ELEKTRIKA', 'ОГ ДОЗНА 80Х80', 'кол', 62.5, '(AREA/10)*ELEKTRIKA'),
  m('E48', 'ELEKTRIKA', 'ОГ ДОЗНА 190Х140', 'кол', 324, 0),
  m('E49', 'ELEKTRIKA', 'ОГ ДОЗНА FAST CHARGER', 'кол', 324, 0),
  m('E50', 'ELEKTRIKA', 'ВЕЗИЦИ 20ЦМ', 'кол', 1, '(AREA*5)*ELEKTRIKA'),
  m('E51', 'ELEKTRIKA', 'ПИР СЕНЗОР', 'кол', 500, 0),
  m('E52', 'ELEKTRIKA', 'СЕНЗОР ВНАТРЕШЕН', 'кол', 450, 0),
  m('E53', 'ELEKTRIKA', 'ВЕНТИЛАТОР', 'кол', 900, 'qty("V01")'),
  m('E54', 'ELEKTRIKA', 'ШУКО ОГ', 'кол', 190, 0),
  m('E55', 'ELEKTRIKA', 'ФАСОНКИ', 'кол', 34, 0),
  m('E56', 'ELEKTRIKA', 'ЛЕД СИЈАЛИЦИ', 'кол', 65, 0),
  m('E57', 'ELEKTRIKA', 'ЛЕД СВЕТЛА НАДВОРЕШНИ', 'кол', 1800, 'qty("E58")/2.5'),
  m('E58', 'ELEKTRIKA', 'ЛЕД СВЕТЛА ВНАТРЕШНИ', 'кол', 650, 'SVETLA'),

  // ─── ЕЛЕКТРИКА (монтажа) ───
  m('EM01', 'ELEKTRIKA', 'ТАБЛА МОНТАЖА', 'кол', 1770, 'qty("E01")+qty("E02")+qty("E03")'),
  m('EM02', 'ELEKTRIKA', 'ОСИГУРАЧ МОНТАЖА', 'кол', 472, 'qty("E06")+qty("E07")+qty("E08")+qty("E09")+qty("E10")+qty("E11")+qty("E12")'),
  m('EM03', 'ELEKTRIKA', 'ФИД ОСИГУРАЧ МОНТАЖА', 'кол', 1770, 'qty("E13")'),
  m('EM04', 'ELEKTRIKA', 'ПИР СЕНЗОР МОНТАЖА', 'кол', 708, 'qty("E51")+qty("E52")'),
  m('EM05', 'ELEKTRIKA', 'МОНТАЖА КАБЕЛ ВО ЦРЕВО', 'кол', 95, 'qty("E16")+qty("E17")+qty("E18")+qty("E19")+qty("E20")'),
  m('EM06', 'ELEKTRIKA', 'МОНТАЖА КАБЕЛ БЕЗ ЦРЕВО', 'кол', 71, 'qty("E21")+qty("E22")'),
  m('EM07', 'ELEKTRIKA', 'ДОЗНИ ОГ МОНТАЖА', 'кол', 472, 'qty("E47")+qty("E48")+qty("E49")'),
  m('EM08', 'ELEKTRIKA', 'ПОВРЗУВАЊЕ ДОЗНА ОГ', 'кол', 708, 'qty("EM07")'),
  m('EM09', 'ELEKTRIKA', 'ДОЗНА ЗА 2М МОНТАЖА', 'кол', 295, 'qty("E24")'),
  m('EM10', 'ELEKTRIKA', 'ДОЗНА ЗА 3М МОНТАЖА', 'кол', 354, 'qty("E25")'),
  m('EM11', 'ELEKTRIKA', 'ДОЗНА ЗА 4М МОНТАЖА', 'кол', 472, 'qty("E26")'),
  m('EM12', 'ELEKTRIKA', 'ДОЗНА ЗА 7М МОНТАЖА', 'кол', 590, 'qty("E27")'),
  m('EM13', 'ELEKTRIKA', 'ШТЕКЕР МОНТАЖА 1М/2М', 'кол', 236, 'qty("E37")+qty("E38")+qty("E39")'),
  m('EM14', 'ELEKTRIKA', 'ПРЕКИДАЧ МОНТАЖА 1М/2М', 'кол', 215, 'qty("E40")+qty("E41")'),
  m('EM15', 'ELEKTRIKA', 'ЛАН МОНТАЖА И ПРОВЕРКА', 'кол', 708, 'qty("E44")'),
  m('EM16', 'ELEKTRIKA', 'ТВ МОНТАЖА И ПРОВЕРКА', 'кол', 590, 'qty("E45")'),
  m('EM17', 'ELEKTRIKA', 'МОНТАЖА НА ЛЕД СВЕТЛО', 'кол', 590, 'qty("E58")+qty("E57")'),
  m('EM18', 'ELEKTRIKA', 'МОНТАЖА НА ВЕНТИЛАТОР', 'кол', 708, 'qty("E53")'),
  m('EM19', 'ELEKTRIKA', 'БОЉЕР МОНТАЖА', 'кол', 708, 'qty("E43")'),
  m('EM20', 'ELEKTRIKA', 'ПРЕВОЗ', 'кол', 0, 0),
  m('E60', 'ELEKTRIKA', 'РАБОТНА СТРУЈА МДА', 'кол', 0, 1, {
    priceFormula: '(total("EM01")+total("EM02")+total("EM03")+total("EM04")+total("EM05")+total("EM06")+total("EM07")+total("EM08")+total("EM09")+total("EM10")+total("EM11")+total("EM12")+total("EM13")+total("EM14")+total("EM15")+total("EM16")+total("EM17")+total("EM18")+total("EM19"))/3',
  }),

  // ─── ПОДОПОЛАГАЊЕ ───
  m('PD01', 'PODOVI', 'КОШУЛКА', 'м2', 950, 'AREA*KOSHULKA'),
  m('PD02', 'PODOVI', 'ОСБ 18мм', 'м2', 550, 90, { grey: 1 }),
  m('PD03', 'PODOVI', 'ПЛОЧКИ ЅИД ВЦ', 'м2', 650, 'WC_PERIM*2'),
  m('PD04', 'PODOVI', 'ПЛОЧКИ ПОД ВЦ', 'м2', 650, '((WC_PERIM/7)+2)*WC'),
  m('PD05', 'PODOVI', 'ЛЕПАК ЦЕРЕСИТ 11', 'кг', 510, 0),
  m('PD06', 'PODOVI', 'ЛАПАК ЦЕРЕСИТ 16', 'вреќа', 850, '(qty("PD14")*8)/25'),
  m('PD07', 'PODOVI', 'БУТИЛ ГУМЕНА ТРАКА', 'кол', 1100, 'WC'),
  m('PD08', 'PODOVI', 'ХИДОМАЛ ФЛЕКС СО РАБ.Р', 'кол', 4420, 'WC'),
  m('PD09', 'PODOVI', 'ЛАЈСНИ', 'м1', 250, 'WC*2'),
  m('PD10', 'PODOVI', 'СИФОН СРЕДИШЕН', 'ком', 250, 'WC'),
  m('PD11', 'PODOVI', 'СИФОН ТУШ КАБИНА', 'кол', 250, 'WC'),
  m('PD14', 'PODOVI', 'РАБОТНА ПЛОЧКИ', 'м2', 1050, 'qty("PD03")+qty("PD04")+qty("PD15")+qty("PD16")+qty("PD17")+qty("PD18")'),
  m('PD15', 'PODOVI', 'ПЛОЧКИ ЅИД КУЈНА', 'м2', 930, '(AREA_HOUSE/35)*WC'),
  m('PD16', 'PODOVI', 'ПЛОЧКИ ПОД ГАРАЖА', 'м2', 930, 18),
  m('PD17', 'PODOVI', 'ПОД ПЛОЧКИ КУЌА ВНАТРЕ', 'м2', 650, '(AREA_HOUSE-qty("PD04"))*PLOCHKI'),
  m('PD18', 'PODOVI', 'ПОД ПЛОЧКИ КУЌА НАДВОР', 'м2', 700, 'TILE_EXTRA+AREA_TERRACE'),
  m('PD19', 'PODOVI', 'ПОД ЛАМИНАТ КУЌА', 'м2', 850, '(AREA_HOUSE-qty("PD04")-qty("PD17")-qty("PD16")+10)*LAMINAT'),
  m('PD20', 'PODOVI', 'ПОД ТАРКЕТ КУЌА', 'м2', 4340, 0),
  m('PD21', 'PODOVI', 'РАБОТНА ПОД КУЌА', 'пауш', 400, 'qty("PD19")+qty("PD20")'),

  // ─── ДОГРАМА (прозорите се внесуваат динамички во калкулаторот) ───
  m('D01', 'DOGRAMA', 'ВНАТРЕШНА ВРАТА', 'кол', 12800, 'DOORS_IN', { grey: 1 }),
  m('D02', 'DOGRAMA', 'НАДВОРЕШНА ВРАТА БЛИНДОР', 'кол', 40000, 'DOORS_BLIND', { grey: 1 }),
  m('D03', 'DOGRAMA', 'МОНТАЖА ДОГРАМА', 'пауш', 2000, 'WINDOWS_QTY + (DOORS_IN*2) + (DOORS_BLIND*3)', { grey: 1 }),

  // ─── КРОВОПОКРИВАЊЕ ───
  m('R01', 'POKRIVANJE', 'ПУР ПАНЕЛ ЛИМ 10СМ', 'м2', 1000, '(ROOF+25)*ROOF_PUR'),
  m('R02', 'POKRIVANJE', 'РАБОТНА ПУР ПАНЕЛ', 'м2', 750, 'qty("R01")'),
  m('R03', 'POKRIVANJE', 'ЛИМ ПОКРИВЕН', 'м2', 1450, 'ROOF*ROOF_LIM', { grey: 1 }),
  m('R04', 'POKRIVANJE', 'ЛИМ ЅИДЕН', 'м2', 1225, 0),
  m('R05', 'POKRIVANJE', 'ВЕТЕРЛАЈСНИ', 'м1', 980, '((WALL_OUT+10)+(AREA/10))*ROOF_LIM', { grey: 1 }),
  m('R06', 'POKRIVANJE', 'ВЕРТИКАЛНИ ОЛУЦИ', 'м1', 980, '(FLOOR_H*9)*ROOF_LIM', { grey: 1 }),
  m('R07', 'POKRIVANJE', 'ХОРИЗОНТАЛНИ ОЛУЦИ', 'м1', 980, '(WALL_OUT/2.3)*ROOF_LIM', { grey: 1 }),
  m('R08', 'POKRIVANJE', 'СЛЕМЕ', 'м1', 950, '(AREA/19)*ROOF_LIM', { grey: 1 }),
  m('R09', 'POKRIVANJE', 'СИМС ОКОЛУ ОБЈЕКТ', 'м2', 3200, 'SIMS', { grey: 1 }),

  // ─── ИЗРАБОТКА И МОНТАЖА ───
  m('L01', 'RABOTNA', 'РАБОТНА КОНСТРУКЦИЈА', 'пауш', 1500, 'AREA*MONTAZA', { grey: 0.5 }),
  m('L02', 'RABOTNA', 'РАБОТНА МОНТАЖА', 'пауш', 1200, 'AREA*MONTAZA', { grey: 0.5 }),
  m('L03', 'RABOTNA', 'РАБОТНА ТРАНСПОРТ', 'пауш', 1000, '(AREA/2)*MONTAZA', { grey: 1 }),
  m('L04', 'RABOTNA', 'ТРАНСПОРТ', 'пауш', 2000, 0),
  m('L05', 'RABOTNA', 'СМЕСТУВАЊЕ', 'пауш', 900, 0),
  m('L06', 'RABOTNA', 'ХРАНА', 'пауш', 750, 0),
  m('L07', 'RABOTNA', 'РАБОТИЛНИЦА', 'пауш', 1800, '(AREA/3)*MONTAZA', { grey: 1 }),
  m('L08', 'RABOTNA', 'КРАН', 'пауш', 2000, 0),
  m('L09', 'RABOTNA', 'РАБОТНА РАБОТИЛНИЦА', 'пауш', 750, '(AREA*1.5)*MONTAZA', { grey: 0.5 }),
  m('L10', 'RABOTNA', 'СКЕЛЕ ЗА РАБОТА', 'пауш', 120000, 1),
  m('L11', 'RABOTNA', 'РАБОТНА МОДУЛАР ТЕРАСА', 'пауш', 4000, 'AREA_TERRACE*MONTAZA', { grey: 1 }),
  m('L12', 'RABOTNA', 'РАБОТНА МОДУЛАР', 'пауш', 8000, 'AREA_HOUSE*MONTAZA', { grey: 0.5 }),

  // ─── ДОПОЛНИТЕЛНИ ───
  m('X01', 'DOPOLNITELNI', 'МЕТАЛНА КОНСТРУКЦИЈА', 'пауш', 192715, 1),
  m('X02', 'DOPOLNITELNI', 'ИЗРАБОТКА НА СКАЛИ', 'м1', 2000, 0),
  m('X03', 'DOPOLNITELNI', 'ОГРАДИ НА ТЕРАСИ ОБИЧНИ', 'пауш', 8500, 0),
  m('X04', 'DOPOLNITELNI', 'ДРВЕНА КОНСТРУКЦИЈА', 'пауш', 24500, 0),
  m('X05', 'DOPOLNITELNI', 'ДРВЕНА РАБОТНА', 'пауш', 35000, 0),
  m('X06', 'DOPOLNITELNI', 'ЛАКИРАЊЕ', 'пауш', 9500, 0),
  m('X07', 'DOPOLNITELNI', 'ЛАК', 'кол', 6500, 0),
];

// Стандардни прозори/врати — почетни редови во калкулаторот (цена во ЕУР по парче)
const windowsDefaults = [
  { name: 'прозор кујна 130х125', qty: 1, priceEur: 283 },
  { name: 'врата прозор тераса обично 180х215', qty: 1, priceEur: 477 },
  { name: 'прозор дневна фикс отвор 140х215', qty: 1, priceEur: 326 },
  { name: 'прозор дневна фикс 140х215', qty: 1, priceEur: 225 },
  { name: 'гаража врата со стакло 90х215', qty: 1, priceEur: 370 },
  { name: 'тоалет голем 160х44', qty: 1, priceEur: 156 },
  { name: 'тоалет мал 62х44', qty: 1, priceEur: 64 },
  { name: 'прозор спална мастер 186х208', qty: 1, priceEur: 488 },
  { name: 'прозор спална мала 142х208', qty: 1, priceEur: 323 },
  { name: 'прозор спална мала 2 140х208', qty: 1, priceEur: 323 },
  { name: 'прозор скали 104х130', qty: 1, priceEur: 190 },
  { name: 'гаражна врата роло', qty: 1, priceEur: 1200 },
];

module.exports = { settings, inputGroups, inputs, categories, materials, windowsDefaults, quotes: [], inquiries: [], analytics: { daily: {} } };

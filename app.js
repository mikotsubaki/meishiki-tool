/* ============================================================
   四柱推命 命式計算ツール app.js
   ------------------------------------------------------------
   ・節入りデータは data/setsuiriData.js（先に読み込むこと）
   ・すべての日時は日本標準時 JST を前提
   ・「流派差が出る設定はここ」→ 下の CONFIG と ZOKAN_RULES
   ============================================================ */

"use strict";

/* ============================================================
   流派差が出る設定はここ（CONFIG）
   ------------------------------------------------------------
   画面の「流派設定」から変えられる項目もありますが、
   初期値・細かい方式はこのオブジェクトで管理します。
   ============================================================ */
const CONFIG = {
  // 日柱の切り替え時刻："0" = 0時切り替え（初期設定） / "23" = 23時台を翌日扱い
  dayChangeMode: "0",

  // 蔵干の採り方："nissuu" = 節入り後日数で採用（初期設定） / "honki" = 本気固定
  zokanMode: "nissuu",

  // 大運開始年齢の丸め方：
  //  "ym"    = ○歳○ヶ月で表示（初期設定。3日=1年 → 1日=4ヶ月換算）
  //  "floor" = 切り捨てて○歳のみ
  //  "round" = 四捨五入して○歳のみ
  taiunRounding: "ym",

  // 大運を何本表示するか
  taiunCount: 10,

  // 五行カウントにどれを含めるか（地支の反映度は流派差が大きい）
  // 初期設定：天干4つ＋採用蔵干4つの計8点のみ。地支そのものは数えない
  // （地支五行は「参考」として別欄に表示のみ。加算したい流派は chishi: true に）
  gogyoCount: { tenkan: true, chishi: false, zokan: true },

  // 歳運を中心年の前後何年分表示するか
  saiunRange: 4,
};

/* ============================================================
   蔵干ルールはここ（ZOKAN_RULES）
   ------------------------------------------------------------
   節入り後「何日目まで」どの蔵干を採用するかのテーブル。
   流派によって日数も蔵干候補も異なるため、必ずここだけで
   変更できるようにしています。
   例）子を「癸のみ（本気だけ）」にしたい場合：
       子: [ { until: 31, stem: "癸" } ]
   ※ until は「節入り後○日目まで」（1日目 = 節入り当日〜24時間以内）
   ※ 各配列の最後の stem がその支の「本気」です
   ============================================================ */
const ZOKAN_RULES = {
  // 子は節入り後10日目までは初気「壬」、それ以降は本気「癸」を採用
  子: [ { until: 10, stem: "壬" }, { until: 31, stem: "癸" } ],
  丑: [ { until: 9,  stem: "癸" }, { until: 12, stem: "辛" }, { until: 31, stem: "己" } ],
  寅: [ { until: 7,  stem: "戊" }, { until: 14, stem: "丙" }, { until: 31, stem: "甲" } ],
  卯: [ { until: 31, stem: "乙" } ],
  辰: [ { until: 9,  stem: "乙" }, { until: 12, stem: "癸" }, { until: 31, stem: "戊" } ],
  巳: [ { until: 7,  stem: "戊" }, { until: 14, stem: "庚" }, { until: 31, stem: "丙" } ],
  午: [ { until: 19, stem: "己" }, { until: 31, stem: "丁" } ],
  未: [ { until: 9,  stem: "丁" }, { until: 12, stem: "乙" }, { until: 31, stem: "己" } ],
  申: [ { until: 7,  stem: "戊" }, { until: 14, stem: "壬" }, { until: 31, stem: "庚" } ],
  酉: [ { until: 31, stem: "辛" } ],
  戌: [ { until: 9,  stem: "辛" }, { until: 12, stem: "丁" }, { until: 31, stem: "戊" } ],
  亥: [ { until: 7,  stem: "戊" }, { until: 14, stem: "甲" }, { until: 31, stem: "壬" } ],
};

/* ============================================================
   身旺身弱レベル計算はここ（SHIOU_RULES）
   ------------------------------------------------------------
   ※簡易スコア判定。流派差があるため点数・しきい値は
     このテーブルだけで調整できます。
   ※命式本体の計算ロジックは変更しない（既存の通変星・十二運の
     結果を読み取って点数化するだけの「追加判定」です）
   ============================================================ */
const SHIOU_RULES = {
  // 日干を強める通変星（+1）。それ以外の通変星は -1
  plusStars: ["比肩", "劫財", "偏印", "印綬"],
  // 月令：月柱の十二運がこれらなら加点し「月令あり」とする
  getsurei: { 帝旺: 4, 建禄: 3, 冠帯: 2, 長生: 1, 沐浴: 1 },
  // スコア→レベル（min以上で該当。上から順に判定）
  levels: [
    { min: 6,    label: "極身旺",     comment: "自星・印星が非常に多く、日主の力がきわめて強い命式です。" },
    { min: 4,    label: "かなり身旺", comment: "自星・印星の助けが強く、日主の力が強い命式です。" },
    { min: 2,    label: "身旺",       comment: "日主を支える力が比較的強い命式です。" },
    { min: 0,    label: "やや身旺",   comment: "強弱のバランスが取れた、やや強めの命式です。" },
    { min: -2,   label: "やや身弱",   comment: "強弱のバランスが取れた、やや弱めの命式です。" },
    { min: -4,   label: "身弱",       comment: "日主を支える力が控えめな命式です。" },
    { min: -Infinity, label: "かなり身弱", comment: "財官食傷が多く、日主の力が弱い命式です。" },
  ],
};

/* ============================================================
   神殺星ルールはここ（KISATSU_RULES）
   ------------------------------------------------------------
   ※神殺星は流派差があるため変更可能。判定表はすべてこの
     オブジェクトにまとめてあり、ここだけ直せば差し替えできます。
   ※命式本体の計算ロジックは変更しない（干支・蔵干などの
     既存結果を参照して星を付けるだけの「追加表示」です）
   表の見方：
   ・byDayStem   … 日干 → 該当する支（その支を持つ柱に付く）
   ・byMonth     … 月支 → 該当する干または支（天徳系。四仲月の
                    天徳は方位のため対象なし＝null）
   ・byMonthTrine… 月支の三合グループ → 該当する天干（月徳系）
   ・byTrine     … 年支・日支の三合グループ → 該当する支
   ・dayKanshi   … 日柱の干支そのもので判定（魁罡）
   ============================================================ */
const KISATSU_RULES = {
  // 表示順（この並びで各柱に表示されます）
  order: ["天乙貴人","天徳貴人","天徳合貴人","月徳貴人","月徳合貴人","紅艶","羊刃","劫殺","魁罡",
          "咸池","天厨貴人","福星貴人","亡神","暗禄","駅馬","因獄","文昌貴人","血刃","金輿禄"],

  byDayStem: {
    // 甲戊庚→丑未 / 乙己→子申 / 丙丁→亥酉 / 辛→午寅 / 壬癸→卯巳
    天乙貴人: { 甲:["丑","未"], 乙:["子","申"], 丙:["亥","酉"], 丁:["亥","酉"], 戊:["丑","未"],
               己:["子","申"], 庚:["丑","未"], 辛:["午","寅"], 壬:["卯","巳"], 癸:["卯","巳"] },
    紅艶:     { 甲:["午"], 乙:["申"], 丙:["寅"], 丁:["未"], 戊:["辰"], 己:["辰"], 庚:["戌"], 辛:["酉"], 壬:["子"], 癸:["申"] },
    // 羊刃は陽干のみ（陰干にも立てる流派は配列を追加してください）
    羊刃:     { 甲:["卯"], 丙:["午"], 戊:["午"], 庚:["酉"], 壬:["子"] },
    天厨貴人: { 甲:["巳"], 乙:["午"], 丙:["巳"], 丁:["午"], 戊:["申"], 己:["酉"], 庚:["亥"], 辛:["子"], 壬:["寅"], 癸:["卯"] },
    福星貴人: { 甲:["寅","子"], 乙:["丑","卯"], 丙:["寅","子"], 丁:["亥"], 戊:["申"],
               己:["未"], 庚:["午"], 辛:["巳"], 壬:["辰"], 癸:["丑","卯"] },
    暗禄:     { 甲:["亥"], 乙:["戌"], 丙:["申"], 丁:["未"], 戊:["申"], 己:["未"], 庚:["巳"], 辛:["辰"], 壬:["寅"], 癸:["丑"] },
    文昌貴人: { 甲:["巳"], 乙:["午"], 丙:["申"], 丁:["酉"], 戊:["申"], 己:["酉"], 庚:["亥"], 辛:["子"], 壬:["寅"], 癸:["卯"] },
    血刃:     { 甲:["戌"], 乙:["酉"], 丙:["申"], 丁:["未"], 戊:["午"], 己:["巳"], 庚:["辰"], 辛:["卯"], 壬:["寅"], 癸:["丑"] },
    金輿禄:   { 甲:["辰"], 乙:["巳"], 丙:["未"], 丁:["申"], 戊:["未"], 己:["申"], 庚:["戌"], 辛:["亥"], 壬:["丑"], 癸:["寅"] },
  },

  // 天徳系：月支から。値が十干なら天干と、十二支なら地支と照合する
  // （子月→巳 のように四仲月も支で判定する表を採用。
  //   四仲月を方位扱い＝対象なしにする流派は該当値を null にしてください）
  byMonth: {
    天徳貴人:   { 寅:"丁", 卯:"申", 辰:"壬", 巳:"辛", 午:"亥", 未:"甲", 申:"癸", 酉:"寅", 戌:"丙", 亥:"乙", 子:"巳", 丑:"庚" },
    天徳合貴人: { 寅:"壬", 卯:"巳", 辰:"丁", 巳:"丙", 午:"寅", 未:"己", 申:"戊", 酉:"亥", 戌:"辛", 亥:"庚", 子:"申", 丑:"乙" },
  },

  // 月徳系：月支の三合グループから天干を求める
  byMonthTrine: {
    月徳貴人:   { 水:"壬", 火:"丙", 木:"甲", 金:"庚" }, // 申子辰=水局, 寅午戌=火局, 亥卯未=木局, 巳酉丑=金局
    月徳合貴人: { 水:"丁", 火:"辛", 木:"己", 金:"乙" },
  },

  // 三合系：年支・日支それぞれの三合グループから支を求める（両方を判定し重複は除去）
  byTrine: {
    劫殺: { 水:"巳", 火:"亥", 金:"寅", 木:"申" },
    亡神: { 水:"亥", 火:"巳", 金:"申", 木:"寅" },
    駅馬: { 水:"寅", 火:"申", 金:"亥", 木:"巳" },
    咸池: { 水:"酉", 火:"卯", 金:"午", 木:"子" },
    因獄: { 水:"午", 火:"子", 金:"卯", 木:"酉" }, // 災殺（囚獄殺）と同じ判定
  },

  // 魁罡：日柱の干支そのもので判定
  dayKanshi: { 魁罡: ["庚辰", "庚戌", "壬辰", "戊戌"] },
};

// 三合グループ（申子辰=水 / 寅午戌=火 / 巳酉丑=金 / 亥卯未=木）
const TRINE_GROUP = { 申:"水", 子:"水", 辰:"水", 寅:"火", 午:"火", 戌:"火",
                      巳:"金", 酉:"金", 丑:"金", 亥:"木", 卯:"木", 未:"木" };

/* ============================================================
   基本テーブル（干支・五行・通変星・十二運・節気）
   ============================================================ */
const STEMS = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"]; // 十干
const BRANCHES = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"]; // 十二支

// 十干の五行（0木 1火 2土 3金 4水）: 甲乙=木, 丙丁=火, 戊己=土, 庚辛=金, 壬癸=水
const GOGYO_NAMES = ["木","火","土","金","水"];
const stemElement = (s) => Math.floor(s / 2);
const stemIsYang  = (s) => s % 2 === 0; // 甲丙戊庚壬 = 陽

// 地支の五行（仕様どおり：寅卯木 / 巳午火 / 辰戌丑未土 / 申酉金 / 亥子水）
const BRANCH_ELEMENT = { 子:4, 丑:2, 寅:0, 卯:0, 辰:2, 巳:1, 午:1, 未:2, 申:3, 酉:3, 戌:2, 亥:4 };

// 通変星（日干から見た相手の干）
const TSUHEN_NAMES = [
  ["比肩","劫財"], // 同じ五行
  ["食神","傷官"], // 日干が生じる
  ["偏財","正財"], // 日干が剋す
  ["偏官","正官"], // 日干が剋される
  ["偏印","印綬"], // 日干が生じられる
];

// 十二運の並び（長生から順に）
const JUNIUN = ["長生","沐浴","冠帯","建禄","帝旺","衰","病","死","墓","絶","胎","養"];
// 各日干の「長生」が置かれる支（陽干は順行・陰干は逆行）
const CHOSEI_BRANCH = { 甲:"亥", 乙:"午", 丙:"寅", 丁:"酉", 戊:"寅", 己:"酉", 庚:"巳", 辛:"子", 壬:"申", 癸:"卯" };

// 節気 → 月支の対応（月柱の切り替え基準）
const TERM_ORDER = ["立春","啓蟄","清明","立夏","芒種","小暑","立秋","白露","寒露","立冬","大雪","小寒"];
const TERM_BRANCH = { 立春:"寅", 啓蟄:"卯", 清明:"辰", 立夏:"巳", 芒種:"午", 小暑:"未",
                      立秋:"申", 白露:"酉", 寒露:"戌", 立冬:"亥", 大雪:"子", 小寒:"丑" };

/* ============================================================
   日時ユーティリティ
   ------------------------------------------------------------
   閲覧者のPCのタイムゾーンに影響されないよう、
   「JSTの壁時計時刻」をそのまま UTC ミリ秒に対応させて扱います。
   （比較・引き算だけに使うので、この方式で正確に計算できます）
   ============================================================ */
function toMs(y, mo, d, h = 0, mi = 0) {
  return Date.UTC(y, mo - 1, d, h, mi);
}
function parseJst(str) { // "YYYY-MM-DD HH:mm" → ミリ秒
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  return toMs(+m[1], +m[2], +m[3], +m[4], +m[5]);
}
const DAY_MS = 86400000;
const pad2 = (n) => String(n).padStart(2, "0");
function fmtMs(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/* ============================================================
   六十干支
   ============================================================ */
function kanshiName(idx) {
  const i = ((idx % 60) + 60) % 60;
  return STEMS[i % 10] + BRANCHES[i % 12];
}
// 年の干支番号（甲子 = 0。1984年 = 甲子）
function yearKanshiIdx(risshunYear) {
  return ((risshunYear - 1984) % 60 + 60) % 60;
}
// 日の干支番号（1970-01-01 からの通算日 + 17 が甲子起点になる。
// 1949-10-01・1912-02-18 = 甲子日、1972-12-07 = 壬申日 で検証済み）
function dayKanshiIdx(y, mo, d) {
  const dayNum = Math.floor(toMs(y, mo, d) / DAY_MS);
  return ((dayNum + 17) % 60 + 60) % 60;
}

/* ============================================================
   節入りデータの検索（SETSUIRI_DATA を使用）
   ------------------------------------------------------------
   SETSUIRI_DATA は「立春年」キー：各年の行は
   立春 → 翌年の小寒 まで時系列に並んでいます。
   ============================================================ */

// 生まれた瞬間が属する「立春年」を返す（立春前なら前年）
function getRisshunYear(birthMs, calendarYear) {
  let y = calendarYear;
  const row = SETSUIRI_DATA[y];
  if (row && birthMs < parseJst(row["立春"])) y = calendarYear - 1;
  if (!SETSUIRI_DATA[y]) return null; // データ範囲外
  return y;
}

// 生まれた瞬間が属する月の節入り情報を返す
function getMonthTerm(birthMs, risshunYear) {
  const row = SETSUIRI_DATA[risshunYear];
  let found = null;
  for (let i = 0; i < TERM_ORDER.length; i++) {
    const t = parseJst(row[TERM_ORDER[i]]);
    if (t <= birthMs) found = { name: TERM_ORDER[i], ms: t, order: i };
    else break;
  }
  if (!found) return null;
  return {
    ...found,
    branch: TERM_BRANCH[found.name],
    branchIdx: BRANCHES.indexOf(TERM_BRANCH[found.name]),
  };
}

// 次の節入り（大運・順行用）。データ末尾を超える場合は null
function getNextTerm(risshunYear, order) {
  if (order < TERM_ORDER.length - 1) {
    const name = TERM_ORDER[order + 1];
    return { name, ms: parseJst(SETSUIRI_DATA[risshunYear][name]) };
  }
  const nextRow = SETSUIRI_DATA[risshunYear + 1];
  if (!nextRow) return null;
  return { name: "立春", ms: parseJst(nextRow["立春"]) };
}

/* ============================================================
   四柱の計算
   ============================================================ */

// 月干（五虎遁）：年干から寅月の干を決め、月支ぶん進める
// 甲己→丙寅、乙庚→戊寅、丙辛→庚寅、丁壬→壬寅、戊癸→甲寅
function monthStemIdx(yearStem, monthBranchIdx) {
  const toraStem = (yearStem * 2 + 2) % 10; // 寅月の干
  return (toraStem + ((monthBranchIdx - 2 + 12) % 12)) % 10;
}

// 時干（五鼠遁）：日干から子時の干を決め、時支ぶん進める
// 甲己→甲子、乙庚→丙子、丙辛→戊子、丁壬→庚子、戊癸→壬子
function hourStemIdx(dayStem, hourBranchIdx) {
  const neStem = (dayStem * 2) % 10; // 子時の干
  return (neStem + hourBranchIdx) % 10;
}

// 時支：23:00〜00:59 子、01:00〜02:59 丑、…（2時間ごと）
function hourBranchIdx(hour) {
  return Math.floor(((hour + 1) % 24) / 2);
}

// 通変星：日干から見た相手の干
function tsuhensei(dayStem, otherStem) {
  const rel = (stemElement(otherStem) - stemElement(dayStem) + 5) % 5;
  const samePolarity = stemIsYang(dayStem) === stemIsYang(otherStem);
  return TSUHEN_NAMES[rel][samePolarity ? 0 : 1];
}

// 十二運：日干 × 地支（陽干は長生の支から順行、陰干は逆行）
function juniun(dayStem, branchName) {
  const start = BRANCHES.indexOf(CHOSEI_BRANCH[STEMS[dayStem]]);
  const b = BRANCHES.indexOf(branchName);
  const dir = stemIsYang(dayStem) ? 1 : -1;
  const stage = (((b - start) * dir) % 12 + 12) % 12;
  return JUNIUN[stage];
}

// 空亡：日柱の干支番号から旬を判定し、旬に含まれない2支を返す
function kubou(dayKanshi) {
  const group = Math.floor(dayKanshi / 10); // 甲子旬=0, 甲戌旬=1, …
  const b1 = ((10 - group * 2) % 12 + 12) % 12;
  return BRANCHES[b1] + BRANCHES[(b1 + 1) % 12];
}

/* ============================================================
   身旺・身弱レベル（追加判定）
   ------------------------------------------------------------
   既存の pillars（通変星・蔵干通変・十二運）を読むだけで、
   命式本体の計算ロジックは変更しない。
   ルールは上部の SHIOU_RULES で調整可能。
   ============================================================ */
function calcShiouLevel(pillars, dayStem) {
  const plus = SHIOU_RULES.plusStars;
  let score = 0;

  // 天干通変星：日柱（tsuhen="ー"）以外を +1 / -1（時刻不明の時柱は除外）
  pillars.forEach((p, i) => {
    if (i === 2 || p.unknown) return; // 日柱の天干はカウントしない
    score += plus.includes(p.tsuhen) ? 1 : -1;
  });

  // 蔵干通変星：採用蔵干（候補全部ではない）の通変星を +1 / -1（時刻不明の時柱は除外）
  pillars.forEach(p => {
    if (p.unknown) return;
    score += plus.includes(p.zokanTsuhen) ? 1 : -1;
  });

  // 月令：月柱の十二運で加点
  const monthJuniun = pillars[1].juniun;
  const getsureiPoint = SHIOU_RULES.getsurei[monthJuniun] || 0;
  const isGetsurei = getsureiPoint > 0;
  score += getsureiPoint;

  // スコア→レベル
  const lv = SHIOU_RULES.levels.find(l => score >= l.min);
  return {
    score,
    level: lv.label,
    isGetsurei,
    getsureiText: isGetsurei ? "月令あり" : "月令なし",
    monthJuniun,
    getsureiPoint,
    comment: lv.comment,
  };
}

/* ============================================================
   神殺星（追加表示）
   ------------------------------------------------------------
   既存の pillars（干支）を読むだけで、命式本体の計算ロジックは
   変更しない。判定表は上部の KISATSU_RULES（流派差があるため
   変更可能）にまとめてある。
   返却形式：{ year:[…], month:[…], day:[…], hour:[…] }
   ============================================================ */
function calcKisatsu(pillars, dayStem, monthBranch) {
  const dayStemName = STEMS[dayStem];
  const dayBranch = pillars[2].branch;
  const yearBranch = pillars[0].branch;
  const dayKanshiName = pillars[2].stemName + dayBranch;

  // 各柱に付く神殺星を、柱ごとの Set に集める（同じ柱内の重複を防ぐ）
  const found = pillars.map(() => new Set());

  // --- 日干→支 で判定する神殺（該当する支を持つ柱に付く） ---
  for (const [name, table] of Object.entries(KISATSU_RULES.byDayStem)) {
    const targets = table[dayStemName] || [];
    pillars.forEach((p, i) => { if (targets.includes(p.branch)) found[i].add(name); });
  }

  // --- 天徳系（月支→干または支） ---
  for (const [name, table] of Object.entries(KISATSU_RULES.byMonth)) {
    const t = table[monthBranch];
    if (!t) continue; // 四仲月など対象なし
    const isStem = STEMS.includes(t);
    pillars.forEach((p, i) => {
      if (isStem ? p.stemName === t : p.branch === t) found[i].add(name);
    });
  }

  // --- 月徳系（月支の三合グループ→天干） ---
  const monthGroup = TRINE_GROUP[monthBranch];
  for (const [name, table] of Object.entries(KISATSU_RULES.byMonthTrine)) {
    const t = table[monthGroup];
    pillars.forEach((p, i) => { if (p.stemName === t) found[i].add(name); });
  }

  // --- 三合系（年支・日支それぞれを基準に判定、重複はSetで除去） ---
  for (const [name, table] of Object.entries(KISATSU_RULES.byTrine)) {
    const targets = new Set([table[TRINE_GROUP[yearBranch]], table[TRINE_GROUP[dayBranch]]]);
    pillars.forEach((p, i) => { if (targets.has(p.branch)) found[i].add(name); });
  }

  // --- 魁罡（日柱の干支そのもの） ---
  if (KISATSU_RULES.dayKanshi.魁罡.includes(dayKanshiName)) found[2].add("魁罡");

  // KISATSU_RULES.order の並びに整えて配列化
  const toList = (set) => KISATSU_RULES.order.filter(n => set.has(n));
  return {
    year:  toList(found[0]),
    month: toList(found[1]),
    day:   toList(found[2]),
    hour:  toList(found[3]),
  };
}

// 蔵干：節入り後の日数（1日目〜）とルールから採用蔵干を決める
function pickZokan(branchName, dayCount, mode) {
  const rules = ZOKAN_RULES[branchName];
  if (mode === "honki") {
    return { stem: rules[rules.length - 1].stem, ruleText: "本気固定" };
  }
  for (const r of rules) {
    if (dayCount <= r.until) {
      return { stem: r.stem, ruleText: describeRule(branchName) };
    }
  }
  // 日数がテーブルを超えた場合は本気（最後の行）を採用
  return { stem: rules[rules.length - 1].stem, ruleText: describeRule(branchName) };
}
function describeRule(branchName) {
  return ZOKAN_RULES[branchName]
    .map((r, i, a) => (i === a.length - 1 ? `それ以降 ${r.stem}` : `${r.until}日目まで ${r.stem}`))
    .join(" ／ ");
}

/* ============================================================
   命式全体の計算（メイン）
   ============================================================ */
function calcMeishiki(input) {
  const { year, month, day, hour, minute, gender } = input;
  const birthMs = toMs(year, month, day, hour, minute);

  // --- 立春年（年柱の基準年） ---
  const risshunYear = getRisshunYear(birthMs, year);
  if (risshunYear === null || !SETSUIRI_DATA[risshunYear]) {
    throw new Error("節入りデータの範囲外です（対応：1940年立春〜2051年立春の直前）。");
  }

  // --- 年柱 ---
  const yearIdx = yearKanshiIdx(risshunYear);
  const yearStem = yearIdx % 10;
  const yearBranch = BRANCHES[yearIdx % 12];

  // --- 月柱（節入り基準） ---
  const term = getMonthTerm(birthMs, risshunYear);
  const mStem = monthStemIdx(yearStem, term.branchIdx);
  const monthBranch = term.branch;

  // --- 日柱（切り替え時刻は CONFIG.dayChangeMode） ---
  let dIdx = dayKanshiIdx(year, month, day);
  if (CONFIG.dayChangeMode === "23" && hour >= 23) {
    dIdx = (dIdx + 1) % 60; // 23時切り替え流派：23時台は翌日の日柱
  }
  const dayStem = dIdx % 10;
  const dayBranch = BRANCHES[dIdx % 12];

  // --- 時柱（時支は23時起点、日柱は動かさない） ---
  // 出生時が「不明」の場合、時柱は計算せず「ー」扱いにする
  const hourUnknown = input.hourUnknown === true;
  const hbIdx = hourUnknown ? null : hourBranchIdx(hour);
  const hStem = hourUnknown ? null : hourStemIdx(dayStem, hbIdx);
  const hourBranch = hourUnknown ? null : BRANCHES[hbIdx];

  // --- 節入り後経過日数（蔵干用） ---
  const elapsedMs = birthMs - term.ms;
  const elapsedDays = elapsedMs / DAY_MS;
  const dayCount = Math.floor(elapsedDays) + 1; // 節入り当日〜24時間以内 = 1日目

  // --- 四柱まとめ ---
  const baseList = [
    { name: "年柱", stem: yearStem, branch: yearBranch },
    { name: "月柱", stem: mStem,    branch: monthBranch },
    { name: "日柱", stem: dayStem,  branch: dayBranch },
  ];
  if (!hourUnknown) baseList.push({ name: "時柱", stem: hStem, branch: hourBranch });

  const pillars = baseList.map((p, i) => {
    const z = pickZokan(p.branch, dayCount, CONFIG.zokanMode);
    const zStem = STEMS.indexOf(z.stem);
    return {
      ...p,
      stemName: STEMS[p.stem],
      zokan: z.stem,
      zokanRule: z.ruleText,
      zokanCandidates: ZOKAN_RULES[p.branch].map(r => r.stem).join("・"),
      tsuhen: i === 2 ? "ー" : tsuhensei(dayStem, p.stem), // 日干自身は「ー」
      zokanTsuhen: tsuhensei(dayStem, zStem),
      juniun: juniun(dayStem, p.branch),
    };
  });
  if (hourUnknown) {
    // 時柱不明：表示は「ー」、五行・身旺弱・神殺のカウント対象から除外（unknownフラグで判定）
    pillars.push({ name: "時柱", unknown: true, stem: null, branch: "ー", stemName: "ー",
                   zokan: "ー", zokanRule: "ー", zokanCandidates: "ー",
                   tsuhen: "ー", zokanTsuhen: "ー", juniun: "ー" });
  }

  // --- 空亡 ---
  const kubo = kubou(dIdx);

  // --- 五行バランス ---
  const gogyo = calcGogyo(pillars);

  // --- 追加判定（命式本体の計算ロジックは変更しない） ---
  const shiou = calcShiouLevel(pillars, dayStem);
  const kisatsu = calcKisatsu(pillars, dayStem, monthBranch);

  // --- 大運 ---
  const taiun = calcTaiun({ birthMs, gender, yearStem, term, risshunYear,
                            monthIdx: (mStem % 10) + 0, monthKanshiIdx: findKanshiIdx(mStem, term.branchIdx), dayStem });

  // --- 歳運 ---
  const saiun = calcSaiun(input.saiunYear, dayStem);

  return { input, birthMs, risshunYear, pillars, term, elapsedDays, dayCount,
           kubo, gogyo, taiun, saiun, dayStem, shiou, kisatsu,
           risshunMs: parseJst(SETSUIRI_DATA[risshunYear]["立春"]) };
}

// 干と支の組み合わせから六十干支番号を求める（干支のズレは60周期内で一意）
function findKanshiIdx(stem, branchIdx) {
  for (let i = 0; i < 60; i++) {
    if (i % 10 === stem && i % 12 === branchIdx) return i;
  }
  return 0;
}

/* ============================================================
   五行バランス（CONFIG.gogyoCount で反映範囲を調整可能）
   ============================================================ */
function calcGogyo(pillars) {
  const count = [0, 0, 0, 0, 0];
  const tenkan = [], chishi = [], zokan = [];
  pillars.forEach(p => {
    if (p.unknown) { // 時刻不明の時柱はカウントせず「ー」で揃える
      tenkan.push("ー"); chishi.push("ー"); zokan.push("ー");
      return;
    }
    const eT = stemElement(p.stem);
    const eB = BRANCH_ELEMENT[p.branch];
    const eZ = stemElement(STEMS.indexOf(p.zokan));
    tenkan.push(GOGYO_NAMES[eT]);
    chishi.push(GOGYO_NAMES[eB]);
    zokan.push(GOGYO_NAMES[eZ]);
    if (CONFIG.gogyoCount.tenkan) count[eT]++;
    if (CONFIG.gogyoCount.chishi) count[eB]++;
    if (CONFIG.gogyoCount.zokan)  count[eZ]++;
  });
  return { count, tenkan, chishi, zokan };
}

/* ============================================================
   大運（3日1年法）
   ------------------------------------------------------------
   順逆：陽年男性・陰年女性 → 順行 ／ 陽年女性・陰年男性 → 逆行
   順行：出生 → 次の節入り までの日数 ÷ 3 = 開始年齢
   逆行：前の節入り → 出生 までの日数 ÷ 3 = 開始年齢
   ============================================================ */
function calcTaiun({ birthMs, gender, yearStem, term, risshunYear, monthKanshiIdx, dayStem }) {
  const yangYear = stemIsYang(yearStem);
  const forward = (yangYear && gender === "male") || (!yangYear && gender === "female");

  let refTerm, diffDays;
  if (forward) {
    refTerm = getNextTerm(risshunYear, term.order);
    diffDays = refTerm ? (refTerm.ms - birthMs) / DAY_MS : null;
  } else {
    refTerm = { name: term.name, ms: term.ms }; // 前の節入り = 属する月の節入り
    diffDays = (birthMs - term.ms) / DAY_MS;
  }
  if (diffDays === null) throw new Error("大運計算に必要な節入りデータが不足しています。");

  const startAgeExact = diffDays / 3; // 3日 = 1年
  const y = Math.floor(startAgeExact);
  const m = Math.round((startAgeExact - y) * 12);
  const startAge = m === 12 ? { y: y + 1, m: 0 } : { y, m };

  // 表示用の開始年齢（丸め方は CONFIG.taiunRounding）
  let startAgeText;
  if (CONFIG.taiunRounding === "floor") startAgeText = `${Math.floor(startAgeExact)}歳`;
  else if (CONFIG.taiunRounding === "round") startAgeText = `${Math.round(startAgeExact)}歳`;
  else startAgeText = `${startAge.y}歳${startAge.m}ヶ月`;

  // 大運の干支：月柱から順行なら+1ずつ、逆行なら-1ずつ
  const list = [];
  for (let n = 0; n < CONFIG.taiunCount; n++) {
    const idx = ((monthKanshiIdx + (forward ? n + 1 : -(n + 1))) % 60 + 60) % 60;
    const stem = idx % 10;
    const branch = BRANCHES[idx % 12];
    list.push({
      fromAge: startAge.y + n * 10,
      kanshi: kanshiName(idx),
      tsuhen: tsuhensei(dayStem, stem),
      juniun: juniun(dayStem, branch),
    });
  }
  return { forward, refTerm, diffDays, startAgeExact, startAge, startAgeText, list };
}

/* ============================================================
   歳運（中心年の前後 CONFIG.saiunRange 年）
   ※ 歳運の干支は立春年基準（その年の立春から翌立春まで）
   ============================================================ */
function calcSaiun(centerYear, dayStem) {
  const list = [];
  for (let y = centerYear - CONFIG.saiunRange; y <= centerYear + CONFIG.saiunRange; y++) {
    const idx = yearKanshiIdx(y);
    list.push({
      year: y,
      kanshi: kanshiName(idx),
      tsuhen: tsuhensei(dayStem, idx % 10),
      juniun: juniun(dayStem, BRANCHES[idx % 12]),
      isCenter: y === centerYear,
    });
  }
  return list;
}

/* ============================================================
   ここから画面まわり（入力・表示）
   ============================================================ */
const $ = (id) => document.getElementById(id);
let lastResult = null; // コピー用に直近の結果を保持

function fillSelect(el, from, to, selected, suffix = "", withUnknown = false) {
  el.innerHTML = "";
  if (withUnknown) {
    const u = document.createElement("option");
    u.value = "u"; u.textContent = "不明";
    if (selected === null) u.selected = true; // 初期選択を「不明」にする
    el.appendChild(u);
  }
  for (let v = from; v <= to; v++) {
    const o = document.createElement("option");
    o.value = v; o.textContent = v + suffix;
    if (v === selected) o.selected = true;
    el.appendChild(o);
  }
}

let selectedGender = "male"; // 性別トグルの状態（初期：男性）

function initForm() {
  const now = new Date();
  // 生年月日は <input type="date">（カレンダー・手入力の両対応）
  fillSelect($("inHour"), 0, 23, null, "時", true);   // 初期選択は「不明」
  fillSelect($("inMinute"), 0, 59, null, "分", true); // 初期選択は「不明」
  fillSelect($("inSaiunYear"), 1940, 2050, now.getFullYear(), "年");

  // 性別トグルボタン
  const setGender = (g) => {
    selectedGender = g;
    $("genderMale").classList.toggle("active", g === "male");
    $("genderFemale").classList.toggle("active", g === "female");
    $("genderMale").setAttribute("aria-pressed", g === "male");
    $("genderFemale").setAttribute("aria-pressed", g === "female");
  };
  $("genderMale").addEventListener("click", () => setGender("male"));
  $("genderFemale").addEventListener("click", () => setGender("female"));

  // 生年月日：手入力欄とカレンダーを相互に同期させる
  // カレンダーで選んだら → 年・月・日の手入力欄に反映
  $("inDate").addEventListener("change", (e) => {
    const m = (e.target.value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return;
    $("inYearNum").value = +m[1];
    $("inMonthNum").value = +m[2];
    $("inDayNum").value = +m[3];
  });
  // 手入力したら → カレンダー側の日付にも反映（次に開いたとき同じ日が出る）
  const syncToPicker = () => {
    const y = +$("inYearNum").value, mo = +$("inMonthNum").value, d = +$("inDayNum").value;
    if (y >= 1940 && y <= 2050 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      $("inDate").value = `${y}-${pad2(mo)}-${pad2(d)}`;
    }
  };
  ["inYearNum", "inMonthNum", "inDayNum"].forEach(id =>
    $(id).addEventListener("change", syncToPicker));

  $("inputForm").addEventListener("submit", (e) => {
    e.preventDefault();
    $("errorMsg").textContent = "";
    try {
      // 流派設定を反映
      CONFIG.dayChangeMode = $("cfgDayChange").value;
      CONFIG.zokanMode = $("cfgZokanMode").value;
      CONFIG.gogyoCount.chishi = $("cfgGogyoBranch").value === "on";

      // 生年月日：手入力欄（年・月・日）から読み取る
      // ※カレンダーで選んだ場合も、この3欄に自動反映されている
      const y = String($("inYearNum").value ?? "").trim();
      const mo = String($("inMonthNum").value ?? "").trim();
      const d = String($("inDayNum").value ?? "").trim();
      if (!y || !mo || !d) throw new Error("生年月日を入力してください（手入力、またはカレンダーボタンから選べます）。");

      const hourVal = $("inHour").value;
      const minVal = $("inMinute").value;
      const hourUnknown = hourVal === "u";               // 出生時が不明
      const minuteUnknown = !hourUnknown && minVal === "u"; // 分のみ不明
      const input = {
        name: $("inName").value,
        year: +y, month: +mo, day: +d,
        // 時刻不明の場合は内部的に正午12時0分と仮定する
        // （日柱は時刻に依存せず、節入り当日の月柱判定の誤差が最小になるため）
        hour: hourUnknown ? 12 : +hourVal,
        minute: (hourUnknown || minuteUnknown) ? 0 : +minVal,
        hourUnknown, minuteUnknown,
        gender: selectedGender,
        saiunYear: +$("inSaiunYear").value,
      };
      validateDate(input);
      lastResult = calcMeishiki(input);
      render(lastResult);
    } catch (err) {
      $("errorMsg").textContent = err.message;
      showInputScreen();
      $("errorMsg").textContent = err.message; // 画面切替後にエラー文を再表示
    }
  });
}

function validateDate({ year, month, day }) {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    throw new Error("存在しない日付です。生年月日を確認してください。");
  }
  if (year < 1940 || year > 2050) {
    throw new Error("対応範囲は1940年〜2050年です。");
  }
}

/* ---------- 結果の描画 ---------- */
// 表示順：時柱→日柱→月柱→年柱（計算結果 pillars は 年月日時 のまま。表示だけ並べ替える）
const DISPLAY_ORDER = [3, 2, 1, 0];

// 表示用の読み仮名（計算には使いません）
const STEM_READING = { 甲:"きのえ", 乙:"きのと", 丙:"ひのえ", 丁:"ひのと", 戊:"つちのえ",
                       己:"つちのと", 庚:"かのえ", 辛:"かのと", 壬:"みずのえ", 癸:"みずのと" };
const BRANCH_READING = { 子:"ね", 丑:"うし", 寅:"とら", 卯:"う", 辰:"たつ", 巳:"み",
                         午:"うま", 未:"ひつじ", 申:"さる", 酉:"とり", 戌:"いぬ", 亥:"い" };

function render(r) {
  const g = r.input.gender === "female" ? "女性" : "男性";
  const name = (r.input.name || "").trim();
  $("resultTitle").textContent = name ? `${name}さんの命式` : "あなたの命式";
  // 時刻表示：不明の場合はその旨を明記
  let timeText;
  if (r.input.hourUnknown) timeText = "出生時刻不明";
  else if (r.input.minuteUnknown) timeText = `${pad2(r.input.hour)}時頃（分不明）`;
  else timeText = `${pad2(r.input.hour)}時${pad2(r.input.minute)}分頃`;
  $("birthSummary").textContent =
    `${r.input.year}年${r.input.month}月${r.input.day}日 ${timeText}（${g}）`;

  // 命式表の本体：左から 時柱・日柱・月柱・年柱（1つの表のままスマホ幅に収める）
  const op = DISPLAY_ORDER.map(pi => r.pillars[pi]); // 表示順に並べた4柱
  const cell = (fn) => op.map(fn).join("");
  const readS = (ch) => STEM_READING[ch] || "不明";   // 時刻不明（ー）のときの読みガード
  const readB = (ch) => BRANCH_READING[ch] || "不明";
  $("meishikiBody").innerHTML = `
    <tr class="row-kan">
      <th class="row-label">天干</th>
      ${cell(p => `<td><span class="main-kanji">${p.stemName}</span><span class="sub-text">${readS(p.stemName)}</span></td>`)}
    </tr>
    <tr class="row-shi">
      <th class="row-label">地支</th>
      ${cell(p => `<td><span class="main-kanji">${p.branch}</span><span class="sub-text">${readB(p.branch)}</span></td>`)}
    </tr>
    <tr>
      <th class="row-label">蔵干</th>
      ${cell(p => `<td><span class="mid-kanji">${p.zokan}</span><span class="sub-text">${readS(p.zokan)}</span></td>`)}
    </tr>
    <tr>
      <th class="row-label">天干<br>通変星</th>
      ${cell(p => `<td><span class="star-text">${p.tsuhen}</span></td>`)}
    </tr>
    <tr>
      <th class="row-label">地支<br>通変星</th>
      ${cell(p => `<td><span class="star-text">${p.zokanTsuhen}</span>${
        // 元命：月支の「採用蔵干」の通変星（日干基準）。月柱にのみ表示
        p.name === "月柱" ? '<span class="genmei-tag">[元命]</span>' : ""
      }</td>`)}
    </tr>
    <tr>
      <th class="row-label">十二<br>運星</th>
      ${cell(p => `<td><span class="star-text">${p.juniun}</span></td>`)}
    </tr>
    <tr>
      <th class="row-label">吉凶<br>神殺星</th>
      ${(() => {
        // 表示順 時→日→月→年 に合わせて kisatsu を並べ替え
        const kOrder = [r.kisatsu.hour, r.kisatsu.day, r.kisatsu.month, r.kisatsu.year];
        return kOrder.map(list =>
          `<td><span class="star-list">${list.length ? list.join("<br>") : "ー"}</span></td>`).join("");
      })()}
    </tr>`;

  $("kuboText").textContent = r.kubo.split("").join("・");

  // 身旺・身弱レベル（空亡の横のカード）
  $("mioText").innerHTML =
    `${r.shiou.level} ${r.shiou.score}<small>（${r.shiou.getsureiText}）</small>`;
  $("shiouComment").textContent =
    `判定：${r.shiou.getsureiText}（月柱十二運：${r.shiou.monthJuniun}）／ ${r.shiou.comment}`;

  // 五行バランス：木火土金水の横並びカード
  // 日主（日干）と、その五行＝自己の五行
  const dayStemName = STEMS[r.dayStem];
  const selfElement = GOGYO_NAMES[stemElement(r.dayStem)];
  const selfCount = r.gogyo.count[stemElement(r.dayStem)];
  $("nisshuBox").innerHTML = `
    <div class="nisshu-item">
      <span class="nisshu-label">日主（日干）</span>
      <span class="nisshu-value">${dayStemName}<small>${STEM_READING[dayStemName]}</small></span>
    </div>
    <div class="nisshu-item">
      <span class="nisshu-label">自己の五行</span>
      <span class="nisshu-value g-${selfElement}">${selfElement}<small>命式内に ${selfCount}</small></span>
    </div>`;

  $("gogyoCards").innerHTML = GOGYO_NAMES.map((n, i) => `
    <div class="gogyo-card g-${n}${n === selfElement ? " is-self" : ""}">
      <span class="g-name">${n}</span>
      <span class="g-count">${r.gogyo.count[i]}</span>
    </div>`).join("");

  // 五行の内訳・カウント方法の説明は表示しない（グラフカードのみ）
  $("gogyoDetail").innerHTML = "";

  // 節入りと蔵干の根拠
  const zokanLines = r.pillars.map(p =>
    p.unknown
      ? `<p>${p.name}：出生時刻不明のため判定なし</p>`
      : `<p>${p.name}（${p.branch}）：蔵干候補 ${p.zokanCandidates} → 採用 <strong>${p.zokan}</strong>
     <span class="rule-line">（ルール：${p.zokanRule}）</span></p>`).join("");
  const unknownNote = r.input.hourUnknown
    ? `<p class="rule-line">※出生時刻不明のため、節入り経過日数・大運開始は正午12時と仮定して計算しています。節入り当日生まれの場合は、実際の出生時刻により月柱・蔵干・大運が変わる可能性があります。</p>`
    : (r.input.minuteUnknown
      ? `<p class="rule-line">※分が不明のため、0分と仮定して計算しています。</p>` : "");
  $("setsuiriDetail").innerHTML = `
    <p>年柱の基準：立春 ${fmtMs(r.risshunMs)} → ${r.risshunYear}年（立春年）の干支を採用</p>
    <p>月柱の節入り：<strong>${r.term.name}</strong>（${fmtMs(r.term.ms)}）→ ${r.term.branch}月</p>
    <p>節入り後経過：${r.elapsedDays.toFixed(2)}日（<strong>${r.dayCount}日目</strong>）</p>
    <p>蔵干の採り方：${CONFIG.zokanMode === "honki" ? "本気固定" : "節入り後日数で採用"}</p>
    ${unknownNote}
    ${zokanLines}`;

  // 大運
  const t = r.taiun;
  $("taiunSummary").innerHTML =
    `${t.forward ? "順行" : "逆行"}（${r.input.gender === "female" ? "女性" : "男性"}・年干${stemIsYang(r.pillars[0].stem) ? "陽" : "陰"}）／
     ${t.forward ? "次の節入り" : "前の節入り"}「${t.refTerm.name}」まで ${t.diffDays.toFixed(2)}日 ÷ 3 →
     大運開始 <strong>${t.startAgeText}</strong>`;
  $("taiunTable").innerHTML =
    `<tr><th>開始年齢</th><th>年代</th><th>干支</th><th>通変星</th><th>十二運</th></tr>` +
    t.list.map((u, n) => `
      <tr>
        <td>${u.fromAge}歳${n === 0 && CONFIG.taiunRounding === "ym" ? t.startAge.m + "ヶ月" : ""}〜</td>
        <td>${r.input.year + u.fromAge}年頃〜</td>
        <td class="kanshi-cell">${u.kanshi}</td>
        <td>${u.tsuhen}</td><td>${u.juniun}</td>
      </tr>`).join("");

  // 歳運
  $("saiunTable").innerHTML =
    `<tr><th>年</th><th>干支</th><th>通変星</th><th>十二運</th></tr>` +
    r.saiun.map(s => `
      <tr class="${s.isCenter ? "current-year" : ""}">
        <td>${s.year}年</td>
        <td class="kanshi-cell">${s.kanshi}</td>
        <td>${s.tsuhen}</td><td>${s.juniun}</td>
      </tr>`).join("");

  // 入力画面を隠して結果画面に切り替える
  showResultScreen();
}

/* ============================================================
   画面の切り替え（入力画面 ⇄ 結果画面）
   ============================================================ */
function showResultScreen() {
  $("inputForm").hidden = true;
  $("bgSettings").hidden = true;
  $("resultArea").hidden = false;
  $("resultActions").hidden = false;
  $("resultBottom").hidden = false;
  window.scrollTo(0, 0); // 結果の先頭から表示する
}

function showInputScreen() {
  $("resultArea").hidden = true;
  $("resultActions").hidden = true;
  $("resultBottom").hidden = true;
  $("inputForm").hidden = false;
  $("bgSettings").hidden = false;
  $("errorMsg").textContent = "";
  window.scrollTo(0, 0);
}

/* ============================================================
   コピー機能はここ
   ============================================================ */
function buildCopyText(r) {
  // 表示形式（表／カード）には依存せず、計算結果データから直接生成する
  // 並び順は画面と同じ 時柱→日柱→月柱→年柱
  const g = r.input.gender === "female" ? "女性" : "男性";
  const nm = (r.input.name || "").trim();
  const ordered = DISPLAY_ORDER.map(pi => r.pillars[pi]);
  const lines = [];
  lines.push(nm ? `【${nm}さんの命式】` : "【命式】");
  const copyTime = r.input.hourUnknown ? "時刻不明"
    : r.input.minuteUnknown ? `${pad2(r.input.hour)}時（分不明）`
    : `${pad2(r.input.hour)}時${pad2(r.input.minute)}分`;
  lines.push(`生年月日：${r.input.year}年${r.input.month}月${r.input.day}日 ${copyTime}`);
  lines.push(`性別：${g}`, "");
  ordered.forEach(p => lines.push(`${p.name}：${p.unknown ? "ー（時刻不明）" : p.stemName + p.branch}`));
  lines.push("", "【詳細】");
  ordered.forEach(p => lines.push(
    `${p.name} 天干：${p.stemName}　地支：${p.branch}　蔵干：${p.zokan}　天干通変星：${p.tsuhen}　地支通変星：${p.zokanTsuhen}${p.name === "月柱" ? "[元命]" : ""}　十二運星：${p.juniun}`));
  lines.push("", `空亡：${r.kubo.split("").join("・")}`);
  lines.push(`身旺 / 身弱：${r.shiou.level} ${r.shiou.score}（${r.shiou.getsureiText}）`);
  lines.push("", "神殺星：");
  const kMap = [["時柱", r.kisatsu.hour], ["日柱", r.kisatsu.day], ["月柱", r.kisatsu.month], ["年柱", r.kisatsu.year]];
  kMap.forEach(([nm2, list]) => lines.push(`${nm2}：${list.length ? list.join("・") : "ー"}`));
  lines.push("", `日主（日干）：${STEMS[r.dayStem]}　自己の五行：${GOGYO_NAMES[stemElement(r.dayStem)]}`);
  lines.push(`五行バランス：${GOGYO_NAMES.map((n, i) => `${n}${r.gogyo.count[i]}`).join(" ")}`);
  lines.push(`節入り：${r.term.name}（${fmtMs(r.term.ms)}）／ 節入り後${r.dayCount}日目`);
  lines.push("", `大運（${r.taiun.forward ? "順行" : "逆行"}・開始${r.taiun.startAgeText}）：`);
  r.taiun.list.forEach(u => lines.push(`　${u.fromAge}歳〜 ${u.kanshi}（${u.tsuhen}・${u.juniun}）`));
  lines.push("", "歳運：");
  r.saiun.forEach(s => lines.push(`　${s.year}年 ${s.kanshi}（${s.tsuhen}・${s.juniun}）`));
  return lines.join("\n");
}

function initCopy() {
  $("copyResultBtn").addEventListener("click", async () => {
    if (!lastResult) return;
    const msg = $("copyMsg");
    try {
      await navigator.clipboard.writeText(buildCopyText(lastResult));
      msg.textContent = "コピーしました";
    } catch (e) {
      msg.textContent = "コピーに失敗しました。手動で選択してください。";
    }
    setTimeout(() => { msg.textContent = ""; }, 4000);
  });
}

/* ============================================================
   画像保存機能はここ
   ------------------------------------------------------------
   結果エリア全体（#resultArea）を html2canvas で1枚のPNGにする。
   スクロールして数回スクショを撮らなくても、命式表・空亡・
   身旺身弱・五行・大運・歳運がまとめて1枚に収まる。
   ============================================================ */
function imgFileName(r) {
  const t = r.input.hourUnknown ? "unknown" : `${pad2(r.input.hour)}${pad2(r.input.minute)}`;
  return `meishiki_${r.input.year}-${pad2(r.input.month)}-${pad2(r.input.day)}_${t}.png`;
}

async function downloadImage() {
  if (!lastResult) return;
  const msg = $("copyMsg");
  if (typeof html2canvas !== "function") {
    msg.textContent = "画像ライブラリを読み込めませんでした。";
    setTimeout(() => { msg.textContent = ""; }, 4000);
    return;
  }
  // 折りたたみ部分も画像に含めるため、キャプチャ中だけ開いておく
  const blocks = [...document.querySelectorAll("#resultArea .detail-block")];
  const wasOpen = blocks.map(b => b.open);
  blocks.forEach(b => { b.open = true; });
  msg.textContent = "画像を作成中…";
  try {
    const canvas = await html2canvas($("resultArea"), { scale: 2, backgroundColor: "#f5ede0" });
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = imgFileName(lastResult);
    a.click();
    msg.textContent = "画像を保存しました";
  } catch (e) {
    msg.textContent = "画像の作成に失敗しました。";
  } finally {
    blocks.forEach((b, i) => { b.open = wasOpen[i]; });
    setTimeout(() => { msg.textContent = ""; }, 4000);
  }
}

/* ============================================================
   PDF保存機能はここ
   ------------------------------------------------------------
   方法A：html2canvas + jsPDF で #resultArea をPDF化
   方法B：ライブラリが使えない・失敗した場合は window.print()
          （ブラウザの印刷画面から「PDFとして保存」）
   ============================================================ */
function pdfFileName(r) {
  const t = r.input.hourUnknown ? "unknown" : `${pad2(r.input.hour)}${pad2(r.input.minute)}`;
  return `meishiki_${r.input.year}-${pad2(r.input.month)}-${pad2(r.input.day)}_${t}.pdf`;
}

async function downloadPdf() {
  if (!lastResult) return;
  const area = $("resultArea");
  const hasLibs = typeof html2canvas === "function" && window.jspdf && window.jspdf.jsPDF;

  if (!hasLibs) {
    alert("PDFライブラリを読み込めなかったため、印刷画面を開きます。\n印刷先で「PDFとして保存」を選んでください。");
    window.print();
    return;
  }
  // 折りたたみ部分もPDFに含めるため、キャプチャ中だけ開いておく
  const blocks = [...document.querySelectorAll("#resultArea .detail-block")];
  const wasOpen = blocks.map(b => b.open);
  blocks.forEach(b => { b.open = true; });
  try {
    const canvas = await html2canvas(area, { scale: 2, backgroundColor: "#ffffff" });
    const pdf = new window.jspdf.jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pageW = 210, pageH = 297, margin = 10;
    const imgW = pageW - margin * 2;
    const imgH = canvas.height * imgW / canvas.width;
    // 縦に長い場合は複数ページに分割
    let remaining = imgH, pos = 0, page = 0;
    while (remaining > 0) {
      if (page > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", margin, margin - pos, imgW, imgH);
      remaining -= (pageH - margin * 2);
      pos += (pageH - margin * 2);
      page++;
    }
    pdf.save(pdfFileName(lastResult));
  } catch (e) {
    alert("PDFの作成に失敗したため、印刷画面を開きます。\n印刷先で「PDFとして保存」を選んでください。");
    window.print();
  } finally {
    blocks.forEach((b, i) => { b.open = wasOpen[i]; }); // 開閉状態を元に戻す
  }
}

/* ============================================================
   背景色設定はここで管理（JS部分）
   ------------------------------------------------------------
   ・カラーピッカー / プリセット / リセット
   ・localStorage に保存して次回も維持
   ・暗い背景では文字色・カード色を自動調整
   ============================================================ */
const DEFAULT_BG = "#f5ede0";
const BG_PRESETS = [
  { name: "生成り",     color: "#f5ede0" },
  { name: "薄いベージュ", color: "#efe4cd" },
  { name: "淡いピンク",  color: "#f6e4e4" },
  { name: "淡いグリーン", color: "#e7efe1" },
  { name: "淡いブルー",  color: "#e4ecf2" },
  { name: "墨色",       color: "#2b2b2b" },
  { name: "白",         color: "#ffffff" },
];

function luminance(hex) { // 0(暗)〜1(明)
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// 背景の明るさに応じて文字・カード色を自動調整する関数
// 背景色は「枠の外の余白」だけに適用する。
// カード（枠の中）の色・文字色は基本カラーで固定。
// 余白の上に直接載っている文字（フッターなど）だけ、暗い背景のとき明るくする。
function applyBgColor(hex) {
  const root = document.documentElement.style;
  root.setProperty("--bg-color", hex);
  if (luminance(hex) < 0.45) {
    root.setProperty("--page-text", "rgba(242, 234, 216, 0.8)"); // 暗い余白用の明るい文字
  } else {
    root.setProperty("--page-text", "rgba(42, 31, 14, 0.62)");
  }
  $("bgColorPicker").value = hex;
  try { localStorage.setItem("meishiki_bg", hex); } catch (e) { /* 保存不可環境では無視 */ }
}

function initBgColor() {
  // プリセットボタンを生成
  const row = $("presetRow");
  BG_PRESETS.forEach(p => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "preset-btn";
    b.style.background = p.color;
    b.title = p.name;
    b.setAttribute("aria-label", `背景色：${p.name}`);
    b.addEventListener("click", () => applyBgColor(p.color));
    row.appendChild(b);
  });
  $("bgColorPicker").addEventListener("input", (e) => applyBgColor(e.target.value));
  $("bgResetBtn").addEventListener("click", () => applyBgColor(DEFAULT_BG));

  // 前回の色を復元
  let saved = null;
  try { saved = localStorage.getItem("meishiki_bg"); } catch (e) { /* 無視 */ }
  applyBgColor(saved || DEFAULT_BG);
}

/* ============================================================
   起動
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  if (typeof SETSUIRI_DATA === "undefined") {
    document.body.insertAdjacentHTML("afterbegin",
      '<p class="error">節入りデータ（data/setsuiriData.js）が読み込めていません。index.html の読み込み順を確認してください。</p>');
    return;
  }
  initForm();
  initCopy();
  initBgColor();
  $("downloadImgBtn").addEventListener("click", downloadImage);
  $("downloadPdfBtn").addEventListener("click", downloadPdf);
  // 再鑑定ボタン（上下2か所）→ 入力画面に戻る
  $("backBtn").addEventListener("click", showInputScreen);
  $("backBtnBottom").addEventListener("click", showInputScreen);
});

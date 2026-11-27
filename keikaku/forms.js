/* 計画相談 様式アプリ ― 様式（入力フォーム付きPDF）への転記の定義とエンジン
 * ブラウザでは window.KS、node では module.exports で使えます。
 * 欄の名前・位置は Google ドライブ【100】アプリ › 計画相談 › 入力ホーム付様式 の PDF から調べたものです。
 */
(function (root) {
  'use strict';

  // ---------- 値の取り出し ----------
  const s = x => (x == null ? '' : String(x)).trim();
  const first = (d, keys) => { for (const k of keys) { const v = s(d[k]); if (v) return v; } return ''; };
  const val = (d, spec) => typeof spec === 'function' ? s(spec(d)) : Array.isArray(spec) ? first(d, spec) : s(d[spec]);
  const num = x => s(x).replace(/[^0-9０-９.．]/g, '').replace(/[０-９．]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const join = (...parts) => parts.filter(p => s(p)).join('\n');
  const ymd = (d, k, part) => num(d[k + part]);

  const DAYS = ['月', '火', '水', '木', '金', '土', '日'];
  const DAY_EN = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  // 週間の予定（ブロック）を 7日×24時間 のマスにする。最初の時間に内容、続く時間は「↓」
  function weekCells(blocks) {
    const c = DAYS.map(() => Array(24).fill(''));
    (blocks || []).forEach(b => {
      const t = s(b && b.t); if (!t) return;
      const st = Number(b.s), en = Number(b.e); if (!(st >= 0 && st < 24 && en >= 0 && en <= 24)) return;
      const len = ((en - st + 24) % 24) || 24;
      for (let i = 0; i < len; i++) {
        const h = (st + i) % 24, txt = i === 0 ? t : '↓';
        (b.days || []).forEach(dy => {
          if (!(dy >= 0 && dy < 7)) return;
          const cur = c[dy][h];
          if (!cur || cur === '↓') c[dy][h] = txt;
          else if (txt !== '↓' && !cur.split('・').includes(txt)) c[dy][h] = cur + '・' + txt;
        });
      }
    });
    return c;
  }

  // ---------- 一次アセスメントの表 ----------
  const ASMT_COLS = ['現状', '本人の希望', '本人の選好', '記入者の気づき', '記入者以外の気づき'];
  const ASMT = [
    { s: 1, page: 'p3', title: '1 生活基盤・日常生活に関する領域', rows: ['住環境', '経済環境'] },
    { s: 2, page: 'p3', title: '2 社会参加に関する領域（教育、就労を含む）', rows: ['趣味・旅行・レクリエーション', '当事者団体の活動', '自治会への参加', 'その他各種社会的活動・就労'] },
    { s: 3, page: 'p3', title: '3 コミュニケーションや意思決定、社会生活技能に関する領域', rows: ['意思表明', '意思決定', '他者からの意思伝達の理解', 'コミュニケーションツールの使用・対人関係', '屋外移動やその手段（長距離、遠距離）', '金銭管理'] },
    { s: 4, page: 'p4', title: '4 日常生活に関する領域', rows: ['身辺のこと', '調理', '食事', '入浴', '清掃・整理整頓', '洗濯', '書類整理・事務手続き', '買い物'] },
    { s: 5, page: 'p4', title: '5 健康に関する領域', rows: ['体力', '健康状態', '医療機関利用状況', '医療費・健康保険', '障害'] }
  ];
  const PRI_COLS = [['need', '解決すべき課題（本人のニーズ）'], ['goal', '支援目標'], ['when', '達成時期'], ['service', '福祉サービス等 種類・内容・量（頻度・時間）'], ['role', '課題解決のための本人の役割'], ['evalWhen', '評価時期'], ['note', 'その他留意事項']];
  const SUP_COLS = [['name', '名称'], ['org', '提供機関・提供者'], ['content', '支援内容'], ['freq', '頻度'], ['note', '備考']];

  // ---------- 様式ごとの欄 ----------
  // [PDFの欄名, 画面での名前, 値（キー / キーの配列＝前から空でないもの / 関数）, オプション]
  //   オプション t: 'cb' チェック, 'tl' 1日の流れ（時刻の位置に書く）, 'grid' 週間表のマス（一覧では省略）
  //   uses: 関数のときに使っているキー（「反映先」の表示用）
  const self = d => !!d.printSelf;
  const F = {};

  F.f1 = [
    ['trainee_id', '受講番号', 'tNo'], ['trainee_name', '受講者氏名', 'tName'],
    ['case_title', '事例タイトル', 'caseTitle'],
    ['client_initial', '利用者（イニシャル）', 'initial'],
    ['client_age', '年齢', d => num(d.age), { uses: ['age'] }],
    ['sex_male', '性別 男', d => d.sex === '男', { t: 'cb', uses: ['sex'] }],
    ['sex_female', '性別 女', d => d.sex === '女', { t: 'cb', uses: ['sex'] }],
    ['family_comp', '家族構成', 'famShort'], ['residence_years', '現在の地域の居住歴（年）', d => num(d.residYears), { uses: ['residYears'] }],
    ['handbook_grade', '手帳の種類・等級', 'handbook'], ['support_level', '障害支援区分', 'kubun'],
    ['life_history', '生活歴', 'lifeHist'], ['medical_history', '病歴', 'medHist'],
    ['consultation_bg', '相談の経緯', 'consultBg'],
    ['desired_life', '主訴・困っていること・望む暮らし', ['desiredLife', 'wishSelf']],
    ['issues_client_family', '本人・家族の問題', 'issues'],
    ['ability_env', '本人の能力・環境的な問題', 'abilityEnv'],
    ['hobbies_strengths', '本人の趣味・趣向・長所', 'hobbies'],
    ['other_notes', 'その他気付いたこと', 'otherNotes']
  ];

  F.f2 = [
    ['p1_trainee_info', '受講番号・氏名', d => [s(d.tNo), s(d.tName)].filter(Boolean).join('　'), { uses: ['tNo', 'tName'] }],
    ['p1_c_1', '① 第一印象（本人像）', 'sFirst'],
    ['p1_c_4', '② 性格・人柄／個人的特性', 'sPersonality'], ['p1_c_5', '② 才能・素質', 'sTalent'],
    ['p1_c_8', '② 環境のストレングス', 'sEnv'], ['p1_c_9', '② 興味・関心／向上心', 'sInterest']
  ];

  const birthText = d => { const y = num(d.birthYr); return y ? `${s(d.era) || ''}${y}年` : ''; };
  F.f3 = [
    ['p2_c_4', '受講番号', 'tNo'], ['p2_c_5', '氏名', 'tName'], ['p2_c_6', '作成日', 'made'],
    ['p2_furigana', 'ふりがな', 'kana'], ['p2_initial', 'イニシャル', 'initial'],
    ['p2_c_12', '性別', 'sex'], ['p2_c_11', '住所', 'address'],
    ['p2_c_14', '生年月日', birthText, { uses: ['era', 'birthYr'] }], ['p2_u_15', '年齢', d => num(d.age), { uses: ['age'] }],
    ['p2_c_17', '連絡先', 'contact'],
    ['p2_box_18', '本人の要望・希望するくらし', 'wishSelf'], ['p2_box_19', '家族の要望・希望するくらし', 'wishFamily'],
    ['p2_tl_wd_232', '希望する一日の流れ（平日）', 'tlHopeWd', { t: 'tl' }],
    ['p2_tl_hd_232', '希望する一日の流れ（休日）', 'tlHopeHd', { t: 'tl' }],
    ['p2_tl_wd_296', '生活状況・普通の1日（平日）', 'tlNowWd', { t: 'tl' }],
    ['p2_tl_hd_296', '生活状況・普通の1日（休日）', 'tlNowHd', { t: 'tl' }],
    ['p2_tl_362', 'その他の1日の生活の流れ', 'tlOther', { t: 'tl' }],
    ['p2_life_history', '生活歴（病歴含む）', d => join(d.lifeHist, s(d.medHist) ? '【病歴】' + s(d.medHist) : ''), { uses: ['lifeHist', 'medHist'] }],
    ['p2_box_70', 'ジェノグラム', 'genogram'], ['p2_box_71', 'エコマップ', 'ecomap']
  ];
  ASMT.forEach(g => g.rows.forEach((r, ri) => ASMT_COLS.forEach((c, ci) => {
    const k = `a${g.s}_${ri + 1}_${ci + 1}`;
    F.f3.push([`${g.page}_s${g.s}_r${ri + 1}_c${ci + 1}`, `${g.s}.${r}／${c}`, k]);
  })));
  [12, 18].forEach((base, ri) => {
    F.f3.push([`p4_c_${base}`, `6 家族支援 ${ri + 1}行目／項目`, `fam${ri + 1}_item`]);
    ASMT_COLS.forEach((c, ci) => F.f3.push([`p4_c_${base + 1 + ci}`, `6 家族支援 ${ri + 1}行目／${c}`, `fam${ri + 1}_${ci + 1}`]));
  });
  F.f3.push(['p4_responder_summary', '対応者所見のまとめ', 'asmtSummary']);

  F.f4 = [
    ['p5_trainee_info', '受講番号・氏名', d => [s(d.tNo), s(d.tName)].filter(Boolean).join('　'), { uses: ['tNo', 'tName'] }],
    ['p5_client_wish', '本人の表明している希望・解決したい課題', ['nWish', 'wishSelf']],
    ['p5_creator_info', '（作成者の）おさえておきたい情報', 'nInfo'],
    ['p5_c_8', '生物的なこと', 'nBio'], ['p5_c_9', '心理的なこと', 'nPsy'], ['p5_c_10', '社会性・対人関係の特徴', 'nSocial'],
    ['p5_c_12', '環境', 'nEnv'], ['p5_c_5', '理解・解釈・仮説②', 'nHyp2'],
    ['p5_c_6', '支援課題', 'nTask'], ['p5_c_7', '対応・方針', 'nPolicy'],
    ['p5_c_14', '大づかみに捉えた本人像（100文字程度）', 'nSummary']
  ];

  const copayLabel = d => s(d.copay) ? '利用者負担上限額' : '';
  F.f5 = [
    ['p1_c_1', '受講番号', 'tNo'], ['p1_c_3', '氏名', 'tName'],
    ['p1_c_6', '利用者氏名（イニシャル）', 'initial'], ['p1_c_8', '障害支援区分', 'kubun'],
    ['p1_c_10', '相談支援事業者名', 'agency'], ['p1_c_12', '障害福祉サービス受給者証番号', 'jukyuNo'],
    ['p1_c_13', '（見出し）利用者負担上限額', copayLabel, { uses: ['copay'] }], ['p1_c_14', '利用者負担上限額', 'copay'],
    ['p1_c_16', '計画作成担当者', 'planner'], ['p1_c_18', '地域相談支援受給者証番号', 'chiikiNo'],
    ['p1_c_20', '通所受給者証番号', 'tsushoNo'], ['p1_c_22', '計画案作成日', 'made'],
    ['p1_c_24', 'モニタリング期間（開始年月）', 'monitor'],
    ['p1_c_29', '生活に対する意向（本人）', ['pWishSelf', 'wishSelf']],
    ['p1_c_31', '生活に対する意向（家族）', ['pWishFam', 'wishFamily']],
    ['p1_c_32', '総合的な援助の方針', 'policy'], ['p1_c_34', '長期目標', 'longGoal'], ['p1_c_36', '短期目標', 'shortGoal']
  ];
  for (let r = 0; r < 6; r++) PRI_COLS.forEach(([k, lab], ci) => F.f5.push([`p1_c_${46 + r * 8 + ci}`, `優先順位${r + 1}／${lab}`, d => d.pri && d.pri[r] && d.pri[r][k], { uses: ['pri'] }]));

  const weekField = (blocksKey, name) => d => weekCells(d[blocksKey]);
  F.f6 = [
    ['p2_c_1', '受講番号', 'tNo'], ['p2_c_3', '氏名', 'tName'],
    ['p2_c_6', '利用者氏名（イニシャル）', 'initial'], ['p2_c_8', '障害支援区分', 'kubun'],
    ['p2_c_10', '相談支援事業者名', 'agency'], ['p2_c_12', '障害福祉サービス受給者証番号', 'jukyuNo'],
    ['p2_c_13', '（見出し）利用者負担上限額', copayLabel, { uses: ['copay'] }], ['p2_c_14', '利用者負担上限額', 'copay'],
    ['p2_c_16', '計画作成担当者', 'planner'], ['p2_c_18', '地域相談支援受給者証番号', 'chiikiNo'],
    ['p2_c_20', '通所受給者証番号', 'tsushoNo'], ['p2_c_22', '計画開始年月', 'planStart'],
    ['p2_c_35', '主な日常生活上の活動', 'mainAct6'], ['p2_non_weekly', '週単位以外のサービス', 'nonWeekly6'],
    ['p2_c_177', 'サービス提供によって実現する生活の全体像', 'whole']
  ];
  for (let r = 1; r <= 25; r++) {
    const h = (r + 3) % 24;
    DAY_EN.forEach((en, dy) => F.f6.push([`sched_${en}_r${String(r).padStart(2, '0')}`, `週間計画 ${DAYS[dy]} ${h}時`, d => weekCells(d.wkPlan)[dy][h], { t: 'grid', uses: ['wkPlan'] }]));
  }

  F.f7 = [
    ['p3_trainee_id', '受講番号', 'tNo'], ['p3_c_4', '氏名', 'tName'],
    ['p3_c_6', '作成日', 'made'], ['p3_c_8', '相談支援事業者名', 'agency'], ['p3_c_10', '計画作成担当者', 'planner'],
    ['p3_c_11', '1. 概要（支援経過・現状と課題等）', 'overview'],
    ['p3_c_13', '氏名（イニシャル）', 'initial'],
    ['p3_birth_yr', '生年（年）', d => num(d.birthYr), { uses: ['birthYr'] }],
    ['p3_age_num', '年齢', d => num(d.age), { uses: ['age'] }],
    ['p3_addr_city', '住所（市町村のイニシャル）', 'city'],
    ['p3_housing_other', '住まい その他（　）', d => d.housing === 'その他' ? d.housingOther : '', { uses: ['housing', 'housingOther'] }],
    ['p3_c_21', '電話番号', 'tel'], ['p3_c_24', 'FAX番号', 'fax'],
    ['p3_c_26', '障害または疾患名', 'disease'], ['p3_c_28', '障害支援区分', 'kubun'],
    ['p3_sex_m', '性別 男', d => d.sex === '男', { t: 'cb', uses: ['sex'] }],
    ['p3_sex_f', '性別 女', d => d.sex === '女', { t: 'cb', uses: ['sex'] }],
    ['p3_area_31', '家族構成', 'famDetail'], ['p3_area_32', '社会関係図', 'socialMap'],
    ['p3_area_33', '生活歴（受診歴等含む）', d => join(d.lifeHist, s(d.medHist) ? '【受診歴等】' + s(d.medHist) : ''), { uses: ['lifeHist', 'medHist'] }],
    ['p3_area_34', '医療の状況', 'medStatus'],
    ['p3_area_35', '本人の主訴（意向・希望）', 'wishSelf'], ['p3_area_36', '家族の主訴（意向・希望）', 'wishFamily']
  ];
  [['supPub', 44, '公的支援'], ['supOth', 50, 'その他の支援']].forEach(([k, base, lab]) => SUP_COLS.forEach(([c, cl], ci) =>
    F.f7.push([`p3_c_${base + ci}`, `3. 支援の状況 ${lab}／${cl}`, d => d[k] && d[k][c], { uses: [k] }])));

  F.f8 = [
    ['p4_c_2', '受講番号', 'tNo'], ['p4_c_4', '氏名', 'tName'],
    ['p4_c_6', '利用者氏名（イニシャル）', 'initial'], ['p4_c_8', '障害支援区分', 'kubun'],
    ['p4_c_10', '相談支援事業者名', 'agency'], ['p4_c_12', '計画作成担当者', 'planner'],
    ['p4_c_27', '主な日常生活上の活動', 'mainAct8'], ['p4_c_113', '週単位以外のサービス', 'nonWeekly8']
  ];
  // 別紙２の時間割：上から 4時,5時,…,3時,4時 の25行。0〜3時の行は曜日の区切りがない1マス
  const rows8 = [];
  rows8.push([20, 21, 22, 23, 24, 25, 26]);
  for (let r = 1; r <= 12; r++) rows8.push([0, 1, 2, 3, 4, 5, 6].map(i => 28 + (r - 1) * 7 + i));
  for (let r = 13; r <= 19; r++) rows8.push([0, 1, 2, 3, 4, 5, 6].map(i => 114 + (r - 13) * 7 + i));
  for (let r = 20; r <= 23; r++) rows8.push(163 + r - 20);
  rows8.push([167, 168, 169, 170, 171, 172, 173]);
  rows8.forEach((row, ri) => {
    const h = (ri + 4) % 24;
    if (Array.isArray(row)) row.forEach((n, dy) => F.f8.push([`p4_c_${n}`, `現在の生活 ${DAYS[dy]} ${h}時`, d => weekCells(d.wkNow)[dy][h], { t: 'grid', uses: ['wkNow'] }]));
    else F.f8.push([`p4_c_${row}`, `現在の生活 全曜日 ${h}時`, d => {
      const vals = weekCells(d.wkNow).map(c => c[h]); const u = [...new Set(vals.filter(Boolean))];
      if (!u.length) return ''; if (u.length === 1 && vals.every(Boolean)) return u[0];
      return vals.map((v, i) => v ? `${DAYS[i]}:${v}` : '').filter(Boolean).join('／');
    }, { t: 'grid', uses: ['wkNow'] }]);
  });

  const cb = (name, label, key, value) => [name, label, d => d[key] === value, { t: 'cb', uses: [key] }];
  F.f9 = [
    ['p1_cell_2', '受講番号', 'tNo'], ['p1_cell_4', '氏名', 'tName'],
    ['p1_cell_6', '市町村名', 'rCity'], ['p1_ym_input', '（　年　月現在）', 'rAsOf'],
    ['p1_unit_8', '人口（人）', 'rPop'], ['p1_unit_10', '高齢化率（％）', 'rAging'], ['p1_unit_12', '合計特殊出生率', 'rBirth'],
    ['p1_unit_14', '保護率（％）', 'rWelfare'], ['p1_unit_16', '身体障害者手帳 交付者（人）', 'rPhys'],
    ['p1_unit_18', '療育手帳 交付者（人）', 'rIntel'], ['p1_unit_20', '精神保健福祉手帳 交付者（人）', 'rMental'],
    ['p1_unit_22', '障害保健福祉圏域名', 'rArea'], ['p1_cell_24', '管轄保健所名', 'rHealth'],
    ['p1_cell_26', '圏域の構成市町村名', 'rAreaCities'], ['p1_cell_28', '管轄児童相談所名', 'rChild'], ['p1_cell_30', '管轄年金事務所名', 'rPension'],
    ['p1_cell_31', '地域の特徴（産業・地理・歴史・特産物など）', 'rFeature'], ['p1_src_254', '情報入手先（地域の特徴）', 'rFeatureSrc'],
    cb('p1_chk_1', '基幹相談支援センター 設置済', 'rKikan', '設置済'), cb('p1_chk_2', '基幹 設置予定', 'rKikan', '設置予定'),
    cb('p1_chk_3', '基幹 設置検討中', 'rKikan', '設置検討中'), cb('p1_chk_4', '基幹 設置予定なし', 'rKikan', '設置予定なし'),
    ['p1_plan_yr_33', '基幹 設置予定（年度）', 'rKikanYear'],
    cb('p1_chk_5', '基幹 形態 委託', 'rKikanForm', '委託'), cb('p1_chk_6', '基幹 形態 直営', 'rKikanForm', '直営'), cb('p1_chk_7', '基幹 形態 その他', 'rKikanForm', 'その他'),
    cb('p1_chk_8', '基幹 行ったことがある', 'rKikanVisit', 'ある'), cb('p1_chk_9', '基幹 行ったことがない', 'rKikanVisit', 'ない'),
    ['p1_cell_39', '基幹 関わりの度合い（5段階）', 'rKikanLevel'], ['p1_cell_41', '基幹 業務内容', 'rKikanWork'],
    cb('p1_chk_10', '市町村の相談支援 委託', 'rCityForm', '委託'), cb('p1_chk_11', '市町村の相談支援 直営', 'rCityForm', '直営'), cb('p1_chk_12', '市町村の相談支援 その他', 'rCityForm', 'その他'),
    ['p1_other_44', '市町村の相談支援 その他（　）', 'rCityFormOther'], ['p1_unit_46', '市町村の相談支援 箇所数', 'rCityCount'],
    ['p1_cell_48', '市町村の相談支援 業務内容', 'rCityWork'], ['p1_cell_50', '市町村の相談支援 事業所とその特徴', 'rCityOffices'],
    ['p1_unit_53', '計画相談 事業所 箇所数', 'rPlanCount'], ['p1_unit_55', 'うち指定障害児相談支援事業所', 'rPlanChildCount'],
    ['p1_unit_57', '計画相談 相談員数', 'rPlanStaff'], ['p1_unit_61', '計画相談 兼務の相談員数', 'rPlanStaffDual'], ['p1_cell_59', '計画相談 事業所の特徴', 'rPlanFeature'],
    ['p1_unit_64', '総合支援法 対象者数', 'rSoTarget'], ['p1_unit_65', '総合支援法 作成率', 'rSoRate'], ['p1_unit_66', '総合支援法 うちセルフプラン率', 'rSoSelf'],
    ['p1_unit_67', '児童福祉法 対象者数', 'rJiTarget'], ['p1_unit_68', '児童福祉法 作成率', 'rJiRate'], ['p1_unit_69', '児童福祉法 うちセルフプラン率', 'rJiSelf'],
    ['p1_unit_73', '地域移行 箇所数', 'rIkou'], ['p1_unit_75', '地域定着 箇所数', 'rTeichaku'],
    ['p1_cell_77', '精神科病院からの地域移行の取り組み', 'rIkouWork'],
    ['p2_cell_17', '地域生活支援拠点の概要・検討状況', 'rKyoten'],
    ['p2_cell_20', '自立支援協議会 名称', 'rKyogiName'],
    cb('p2_chk_1', '協議会 市町村単独', 'rKyogiForm', '市町村単独'), cb('p2_chk_2', '協議会 障害保健福祉圏域', 'rKyogiForm', '障害保健福祉圏域'), cb('p2_chk_3', '協議会 その他', 'rKyogiForm', 'その他'),
    ['p2_chk_4', '協議会 構成 全体会', d => !!d.rKyogiAll, { t: 'cb', uses: ['rKyogiAll'] }],
    ['p2_chk_5', '協議会 構成 部会', d => !!d.rKyogiBukai, { t: 'cb', uses: ['rKyogiBukai'] }],
    ['p2_chk_6', '協議会 構成 個別支援会議', d => !!d.rKyogiKobetsu, { t: 'cb', uses: ['rKyogiKobetsu'] }],
    ['p2_cell_26', '部会の状況', 'rBukai'], ['p2_cell_28', '最近の検討テーマ', 'rTheme'],
    ['p2_cell_30', 'その他の共有されている地域課題', 'rIssue'], ['p2_cell_32', '地域課題 児童', 'rIssueChild'],
    ['p2_cell_34', '地域課題 就労', 'rIssueWork'], ['p2_cell_36', '地域課題 サービスの量', 'rIssueQty'], ['p2_cell_38', '地域課題 サービスの質', 'rIssueQual'],
    cb('p2_rel_0', '自身の関与度 よく知っている', 'rRel', 'よく知っている'), cb('p2_rel_1', '自身の関与度 会ったことがある', 'rRel', '会ったことがある'),
    cb('p2_rel_2', '自身の関与度 電話をしたことがある', 'rRel', '電話をしたことがある'), cb('p2_rel_3', '自身の関与度 名前しか知らない', 'rRel', '名前しか知らない'),
    cb('p2_rel_4', '自身の関与度 全く知らない', 'rRel', '全く知らない'),
    ['p2_cell_41', '地域の障害福祉行政の特徴', 'rGyosei'], ['p2_src_571', '情報入手先（行政の特徴）', 'rGyoseiSrc'],
    ['p3_heisei_yr', '地域生活支援事業（平成　年度）', 'rChiikiYear'], ['p3_src_36', '情報入手先（地域生活支援事業）', 'rChiikiSrc'],
    ['p3_cell_1', '市町村地域生活支援事業の実施状況・特徴・課題', 'rChiiki'],
    ['p3_src_224', '情報入手先（事業所の状況）', 'rJigyoSrc'],
    ['p3_cell_3', '事業所 居宅・居住系サービス', 'rKyotaku'], ['p3_cell_5', '事業所 通所系サービス', 'rTsusho'], ['p3_cell_7', '事業所 入所系サービス（短期入所含む）', 'rNyusho']
  ];

  const SEND_ITEMS = [
    '1) 課題実習を行い、指定のとおり様式を作成した', '　個人情報が特定されないように記入した', '　受講番号と氏名を記入した',
    '2) 様式①〜⑨を印刷し、番号順に並べ、左上をゼムクリップでとめた', '3) 2)の課題を2部作成した', '4) 本送付票、同意書を頭に1部添えた',
    '封筒に宛先を書き、郵送料の過不足がないか確認した',
    '送付票（1部）', '同意書にサインがされた書類（1部）', '実習報告書（実習先機関でサインを頂いたもの・1部）',
    '①実践例の概要', '②アセスメントのストレッチ', '③1次アセスメント票', '④ニーズ整理票', '⑤サービス等利用計画案', '⑥週間計画表',
    '⑦サービス等利用計画案別紙1', '⑧サービス等利用計画案別紙2', '⑨社会資源調査票'
  ];
  F.f00 = [
    ['trainee_org', '所属機関・法人名・事業所名', 'tOrg'],
    ['trainee_name', '受講者氏名（自署欄）', d => self(d) ? d.tName : '', { uses: ['tName', 'printSelf'] }],
    ['trainee_id', '受講番号', 'tNo'],
    ['mgr_org', '所属長の所属機関・法人名・事業所名', ['mgrOrg', 'tOrg']],
    ['mgr_title_name', '所属長の職・氏名（自署欄）', d => self(d) ? d.mgrName : '', { uses: ['mgrName', 'printSelf'] }]
  ];
  SEND_ITEMS.forEach((lab, i) => F.f00.push([`chk_${i + 1}`, lab, d => !!(d.send && d.send[i]), { t: 'cb', uses: ['send'] }]));

  F.f0a = [
    ['trainee_name_1', '私、（受講者名）', 'tName'],
    ['explain_year', '説明日 令和（年）', d => ymd(d, 'cExplain', 'Y'), { uses: ['cExplainY'] }],
    ['explain_month', '説明日（月）', d => ymd(d, 'cExplain', 'M'), { uses: ['cExplainM'] }],
    ['explain_day', '説明日（日）', d => ymd(d, 'cExplain', 'D'), { uses: ['cExplainD'] }],
    ['office_name', '事業所名', ['cOffice', 'agency']],
    ['explainer_name', '説明者（職・氏名）（自署欄）', d => self(d) ? d.cExplainer : '', { uses: ['cExplainer', 'printSelf'] }],
    ['trainee_name_2', '私は上記内容を理解し、（受講者名）', 'tName'],
    ['consent_year', '同意日 令和（年）', d => ymd(d, 'cConsent', 'Y'), { uses: ['cConsentY'] }],
    ['consent_month', '同意日（月）', d => ymd(d, 'cConsent', 'M'), { uses: ['cConsentM'] }],
    ['consent_day', '同意日（日）', d => ymd(d, 'cConsent', 'D'), { uses: ['cConsentD'] }]
  ];

  const hm = (d, k, i) => { const m = s(d[k]).match(/(\d{1,2})\D*(\d{1,2})?/); return m ? (i === 0 ? m[1] : (m[2] || '00').padStart(2, '0')) : ''; };
  F.f0b = [
    ['facility_visited', '実習をした機関', 'jFacility'],
    ['visit_year', '実習日 令和（年）', d => ymd(d, 'jVisit', 'Y'), { uses: ['jVisitY'] }],
    ['visit_month', '実習日（月）', d => ymd(d, 'jVisit', 'M'), { uses: ['jVisitM'] }],
    ['visit_day', '実習日（日）', d => ymd(d, 'jVisit', 'D'), { uses: ['jVisitD'] }],
    ['start_hour', '開始（時）', d => hm(d, 'jStart', 0), { uses: ['jStart'] }], ['start_min', '開始（分）', d => hm(d, 'jStart', 1), { uses: ['jStart'] }],
    ['end_hour', '終了（時）', d => hm(d, 'jEnd', 0), { uses: ['jEnd'] }], ['end_min', '終了（分）', d => hm(d, 'jEnd', 1), { uses: ['jEnd'] }],
    ['trainee_name_cert', '受講生（氏名）', 'tName'],
    ['report_year', '報告日 令和（年）', d => ymd(d, 'jReport', 'Y'), { uses: ['jReportY'] }],
    ['report_month', '報告日（月）', d => ymd(d, 'jReport', 'M'), { uses: ['jReportM'] }],
    ['report_day', '報告日（日）', d => ymd(d, 'jReport', 'D'), { uses: ['jReportD'] }],
    ['trainee_id', '受講番号', 'tNo'], ['trainee_name_rep', '受講者氏名', 'tName'],
    ['trainee_office', '所属事業所', 'tOrg'], ['manager_name', '事業所管理者名', 'mgrName']
  ];

  // 第三者の記入欄・署名欄（アプリでは書かない）
  const SKIP = {
    f5: ['p1_c_26'], f0a: ['cooperator_name', 'proxy_name'],
    f0b: ['cert_year', 'cert_month', 'cert_day', 'cert_facility', 'cert_person']
  };

  // ⑦ 生年の元号・住まいの種類は様式の文字を〇で囲む（位置は PDF の文字から調べた値）
  const CIRCLES = {
    f7: d => {
      const out = [], era = { T: 292.2, S: 308.9, H: 325.9 }[s(d.era)];
      if (era && num(d.birthYr)) out.push({ x: era, y: 582.4, rx: 5.2, ry: 5.2 });
      const hs = { 持家: [112, 8.5], 借家: [134, 8.5], 'グループ/ケアホーム': [181.8, 34], 入所施設: [236.8, 16], 医療機関: [273.8, 16], その他: [306.5, 12] }[s(d.housing)];
      if (hs) out.push({ x: hs[0], y: 543.9, rx: hs[1], ry: 5.6 });
      return out;
    }
  };
  // ③ 1日の流れ：6時〜翌3時の目盛り（PDFの数字の位置）
  const TL = { x6: 69.7, perHour: 20.62 };

  const FORMS = [
    { id: 'f00', no: '送付票', name: '課題の送付票', group: '提出書類', drive: '1sEcudLVQhF88iUfWkSdat_kC0z5pBvRG', file: '00-送付票' },
    { id: 'f0a', no: '同意書', name: '協力依頼・同意書', group: '提出書類', drive: '1XI43FjDyzrgRsMTPczo2ztBhkwJw2clL', file: '0-初任研-協力依頼-同意書' },
    { id: 'f0b', no: '報告書', name: '実習報告書', group: '提出書類', drive: '1kic9Utu187lK17hNQREWnK6RElfOIWF_', file: '実習１-実習報告書' },
    { id: 'f1', no: '①', name: '8-1 実践例の概要', group: '課題1 個別支援の体験', drive: '1vFC20672oQ-q1p7Cpv6gi6LWRiVhmXGn', file: '①提出課題8-1実践例の概要' },
    { id: 'f2', no: '②', name: '8-2 アセスメントのストレッチ', group: '課題1 個別支援の体験', drive: '150AXnqiwHaw34mBdnXoO4Q9wJ8fGcdaO', file: '②提出課題8-2_ストレッチ' },
    { id: 'f3', no: '③', name: '8-3 一次アセスメント票（3頁）', group: '課題1 個別支援の体験', drive: '1e__nQ17Ilo5LjImkactqM_Juz7jT84bV', file: '③提出課題8-3_アセスメント' },
    { id: 'f4', no: '④', name: '8-4 ニーズ整理票', group: '課題1 個別支援の体験', drive: '1Z3hD6rTAVcs2UUUyTACOZOJT7wcxxjNR', file: '④提出課題8-4_ニーズ整理' },
    { id: 'f5', no: '⑤', name: '8-5 サービス等利用計画案', group: '課題1 個別支援の体験', drive: '16WxAXdhsqVe41IVK0TD5x0OYATz3IdCt', file: '⑤提出課題8-5_計画案' },
    { id: 'f6', no: '⑥', name: '8-6 週間計画表', group: '課題1 個別支援の体験', drive: '1Mk_y33j2hY0_OawN7KZ5xLjSgL5veG-a', file: '⑥提出課題8-6_週間計画' },
    { id: 'f7', no: '⑦', name: '8-7 計画案 別紙1（申請者の現状）', group: '課題1 個別支援の体験', drive: '1gXoNsu2Rq-qPnOpQ54tW6ipUKdVXaR5F', file: '⑦提出課題8-7_別紙１' },
    { id: 'f8', no: '⑧', name: '8-8 計画案 別紙2（現在の生活）', group: '課題1 個別支援の体験', drive: '1UR9Bsyk8tyHdT_Na9u97ayeexFCswtQZ', file: '⑧提出課題8-8_別紙２' },
    { id: 'f9', no: '⑨', name: '社会資源調査票（3頁）', group: '課題2 業務をしている地域の調査', drive: '1dBem1s0qYv4A6uVHuqPqymGd4jvqxGXY', file: '⑨-社会資源調査票' }
  ];
  FORMS.forEach(f => { f.entries = F[f.id]; f.skip = SKIP[f.id] || []; });

  // キー → 反映先の様式番号
  function reflectMap() {
    const m = {};
    FORMS.forEach(f => f.entries.forEach(e => {
      const spec = e[2], o = e[3] || {};
      const keys = typeof spec === 'string' ? [spec] : Array.isArray(spec) ? spec : (o.uses || []);
      keys.forEach(k => { (m[k] = m[k] || []); if (!m[k].includes(f.no)) m[k].push(f.no); });
    }));
    return m;
  }

  // 欄の値（上書きがあれば上書き）
  function entryValue(form, e, d) {
    const ov = d.ov && d.ov[form.id] && d.ov[form.id][e[0]];
    if (ov != null && ov !== '') return (e[3] && e[3].t === 'cb') ? ov === '1' : String(ov);
    const v = typeof e[2] === 'function' ? e[2](d) : val(d, e[2]);
    return (e[3] && e[3].t === 'cb') ? !!v : s(v);
  }
  function progress(form, d) {
    let fill = 0, tot = 0;
    form.entries.forEach(e => { const t = e[3] && e[3].t; if (t === 'grid' || t === 'cb') return; tot++; if (entryValue(form, e, d)) fill++; });
    const grid = form.entries.filter(e => e[3] && e[3].t === 'grid'), gridFill = grid.filter(e => entryValue(form, e, d)).length;
    return { fill, tot, gridFill, gridTot: grid.length };
  }

  // ---------- 文字の大きさを欄に合わせる ----------
  const KINSOKU = '、。，．）」』】〕・ーっゃゅょッャュョ！？：；…';
  function wrap(font, text, size, maxW) {
    const out = [];
    String(text).split('\n').forEach(para => {
      let line = '';
      for (const ch of Array.from(para)) {
        const t = line + ch;
        if (line && font.widthOfTextAtSize(t, size) > maxW) {
          if (KINSOKU.includes(ch) && font.widthOfTextAtSize(t, size) <= maxW + size) { line = t; continue; }
          out.push(line); line = ch;
        } else line = t;
      }
      out.push(line);
    });
    return out;
  }
  // pdf-lib の並べ方：枠の内側（上下左右 1.4pt）に、行の高さ = 1.2 × 文字の高さ で上から並べる
  function fit(font, text, w, h, multi) {
    const maxW = w - 6, inner = h - 2.8;
    const lineH = fs => font.heightAtSize(fs) * 1.2;
    if (!multi) {
      const one = text.replace(/\s*\n\s*/g, '　');
      const top = Math.min(10.5, inner * 0.82);
      for (let fs = top; fs >= 5.5; fs -= 0.25) if (font.widthOfTextAtSize(one, fs) <= maxW) return { fs, text: one, multi: false };
      if (h < 13) return { fs: 5.5, text: one, multi: false, over: true };
    }
    for (let fs = 10.5; fs >= 4.5; fs -= 0.25) {
      const lines = wrap(font, text, fs, maxW);
      if (lines.length * lineH(fs) + fs * 0.15 <= inner) return { fs, text: lines.join('\n'), multi: true, small: fs < 6.5 };
    }
    return { fs: 4.5, text: wrap(font, text, 4.5, maxW).join('\n'), multi: true, over: true };
  }

  function parseTimeline(text) {
    return s(text).split('\n').map(l => {
      const m = l.trim().match(/^(\d{1,2})(?:[:：時](\d{1,2})?分?)?\s*(.*)$/);
      if (!m || !m[3]) return null;
      let h = Number(m[1]), mi = Number(m[2] || 0);
      if (h > 30 || mi > 59) return null;
      if (h < 6) h += 24;
      return { t: h + mi / 60, label: m[3].trim(), hh: `${Number(m[1])}:${String(mi).padStart(2, '0')}` };
    }).filter(Boolean).sort((a, b) => a.t - b.t);
  }

  // ---------- PDF に書き込む ----------
  // lib: { PDFLib, fontkit, fontBytes }  戻り値: { bytes, ok, miss, small }
  async function fillForm(form, bytes, d, lib, opt) {
    const { PDFDocument, rgb } = lib.PDFLib;
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    pdf.registerFontkit(lib.fontkit);
    const font = await pdf.embedFont(lib.fontBytes, { subset: true });
    const pdfForm = pdf.getForm(), pages = pdf.getPages();
    const byName = {}; pdfForm.getFields().forEach(f => { byName[f.getName()] = f; });
    const pageOf = w => { const ref = w.P(); return pages.find(p => p.ref === ref) || pages[0]; };
    let ok = 0; const miss = [], small = [];
    for (const e of form.entries) {
      const [name, label] = e, o = e[3] || {};
      if (form.skip.includes(name)) continue;
      const v = entryValue(form, e, d);
      if (!v) continue;
      const f = byName[name]; if (!f) { miss.push(label); continue; }
      try {
        if (o.t === 'cb') { f.check(); ok++; continue; }
        const w = f.acroField.getWidgets()[0], r = w.getRectangle();
        if (o.t === 'tl') {
          const pg = pageOf(w), evs = parseTimeline(v);
          pdfForm.removeField(f);
          const fs = 5.6; let lastEnd = [-1e9, -1e9];
          evs.forEach(ev => {
            const x = TL.x6 + (ev.t - 6) * TL.perHour; if (x < r.x - 2 || x > r.x + r.width) return;
            pg.drawLine({ start: { x, y: r.y + 1 }, end: { x, y: r.y + r.height - 1 }, thickness: 0.6, color: rgb(0.1, 0.3, 0.6) });
            const txt = `${ev.hh}${ev.label}`, tw = font.widthOfTextAtSize(txt, fs);
            const lane = x + 1 > lastEnd[0] ? 0 : (x + 1 > lastEnd[1] ? 1 : (lastEnd[0] <= lastEnd[1] ? 0 : 1));
            pg.drawText(txt, { x: x + 1, y: r.y + r.height - 1 - fs * (lane + 1) + 0.6, size: fs, font, color: rgb(0, 0, 0) });
            lastEnd[lane] = x + 1 + tw + 1;
          });
          ok++; continue;
        }
        const multi = f.isMultiline ? f.isMultiline() : false;
        const res = fit(font, String(v), r.width, r.height, multi);
        if (res.multi && !multi) f.enableMultiline();
        try { f.setMaxLength(undefined); } catch (err) { }
        f.setText(res.text);
        const da = `/Helv ${res.fs.toFixed(2)} Tf 0 g`;   // 欄ごとの文字の大きさ（DA が欄ではなく枠にしかない様式もある）
        f.acroField.setDefaultAppearance(da);
        f.acroField.getWidgets().forEach(wd => { try { wd.setDefaultAppearance(da); } catch (err) { } });
        if (res.over || res.small) small.push(label);
        ok++;
      } catch (err) { miss.push(label); if (typeof process !== "undefined" && process.env.KS_DEBUG) console.error(name, err.message); }
    }
    pdfForm.updateFieldAppearances(font);
    if (CIRCLES[form.id]) CIRCLES[form.id](d).forEach(c => pages[0].drawEllipse({ x: c.x, y: c.y, xScale: c.rx, yScale: c.ry, borderColor: rgb(0, 0, 0), borderWidth: 0.8 }));
    try { pdf.catalog.getOrCreateAcroForm().dict.set(lib.PDFLib.PDFName.of('NeedAppearances'), lib.PDFLib.PDFBool.False); } catch (err) { }
    if (opt && opt.flatten) pdfForm.flatten();
    return { bytes: await pdf.save(), ok, miss, small };
  }

  const API = { FORMS, ASMT, ASMT_COLS, PRI_COLS, SUP_COLS, SEND_ITEMS, DAYS, weekCells, reflectMap, entryValue, progress, fillForm, parseTimeline, fit, wrap };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.KS = API;
})(typeof window !== 'undefined' ? window : globalThis);

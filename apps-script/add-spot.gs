/**
 * 「spots」スプレッドシートに紐づけて設置するGoogle Apps Script。
 * まーとん8393アプリの「お店を追加」パネルから送信されたURL・カテゴリ・名称・メモを
 * 「spots」シートの末尾に1行として追記するWebアプリのエンドポイント。
 *
 * 導入手順は README.md の「スプレッドシートへの直接書き込みを有効にする」を参照。
 */

var SHEET_NAME = 'spots';

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var url = String(payload.url || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return jsonResponse({ ok: false, error: 'URLが不正です' });
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      return jsonResponse({ ok: false, error: 'シート「' + SHEET_NAME + '」が見つかりません' });
    }

    var headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(function (h) { return String(h).trim().toLowerCase(); });

    var record = {
      name: payload.name || '',
      category: payload.category || '',
      prefecture: payload.prefecture || '',
      area: payload.area || '',
      access: payload.access || '',
      phone: payload.phone || '',
      price: payload.price || '',
      onsen_distance: payload.onsen_distance || '',
      url: url,
      lat: payload.lat || '',
      lng: payload.lng || '',
      features: payload.features || ''
    };

    var newRow = headerRow.map(function (key) {
      return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : '';
    });

    sheet.appendRow(newRow);

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

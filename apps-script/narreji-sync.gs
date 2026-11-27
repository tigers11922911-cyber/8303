/**
 * ナレジ 朗読カード（narreji/index.html）の同期用 Google Apps Script。
 *
 * スマホ・パソコンなど複数の端末のカードと朗読設定を、
 * あなたの Googleドライブ上の 1つのファイル（narreji-sync.json）にまとめて保存します。
 * Gemini APIキーはこのファイルには保存されません（各端末だけに保存）。
 *
 * 設置手順（README.md の「ナレジ 朗読カード」も参照）
 *  1. https://script.google.com で「新しいプロジェクト」を作り、このファイルの内容をすべて貼り付ける
 *  2. 下の SYNC_KEY を自分だけの合言葉（12文字以上推奨）に書き換えて保存する
 *  3. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *       次のユーザーとして実行：自分 ／ アクセスできるユーザー：全員
 *  4. 表示された「ウェブアプリのURL」と合言葉を、アプリの「設定」→「同期」に入れる
 *
 * 合言葉を変えたときは、アプリ側の合言葉も同じものに変えてください。
 * このスクリプトを書き換えたあとは「デプロイを管理」→ 編集 →「新しいバージョン」で再デプロイが必要です。
 */

var SYNC_KEY = 'ここに合言葉を書く';
var FILE_NAME = 'narreji-sync.json';
var PLACEHOLDER = 'ここに合言葉を書く';

function doPost(e) {
  var p;
  try {
    p = JSON.parse(e && e.postData ? e.postData.contents : '{}');
  } catch (err) {
    return out_({ ok: false, error: 'bad_request' });
  }
  if (!SYNC_KEY || SYNC_KEY === PLACEHOLDER) return out_({ ok: false, error: 'not_configured' });
  if (String(p.key || '') !== SYNC_KEY) return out_({ ok: false, error: 'bad_key' });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return out_({ ok: false, error: 'busy' });
  try {
    var file = getFile_();
    var cur = read_(file);

    if (p.action === 'get') {
      return out_({ ok: true, rev: cur.rev, data: cur.data });
    }

    if (p.action === 'put') {
      if (!p.data || typeof p.data !== 'object' || !Array.isArray(p.data.cards)) {
        return out_({ ok: false, error: 'bad_data' });
      }
      // 他の端末が先に保存していたら、最新を取り直してもらう
      if (typeof p.baseRev === 'number' && p.baseRev !== cur.rev) {
        return out_({ ok: false, error: 'conflict', rev: cur.rev });
      }
      var rev = cur.rev + 1;
      file.setContent(JSON.stringify({ rev: rev, savedAt: new Date().toISOString(), data: p.data }));
      return out_({ ok: true, rev: rev });
    }

    return out_({ ok: false, error: 'bad_action' });
  } finally {
    lock.releaseLock();
  }
}

/** ブラウザでURLを開いたときの接続確認用（データは返しません） */
function doGet() {
  return out_({ ok: true, app: 'narreji-sync', configured: !!SYNC_KEY && SYNC_KEY !== PLACEHOLDER });
}

function getFile_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FILE_ID');
  if (id) {
    try {
      var f = DriveApp.getFileById(id);
      if (!f.isTrashed()) return f;
    } catch (e) {}
  }
  var it = DriveApp.getFilesByName(FILE_NAME);
  var file = it.hasNext()
    ? it.next()
    : DriveApp.createFile(FILE_NAME, JSON.stringify({ rev: 0, data: null }), 'application/json');
  props.setProperty('FILE_ID', file.getId());
  return file;
}

function read_(file) {
  try {
    var o = JSON.parse(file.getBlob().getDataAsString('UTF-8') || '{}');
    return { rev: Number(o.rev) || 0, data: o.data || null };
  } catch (e) {
    return { rev: 0, data: null };
  }
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

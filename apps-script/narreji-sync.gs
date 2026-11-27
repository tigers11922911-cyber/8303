/**
 * ナレジ 朗読カード（narreji/index.html）の同期・バックアップ用 Google Apps Script。
 *
 * データは、あなたの Googleドライブの
 *   マイドライブ › 【100】アプリ › 【3】単語帳
 * に保存します（フォルダが無ければ作ります）。
 *   - narreji-sync.json        … スマホ・パソコンの同期用（カードと朗読設定）
 *   - ナレジ単語帳_YYYYMMDD.json … 毎日のバックアップ（同じ日は上書き）
 * Gemini APIキーは保存しません（各端末だけに保存）。
 *
 * 設置手順（README.md の「ナレジ 朗読カード」も参照）
 *  1. https://script.google.com で「新しいプロジェクト」を作り、このファイルの内容をすべて貼り付ける
 *  2. 下の SYNC_KEY を自分だけの合言葉（12文字以上推奨）に書き換えて保存する
 *  3. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *       次のユーザーとして実行：自分 ／ アクセスできるユーザー：全員
 *  4. 表示された「ウェブアプリのURL」と合言葉を、アプリの「設定」→「同期」に入れる
 *
 * すでに前の版を使っている場合：このファイルの内容で置き換えて保存し、
 * 「デプロイ」→「デプロイを管理」→ 鉛筆 →「バージョン：新バージョン」→「デプロイ」をしてください（URLは変わりません）。
 * 以前マイドライブ直下にあった narreji-sync.json は、自動で上のフォルダへ移します。
 */

var SYNC_KEY = 'ここに合言葉を書く';
var FOLDER_PATH = ['【100】アプリ', '【3】単語帳'];   // マイドライブからのフォルダの道すじ
var FILE_NAME = 'narreji-sync.json';
var BACKUP_PREFIX = 'ナレジ単語帳_';
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

  // バックアップの一覧と読み込みは、同期データを書きかえないのでロックしない
  if (p.action === 'list_backups') return out_({ ok: true, folder: FOLDER_PATH.join(' › '), files: listBackups_() });
  if (p.action === 'get_backup') return getBackup_(String(p.id || ''));

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return out_({ ok: false, error: 'busy' });
  try {
    if (p.action === 'backup') {
      if (!p.data || typeof p.data !== 'object' || !Array.isArray(p.data.cards)) return out_({ ok: false, error: 'bad_data' });
      return out_(saveBackup_(p.data));
    }

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
  return out_({ ok: true, app: 'narreji-sync', v: 2, configured: !!SYNC_KEY && SYNC_KEY !== PLACEHOLDER });
}

/** 保存先のフォルダ（【100】アプリ › 【3】単語帳）。無ければ作る */
function getFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FOLDER_ID');
  if (id) {
    try {
      var f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (e) {}
  }
  var cur = DriveApp.getRootFolder();
  FOLDER_PATH.forEach(function (name) {
    var it = cur.getFoldersByName(name);
    cur = it.hasNext() ? it.next() : cur.createFolder(name);
  });
  props.setProperty('FOLDER_ID', cur.getId());
  return cur;
}

function isInFolder_(file, folder) {
  var parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === folder.getId()) return true;
  }
  return false;
}

/** 同期用のファイル。前の版でマイドライブ直下に作ったものは、フォルダへ移す */
function getFile_() {
  var folder = getFolder_();
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FILE_ID');
  if (id) {
    try {
      var f = DriveApp.getFileById(id);
      if (!f.isTrashed()) {
        if (!isInFolder_(f, folder)) f.moveTo(folder);
        return f;
      }
    } catch (e) {}
  }
  var it = folder.getFilesByName(FILE_NAME);
  var file;
  if (it.hasNext()) {
    file = it.next();
  } else {
    var old = DriveApp.getRootFolder().getFilesByName(FILE_NAME);
    if (old.hasNext()) {
      file = old.next();
      file.moveTo(folder);
    } else {
      file = folder.createFile(FILE_NAME, JSON.stringify({ rev: 0, data: null }), 'application/json');
    }
  }
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

/** その日のバックアップ（ナレジ単語帳_YYYYMMDD.json）。同じ日のものは上書き */
function saveBackup_(data) {
  var folder = getFolder_();
  var name = BACKUP_PREFIX + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd') + '.json';
  var body = JSON.stringify({ app: 'narreji', v: 1, savedAt: new Date().toISOString(), cards: data.cards, prefs: data.prefs || null });
  var it = folder.getFilesByName(name);
  var file = it.hasNext() ? it.next() : null;
  if (file) file.setContent(body);
  else file = folder.createFile(name, body, 'application/json');
  return { ok: true, name: name, folder: FOLDER_PATH.join(' › '), size: body.length };
}

/** フォルダの中のバックアップ（JSON）の一覧。新しい順に30件 */
function listBackups_() {
  var folder = getFolder_();
  var it = folder.getFiles(), list = [];
  while (it.hasNext()) {
    var f = it.next();
    var n = f.getName();
    if (!/\.json$/i.test(n) || n === FILE_NAME) continue;
    list.push({ id: f.getId(), name: n, size: f.getSize(), updated: f.getLastUpdated().getTime() });
  }
  list.sort(function (a, b) { return b.updated - a.updated; });
  return list.slice(0, 30);
}

/** バックアップを1つ読む（このフォルダの中のファイルだけ） */
function getBackup_(id) {
  if (!id) return out_({ ok: false, error: 'bad_request' });
  var folder = getFolder_();
  try {
    var f = DriveApp.getFileById(id);
    if (f.isTrashed() || !isInFolder_(f, folder)) return out_({ ok: false, error: 'not_found' });
    return out_({ ok: true, name: f.getName(), text: f.getBlob().getDataAsString('UTF-8') });
  } catch (e) {
    return out_({ ok: false, error: 'not_found' });
  }
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

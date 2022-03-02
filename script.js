const prop = PropertiesService.getScriptProperties();
//対象とするGoogleDriveフォルダのID　ブラウザでアクセスしてURL見れば分かる
const TARGET_FOLDER_IDS = JSON.parse(prop.getProperty('TARGET_FOLDER_IDS'));
// 送信先のメールアドレス　このスクリプトの実行ユーザーは、送信済みトレイに入るので注意
const SEND_MAIL_ADDRESS = JSON.parse(prop.getProperty('SEND_MAIL_ADDRESS'));

function updateChecks() {
  TARGET_FOLDER_IDS.forEach(folder_id => updateCheck(folder_id));
}

function updateCheck(folder_id) {
  const targetFolder = DriveApp.getFolderById(folder_id);

  // フォルダ内を再帰的に探索してすべてのファイル情報を取得する
  function getAllFilesId(parentFolder, targetFolder) {
    let fileMap = {};

    var files = targetFolder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      fileMap[parentFolder + '/' + file.getName()] = {
        lastUpdate: file.getLastUpdated(),
        fileId: file.getId()
      };
    }

    var childFolders = targetFolder.getFolders();
    while (childFolders.hasNext()) {
      var childFolder = childFolders.next();
      fileMap = Object.assign(
        fileMap, getAllFilesId(parentFolder + '/' + childFolder.getName(), childFolder));
    }

    return fileMap;
  }

  const lastUpdateMap = getAllFilesId('.', targetFolder);

  // スプレッドシートに記載されているフォルダ名と更新日時を取得。
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const updateSheetId = spreadsheet.getId();
  const sheet = (() => {
    try {
      return spreadsheet.insertSheet(folder_id);
    } catch (error) {
      return spreadsheet.getSheetByName(folder_id);
    }
  })();
  //Logger.log(sheet)
  var data = sheet.getDataRange().getValues();
  //Logger.log('data: ' + data)
  // 取得したデータをMapに変換。
  var sheetData = {};
  for (var i = 0; i < data.length; i++) {
    sheetData[data[i][0]] = { name: data[i][0], lastUpdate: data[i][1], rowNo: i + 1 };
  }

  // 実際のフォルダとスプレッドシート情報を比較。
  var updateFolderMap = [];
  for (key in lastUpdateMap) {
    if (updateSheetId == lastUpdateMap[key].fileId) {
      continue;
    }
    if (key in sheetData) {
      // フォルダ名がシートに存在する場合。
      if (lastUpdateMap[key].lastUpdate > sheetData[key].lastUpdate) {
        // フォルダが更新されている場合。
        sheet.getRange(sheetData[key].rowNo, 2).setValue(lastUpdateMap[key].lastUpdate);
        sheet.getRange(sheetData[key].rowNo, 3).setValue(lastUpdateMap[key].fileId);
        updateFolderMap.push({ filename: key, lastUpdate: lastUpdateMap[key].lastUpdate, fileId: lastUpdateMap[key].fileId });
      }
    } else {
      // フォルダ名がシートに存在しない場合。
      var newRow = sheet.getLastRow() + 1;
      sheet.getRange(newRow, 1).setValue(key);
      sheet.getRange(newRow, 2).setValue(lastUpdateMap[key].lastUpdate);
      sheet.getRange(newRow, 3).setValue(lastUpdateMap[key].fileId);
      updateFolderMap.push({ filename: key, lastUpdate: lastUpdateMap[key].lastUpdate, fileId: lastUpdateMap[key].fileId });
    }
  }
  //Logger.log('updateFolderMap:' + updateFolderMap)
  // 新規及び更新された情報をメール送信。
  var updateText = "";
  for (key in updateFolderMap) {
    item = updateFolderMap[key];
    updateText +=
      item.filename + ', updated at ' + Utilities.formatDate(item.lastUpdate, "JST", "yyyy-MM-dd HH:mm:ss") + '\n'
      + DriveApp.getFileById(item.fileId).getUrl() + "\n\n"
  }

  if (updateFolderMap.length != 0) {
    SEND_MAIL_ADDRESS.forEach(function (o, i) {
      MailApp.sendEmail(
        SEND_MAIL_ADDRESS[i],
        "[GoogleDrive] Updated " + updateFolderMap.length + " files in " + targetFolder.getName(),
        "[GoogleDrive] Updated " + updateFolderMap.length + " files in " + targetFolder.getName() + "\n\n" +
        updateText
      );
    });
  }
}

// 生成穿透流用的账单 Excel fixture，复用后端 exceljs 依赖。
// 列顺序须与 backend/src/common/excel/policy-record-columns.ts 的 POLICY_RECORD_COLUMNS 一致：
// 客户名称/工作单号/业务类型/币种/投保人/保险金额/保费/保单号
const path = require('path');
const ExcelJS = require(path.join(__dirname, '../../../backend/node_modules/exceljs'));

const OUT_DIR = __dirname;

async function buildMixedValidInvalid() {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('账单');
  sheet.addRow(['客户名称', '工作单号', '业务类型', '币种', '投保人', '保险金额', '保费', '保单号']);
  // 3 条合法行：常熟×2（不同工作单号）、太仓×1
  sheet.addRow(['客户甲', 'WO-IT-0001', '车险', 'CNY', '常熟', 100000, 2000, 'PN-IT-0001']);
  sheet.addRow(['客户乙', 'WO-IT-0002', '车险', 'CNY', '常熟', 80000, 1600, 'PN-IT-0002']);
  sheet.addRow(['客户丙', 'WO-IT-0003', '财险', 'CNY', '太仓', 50000, 1000, 'PN-IT-0003']);
  // 2 条非法行：客户名称为空；保费非数字
  sheet.addRow(['', 'WO-IT-0004', '车险', 'CNY', '常熟', 60000, 1200, 'PN-IT-0004']);
  sheet.addRow(['客户戊', 'WO-IT-0005', '车险', 'CNY', '常熟', 60000, '非数字', 'PN-IT-0005']);
  await wb.xlsx.writeFile(path.join(OUT_DIR, 'mixed-valid-invalid.xlsx'));
}

async function buildSecondBatch() {
  // 供"删除某次导入"流使用的第二份导入文件
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('账单');
  sheet.addRow(['客户名称', '工作单号', '业务类型', '币种', '投保人', '保险金额', '保费', '保单号']);
  sheet.addRow(['客户己', 'WO-IT-0006', '车险', 'CNY', '昆山', 30000, 600, 'PN-IT-0006']);
  sheet.addRow(['客户庚', 'WO-IT-0007', '车险', 'CNY', '昆山', 30000, 600, 'PN-IT-0007']);
  await wb.xlsx.writeFile(path.join(OUT_DIR, 'second-import.xlsx'));
}

async function buildWrongSheetName() {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Sheet1'); // 非"账单"
  sheet.addRow(['客户名称', '工作单号', '业务类型', '币种', '投保人', '保险金额', '保费', '保单号']);
  sheet.addRow(['客户辛', 'WO-IT-9001', '车险', 'CNY', '张家港', 10000, 200, 'PN-IT-9001']);
  await wb.xlsx.writeFile(path.join(OUT_DIR, 'wrong-sheet-name.xlsx'));
}

async function buildCorruptFile() {
  const fs = require('fs');
  // 非法字节流，不是有效的 zip/xlsx 结构
  fs.writeFileSync(path.join(OUT_DIR, 'corrupt.xlsx'), Buffer.from('not a real xlsx file, just garbage bytes 0000'));
}

async function main() {
  await buildMixedValidInvalid();
  await buildSecondBatch();
  await buildWrongSheetName();
  await buildCorruptFile();
  console.log('fixtures generated in', OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

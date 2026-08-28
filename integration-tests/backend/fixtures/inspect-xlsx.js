// 读取导出的提成报表 xlsx，输出 JSON 摘要供 bash/jq 断言使用。
// 用法：node inspect-xlsx.js <文件路径>
const path = require('path');
const ExcelJS = require(path.join(__dirname, '../../../backend/node_modules/exceljs'));

async function main() {
  const filePath = process.argv[2];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheets = [];
  wb.eachSheet((sheet) => {
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      rows.push(row.values.slice(1)); // exceljs 的 row.values[0] 恒为 undefined
    });
    sheets.push({ name: sheet.name, rows });
  });
  console.log(JSON.stringify({ sheetNames: sheets.map((s) => s.name), sheets }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

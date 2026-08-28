// v1 前端穿透流·Playwright 版（pinchtab 技能在本会话不可用的替代方案）
// 覆盖批次列表→详情→导入→明细回填→提成汇总→导出主链路 + 提成阶梯规则页，
// 附 3 条固定视觉冒烟断言（design.md §〇 视觉冒烟锚点）。
//
// 用法：node v1-run-all.js
// 依赖：frontend dev server（127.0.0.1:5173）+ backend（127.0.0.1:3000）均已启动，数据库已含本轮后端穿透流写入的数据
//       （不新建独立数据，复用 flow1/flow5 留下的批次，减少重复搭建）

const { chromium } = require('playwright');
const path = require('path');

const FRONTEND_URL = 'http://127.0.0.1:5173';
const PROXY_SERVER = process.env.HTTP_PROXY_SERVER || 'http://172.22.224.1:7897';
const FIXTURES_DIR = path.join(__dirname, '../backend/fixtures');

let PASS = 0;
let FAIL = 0;
const FAIL_DETAIL = [];

function pass(label) { PASS++; console.log(`    ✅ ${label}`); }
function fail(label, detail) { FAIL++; FAIL_DETAIL.push(label + (detail ? `：${detail}` : '')); console.log(`    ❌ ${label}${detail ? '（' + detail + '）' : ''}`); }
async function assertVisible(locator, label) {
  const visible = await locator.isVisible().catch(() => false);
  if (visible) pass(label); else fail(label, '不可见');
}
async function assertEq(actual, expected, label) {
  if (actual === expected) pass(`${label}（实际=${actual}）`);
  else fail(label, `期望=${expected}，实际=${actual}`);
}

async function main() {
  const browser = await chromium.launch({
    args: ['--no-sandbox'],
    proxy: { server: PROXY_SERVER, bypass: 'localhost,127.0.0.1' },
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(10000);

  try {
    // ===== 场景 1：登录成功 =====
    console.log('=== 场景1：登录 ===');
    await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('账号').fill('admin');
    await page.getByPlaceholder('密码').fill('IntegrationTest123!');
    await page.getByRole('button', { name: '登录' }).click();
    await page.waitForResponse((r) => r.url().includes('/auth/login'), { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const afterLoginUrl = page.url();
    if (!afterLoginUrl.includes('/login')) pass('登录成功，跳出登录页');
    else fail('登录成功，跳出登录页', `仍停留在 ${afterLoginUrl}`);

    // ===== 场景 2：批次列表页导航 + 新建批次 =====
    console.log('=== 场景2：批次列表→新建批次→跳转详情页 ===');
    await page.getByRole('link', { name: '提成批次' }).click();
    await page.waitForURL(/commission-batches$/, { timeout: 8000 });
    await assertVisible(page.locator('#btn-new-batch'), '批次列表页加载完成（新建按钮可见）');
    await page.locator('#btn-new-batch').click();
    await assertVisible(page.locator('#modal-new-batch'), '新建批次弹窗打开');
    const batchName = `PW-场景-${Date.now()}`;
    await page.locator('#input-batch-name').fill(batchName);
    await page.locator('#btn-submit-new-batch').click();
    await page.waitForURL(/commission-batches\/\d+$/, { timeout: 8000 });
    await page.locator('#detail-batch-name').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await assertVisible(page.locator('#detail-batch-name'), '跳转到批次详情页');
    const detailNameText = await page.locator('#detail-batch-name').textContent();
    await assertEq(detailNameText, batchName, '详情页批次名正确');

    // ===== 场景 3：状态标签切换 =====
    console.log('=== 场景3：批次状态切换 ===');
    const statusTagBefore = await page.locator('#tag-batch-status').textContent();
    await page.locator('#tag-batch-status').click();
    await page.waitForTimeout(500);
    const statusTagAfter = await page.locator('#tag-batch-status').textContent();
    if (statusTagBefore !== statusTagAfter) pass(`状态切换生效（${statusTagBefore?.trim()} → ${statusTagAfter?.trim()}）`);
    else fail('状态切换生效', '切换前后文案相同');
    await assertVisible(page.locator('#btn-open-import'), '状态切换后导入按钮仍可用（不锁定）');

    // ===== 场景 4：导入 Excel（含容错） =====
    console.log('=== 场景4：导入 Excel ===');
    await page.locator('#btn-open-import').click();
    await assertVisible(page.locator('#modal-import'), '导入弹窗打开');
    await page.locator('#input-file-import').setInputFiles(path.join(FIXTURES_DIR, 'mixed-valid-invalid.xlsx'));
    await page.locator('#btn-start-import').click();
    await page.waitForSelector('#import-result', { timeout: 10000 });
    const importResultText = await page.locator('#import-result').textContent();
    if (importResultText.includes('3') && importResultText.includes('2')) pass(`导入结果面板显示成功/失败行数（${importResultText.trim()}）`);
    else fail('导入结果面板显示成功/失败行数', importResultText);
    // 关闭弹窗
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // ===== 场景 5：明细列表展示 + 搜索 =====
    console.log('=== 场景5：保单明细列表 + 搜索 ===');
    await assertVisible(page.locator('#table-record-list'), '保单明细表格可见');
    await page.locator('#input-search-record').fill('WO-IT-0001');
    await page.waitForTimeout(800); // 防抖
    const rowCountAfterSearch = await page.locator('#table-record-list tbody tr').count();
    await assertEq(rowCountAfterSearch, 1, '按工作单号搜索命中1条');
    await page.locator('#input-search-record').fill('');
    await page.waitForTimeout(800);

    // ===== 场景 6：回填状态筛选下拉 =====
    console.log('=== 场景6：回填状态筛选 ===');
    await assertVisible(page.locator('#select-fill-status-filter'), '回填状态筛选下拉可见');

    // ===== 场景 7：人工补录 + 提成汇总联动刷新（ic-v1-013 核心回归点） =====
    console.log('=== 场景7：人工补录销售人员 + 提成汇总实时联动刷新 ===');
    await assertVisible(page.locator('#commission-summary-panel-mount'), '提成汇总区块可见');
    const summaryTextBefore = await page.locator('#commission-summary-panel-mount').textContent();
    // 点击第一行展开编辑
    await page.locator('#table-record-list tbody tr').first().click();
    await page.waitForTimeout(300);
    const firstRowId = await page.locator('#table-record-list tbody tr').first().getAttribute('data-row-key').catch(() => null);
    // 用通用方式：找到展开区域内第一个可见的销售人员输入框
    const nameInput = page.locator('[id^="input-sales-name-"]').first();
    await assertVisible(nameInput, '展开行内销售人员输入框可见');
    await nameInput.fill('Playwright验证员');
    const saveBtn = page.locator('[id^="btn-save-sales-"]').first();
    await saveBtn.click();
    await page.waitForTimeout(1500); // 等待保存 + 联动刷新
    const rowText = await page.locator('#table-record-list tbody tr').first().textContent();
    if (rowText.includes('Playwright验证员')) pass('明细行销售列更新为新姓名');
    else fail('明细行销售列更新为新姓名', rowText);
    const summaryTextAfter = await page.locator('#commission-summary-panel-mount').textContent();
    if (summaryTextAfter !== summaryTextBefore) pass('提成汇总卡片无需刷新页面即自动更新（ic-v1-013 回归验证）');
    else fail('提成汇总卡片无需刷新页面即自动更新（ic-v1-013 回归验证）', '补录前后汇总区文本未变化');

    // ===== 场景 8：查看补录修改历史 =====
    console.log('=== 场景8：查看修改历史抽屉 ===');
    // handleSaveSalesName 保存成功后会收起展开行，需重新展开才能看到"查看修改历史"按钮
    await page.locator('#table-record-list tbody tr').first().click();
    await page.waitForTimeout(300);
    await page.locator('#btn-view-record-history').first().click();
    await assertVisible(page.locator('#drawer-record-history'), '修改历史抽屉打开');
    await page.waitForTimeout(500);
    const historyBody = await page.locator('#record-history-body').textContent();
    if (historyBody.includes('Playwright验证员')) pass('修改历史包含刚才的补录记录');
    else fail('修改历史包含刚才的补录记录', historyBody);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // ===== 场景 9：导出 Excel + 导出历史 =====
    console.log('=== 场景9：导出 Excel + 查看导出历史 ===');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
      page.locator('#btn-export').click(),
    ]);
    if (download) pass(`导出触发浏览器下载（文件名：${download.suggestedFilename()}）`);
    else fail('导出触发浏览器下载', '未捕获到 download 事件');
    await page.waitForTimeout(500);
    await page.locator('#btn-view-export-history').click();
    await assertVisible(page.locator('#drawer-export-history'), '导出历史抽屉打开');
    await page.waitForTimeout(500);
    const exportBody = await page.locator('#export-history-body').textContent();
    if (exportBody && exportBody.trim().length > 0 && !exportBody.includes('暂无')) pass('导出历史列表非空');
    else fail('导出历史列表非空', exportBody);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // ===== 场景 10：提成阶梯规则页 =====
    console.log('=== 场景10：提成阶梯规则页·冲突提示 ===');
    await page.getByRole('link', { name: '提成阶梯规则' }).click();
    await page.waitForURL(/commission-tiers$/, { timeout: 8000 });
    await page.locator('#table-rule-list').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await assertVisible(page.locator('#table-rule-list'), '阶梯规则表格可见');
    await page.locator('#btn-add-tier').click();
    await assertVisible(page.locator('#modal-rule-edit'), '新增档位弹窗打开');
    // 已知 flow4 建了 (0,50]/(50,+∞) 两档，尝试新增一个必冲突的区间
    await page.locator('#input-tier-lower').fill('10');
    await page.locator('#input-tier-upper').fill('30');
    await page.locator('#input-tier-price').fill('1');
    await page.locator('#btn-save-tier').click();
    await page.waitForTimeout(800);
    const conflictVisible = await page.locator('#error-tier-conflict').isVisible().catch(() => false);
    const modalStillOpen = await page.locator('#modal-rule-edit').isVisible().catch(() => false);
    if (conflictVisible && modalStillOpen) pass('区间冲突时字段级错误展示且弹窗不关闭');
    else fail('区间冲突时字段级错误展示且弹窗不关闭', `conflictVisible=${conflictVisible}, modalOpen=${modalStillOpen}`);
    // 表单已 dirty，点关闭按钮会触发 FE-EP-05 未保存离开确认，选"放弃修改"真正关闭
    await page.locator('#modal-rule-edit .el-dialog__headerbtn').click().catch(() => {});
    await page.waitForTimeout(300);
    const discardBtn = page.getByRole('button', { name: '放弃修改' });
    if (await discardBtn.isVisible().catch(() => false)) {
      await discardBtn.click();
      pass('未保存离开确认弹出，点击"放弃修改"关闭编辑弹窗');
    } else {
      fail('未保存离开确认弹出，点击"放弃修改"关闭编辑弹窗', '未出现确认弹窗');
    }
    await page.waitForTimeout(300);

    // ===== 场景 11：阶梯规则变更历史 =====
    console.log('=== 场景11：阶梯规则变更历史 ===');
    await page.locator('#btn-view-rule-history').click();
    await assertVisible(page.locator('#drawer-rule-history'), '规则变更历史抽屉打开');
    await page.waitForTimeout(500);
    const ruleHistoryBody = await page.locator('#rule-history-body').textContent();
    if (ruleHistoryBody && ruleHistoryBody.trim().length > 0) pass('规则变更历史非空');
    else fail('规则变更历史非空', ruleHistoryBody);
    await page.keyboard.press('Escape');

    // ===== 视觉冒烟断言（design.md §〇，固定3条）=====
    console.log('=== 视觉冒烟断言 ===');
    const primaryColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--el-color-primary').trim(),
    );
    await assertEq(primaryColor.toLowerCase(), '#1677ff', '主色覆盖 --el-color-primary');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow <= 0) pass(`视口无横向外溢（scrollWidth-innerWidth=${overflow}）`);
    else fail('视口无横向外溢', `溢出 ${overflow}px`);

    const headerHeight = await page.evaluate(() => {
      const header = document.querySelector('.app-layout__header') || document.querySelector('header');
      return header ? header.offsetHeight : null;
    });
    await assertEq(headerHeight, 56, '顶栏高度');
  } catch (e) {
    fail('脚本执行异常', e.message);
    await page.screenshot({ path: path.join(__dirname, 'error-screenshot.png') }).catch(() => {});
  } finally {
    await browser.close();
  }

  console.log('\n==================================');
  console.log(`通过 ${PASS} 项 / 失败 ${FAIL} 项`);
  if (FAIL > 0) {
    console.log('失败详情：');
    FAIL_DETAIL.forEach((d) => console.log(`  - ${d}`));
    process.exit(1);
  }
  process.exit(0);
}

main();

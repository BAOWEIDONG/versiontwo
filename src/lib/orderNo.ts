/**
 * 业务订单号统一生成工具。
 *
 * 积分兑换、连续打卡奖励领取共用同一套单号格式：
 *   yyyyMMddHHmmss（流水时间）+ 4 位随机数字
 *
 * 单号仅用于后台可追溯留痕，前端界面不展示。
 */

/** 从 yyyy-MM-dd HH:mm:ss 提取紧凑的 yyyyMMddHHmmss 部分 */
function compactTs(dateStr: string): string {
  return dateStr.replace(/[-: ]/g, '');
}

/**
 * 生成业务订单号。
 * @param dateStr 源头时间 yyyy-MM-dd HH:mm:ss（订单生成时刻）
 * @param rand   可选 4 位数字后缀；不传则本地随机生成。种子/测试如需稳定单号可显式传入。
 * @returns yyyyMMddHHmmss + 随机4位，如 202609011430258421
 */
export function genOrderNo(dateStr: string, rand?: string): string {
  const tail = rand ?? String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `${compactTs(dateStr)}${tail}`;
}
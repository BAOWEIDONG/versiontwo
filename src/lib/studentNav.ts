/**
 * 学员端底部主导航当前高亮索引：0=首页 1=活动 2=消息 3=档案。
 *
 * 高亮由 currentView 推导，而非各页面手写一个 int ——此前「档案页却亮了活动」就是
 * 手写索引复制错位所致(HealthProfileView 用了 activity 页的 model-value)。四个主页面
 * 点进去时 currentView 即自身，故推导与手写等价且永不漂移；子页(积分商城/我的奖励等)
 * 需「高亮其入口父tab」，不走此函数、保持各自手写的语义。
 */
export function studentNavIndex(view: string): number {
  switch (view) {
    case 'health-profile':
      return 3;
    case 'messages':
      return 2;
    case 'activity-hub':
      return 1;
    default:
      return 0; // dashboard 及未知视图回退首页
  }
}
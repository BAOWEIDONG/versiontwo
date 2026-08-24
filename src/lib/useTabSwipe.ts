import type { Ref } from 'vue';

/**
 * 数据页顶部 sheet tab 支持左右滑动切换。
 * 绑定到根容器上：@touchstart.passive="th" @touchend.passive="th"
 * 仅在该手势被判定为横向滑动时切换 activeTab（打卡 ⇄ 趋势 ⇄ 记录），
 * 纵向滚动（|dy| > |dx|）或滑动距离过小则不触发，避免和页面滚动冲突。
 */
export function useTabSwipe<T extends string>(activeTab: Ref<T>, tabs: readonly T[], threshold = 50) {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    startX = t.clientX;
    startY = t.clientY;
    tracking = true;
  }

  function onTouchEnd(e: TouchEvent) {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    // 仅在横向滑动且位移足够时切换
    if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy)) return;
    const cur = tabs.indexOf(activeTab.value);
    const next = dx < 0 ? Math.min(cur + 1, tabs.length - 1) : Math.max(cur - 1, 0);
    if (next !== cur) activeTab.value = tabs[next];
  }

  return { onTouchStart, onTouchEnd };
}
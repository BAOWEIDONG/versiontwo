import { onMounted, onBeforeUnmount, type Ref } from 'vue';

/**
 * 数据页顶部 sheet tab 支持左右滑动切换。
 *
 * 用 onMounted + addEventListener 把 touch 事件直接绑到容器元素上（而非模板
 * `@touchstart.passive` 属性），以免疫生产构建里模板事件属性被压缩改名而错绑
 * 到其它处理器、导致滑动失效的问题（曾因该坑全站三个数据页滑动都失灵）。
 *
 * 仅在该手势被判定为横向滑动时切换 activeTab（打卡 ⇄ 趋势 ⇄ 记录），
 * 纵向滚动（|dy| > |dx|）或滑动距离过小则不触发，避免和页面滚动冲突。
 */
export function useTabSwipe<T extends string>(container: Ref<HTMLElement | null>, activeTab: Ref<T>, tabs: readonly T[], threshold = 50) {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    // 忽略起始于顶部导航/底部标签栏的手势，避免干扰页面切换或底部导航
    const target = e.target as HTMLElement | null;
    if (target && target.closest('.van-nav-bar, .van-tabbar')) return;
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

  onMounted(() => {
    const el = container.value;
    if (el) {
      el.addEventListener('touchstart', onTouchStart, { passive: true });
      el.addEventListener('touchend', onTouchEnd, { passive: true });
    }
  });

  onBeforeUnmount(() => {
    const el = container.value;
    if (el) {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    }
  });
}
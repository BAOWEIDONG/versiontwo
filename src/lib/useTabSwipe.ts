import { onMounted, onBeforeUnmount, type Ref } from 'vue';

/**
 * 数据页顶部 sheet tab 支持左右滑动切换（打卡 ⇄ 趋势 ⇄ 记录 / 消息分类）。
 *
 * 用 onMounted + addEventListener 把 touch 事件直接绑到容器元素上（而非模板
 * `@touchstart.passive` 属性），以免疫生产构建里模板事件属性被压缩改名而错绑
 * 到其它处理器、导致滑动失效的问题（曾因该坑全站三个数据页滑动都失灵）。
 *
 * 与过往「仅凭 touchend 的起止位移判断方向」不同，这里在 touchmove 阶段就实时
 * 锁定方向，除非滚动中途出现明显横向位移，否则纵向滚动不会误切 tab（修复消息中心
 * 上下滑列表时手指带斜向偏移、松手瞬间把 tab 切走的根因）。
 *
 * 判定为横向滑动后会对 touchmove 调用 preventDefault()：既阻止页面纵向滚动，也
 * 吃掉本可能落在消息卡片/打卡按钮上的合成 click（避免「滑动切 tab 的同时又打开了
 * 一条消息」）。纵向锁定或位移过小的点按则完全不干预，点按照常触发 click。
 */
export function useTabSwipe<T extends string>(
  container: Ref<HTMLElement | null>,
  activeTab: Ref<T>,
  tabs: readonly T[],
  threshold = 50,
) {
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let blocked = false; // 手势起点在横向滚动容器内（如记录页照片墙），让原生横向滚动接管，不切 tab
  let axis: 'idle' | 'h' | 'v' = 'idle';

  // 手势起点是否落在「内容确实可横向滚动」的容器内（overflow-x 且 scrollWidth>clientWidth）
  function isHorizontalScrollTarget(root: HTMLElement, target: HTMLElement): boolean {
    let el: HTMLElement | null = target;
    while (el && el !== root) {
      const cs = getComputedStyle(el);
      const ox = cs.overflowX;
      if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
      el = el.parentElement;
    }
    return false;
  }

  function onTouchStart(e: TouchEvent) {
    const target = e.target as HTMLElement | null;
    if (target && target.closest('.van-nav-bar, .van-tabbar')) return; // 顶部导航/底部 tabs 上的手势不参与
    const t = e.touches[0];
    if (!t) return;
    startX = t.clientX;
    startY = t.clientY;
    tracking = true;
    axis = 'idle';
    blocked = target && container.value ? isHorizontalScrollTarget(container.value, target) : false;
  }

  function onTouchMove(e: TouchEvent) {
    if (!tracking || blocked) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    // 起手阶段即锁定方向（横/纵），而不是拖到放手才用两端位移猜
    if (axis === 'idle' && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      axis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    }
    // 横向锁定后，阻止页面纵向滚动 & 阻止手放开时对该处按钮合成 click
    if (axis === 'h') {
      if (e.cancelable) e.preventDefault();
    }
  }

  function onTouchEnd(e: TouchEvent) {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    const a = axis;
    const wasBlocked = blocked;
    axis = 'idle';
    blocked = false;
    // 起点在横向滚动容器内，或方向纵向、或位移不足 → 不切 tab
    if (wasBlocked || a === 'v') return;
    if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy)) return;
    const cur = tabs.indexOf(activeTab.value);
    const next = dx < 0 ? Math.min(cur + 1, tabs.length - 1) : Math.max(cur - 1, 0);
    if (next !== cur) activeTab.value = tabs[next];
  }

  function onTouchCancel() {
    tracking = false;
    blocked = false;
    axis = 'idle';
  }

  onMounted(() => {
    const el = container.value;
    if (el) {
      el.addEventListener('touchstart', onTouchStart, { passive: true });
      el.addEventListener('touchmove', onTouchMove, { passive: false }); // 需要 preventDefault
      el.addEventListener('touchend', onTouchEnd, { passive: true });
      el.addEventListener('touchcancel', onTouchCancel);
    }
  });

  onBeforeUnmount(() => {
    const el = container.value;
    if (el) {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
    }
  });
}
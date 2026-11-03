import { onBeforeUnmount, onMounted, type Ref } from 'vue';

interface EdgeSwipeOptions {
  /** 是否还有上一页可返回 */
  canGoBack: () => boolean;
  /** 触发返回 */
  onBack: () => void;
  /** 需要跟随手指位移的页面容器（可选） */
  target?: Ref<HTMLElement | null>;
  /** 触发区宽度（距左边缘 px） */
  edge?: number;
  /** 触发返回的滑动距离（px） */
  threshold?: number;
}

/**
 * 微信/H5 边缘滑动返回：
 * - 仅从左侧边缘（默认 24px）开始；
 * - 纵向优先的滑动不拦截；
 * - 横向右滑超过阈值后触发内部返回，并带位移动画；
 * - 页面内横向轮播若从非边缘开始，不受影响。
 */
export function useEdgeSwipeBack(options: EdgeSwipeOptions) {
  const edge = options.edge ?? 24;
  const threshold = options.threshold ?? 90;

  let tracking = false;
  let active = false;
  let startX = 0;
  let startY = 0;
  let lastDx = 0;

  const reset = () => {
    tracking = false;
    active = false;
    lastDx = 0;
    const el = options.target?.value;
    if (el) {
      el.style.transition = 'transform 0.18s ease';
      el.style.transform = '';
      setTimeout(() => { if (el) el.style.transition = ''; }, 200);
    }
  };

  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.clientX > edge) return;
    if (!options.canGoBack()) return;
    tracking = true;
    active = false;
    startX = t.clientX;
    startY = t.clientY;
    lastDx = 0;
  };

  const onMove = (e: TouchEvent) => {
    if (!tracking) return;
    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    if (!active) {
      // 纵向优先 → 放弃手势，交给页面滚动
      if (Math.abs(dy) > Math.abs(dx)) { tracking = false; return; }
      if (dx <= 8) return;
      active = true;
    }
    if (dx <= 0) return;

    e.preventDefault();
    lastDx = dx;
    const el = options.target?.value;
    if (el) {
      el.style.transition = 'none';
      el.style.transform = `translate3d(${Math.min(dx, window.innerWidth * 0.4)}px,0,0)`;
    }
  };

  const onEnd = () => {
    if (!tracking) return;
    const shouldBack = active && lastDx >= Math.min(threshold, window.innerWidth * 0.3);
    const el = options.target?.value;
    if (shouldBack) {
      if (el) {
        el.style.transition = 'transform 0.16s ease';
        el.style.transform = 'translate3d(100%,0,0)';
      }
      setTimeout(() => {
        options.onBack();
        if (el) {
          el.style.transition = 'none';
          el.style.transform = '';
          setTimeout(() => { if (el) el.style.transition = ''; }, 30);
        }
        tracking = false;
        active = false;
        lastDx = 0;
      }, 140);
    } else {
      reset();
    }
  };

  onMounted(() => {
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('touchstart', onStart);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
    document.removeEventListener('touchcancel', onEnd);
  });
}

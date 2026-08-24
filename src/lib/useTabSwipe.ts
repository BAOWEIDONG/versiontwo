import { onMounted, onBeforeUnmount, type Ref } from 'vue';

/**
 * 数据页顶部 sheet tab 支持左右滑动切换（打卡 ⇄ 趋势 ⇄ 记录 / 消息分类）。
 *
 * 用 onMounted + addEventListener 把 touch 事件直接绑到容器元素上（而非模板
 * `@touchstart.passive` 属性），以免疫生产构建里模板事件属性被压缩改名而错绑
 * 到其它处理器、导致滑动失效的问题（曾因该坑全站三个数据页滑动都失灵）。
 *
 * 方向锁定策略（v16 收紧）：不在起手第一个采样点就定死横/纵——那会导致开头微微
 * 上下抖动(>8px)即被误锁成纵向，后续真正的横向回滑被无视、tab「卡住不动」。
 * 现改为：位移至少达到 LOCK_BASE(16px) 且方向占优（横向需 |dx| > |dy|*1.2）才锁定。
 * 斜向(近45°)、点按漂移则保持 idle，交由原生行为/点击处理。
 *
 * 已确认为真实横滑后才对 touchmove preventDefault()：阻止页面纵向滚动 + 吃掉松手时
 * 落点按钮的合成 click（避免「滑切 tab 又误开消息」）。preventDefault 有 PD_MIN(24px)
 * 门控，避免把带轻微横向抖动的一点(>8px)也吞掉点击——那会「点击没反应、要反复点」。
 * 纵向锁定、blocked、位移过小的点按完全不干预，点按照常触发 click。
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

  // 方向锁定的最小绝对位移：手势位移到这个量级才有资格被判为横/纵滑。
  // 太小(如 8px)会让「起手第一个采样点微微上下抖 12px」就锁死纵向，后续横向回滑被无视→tab 卡住。
  const LOCK_BASE = 16;
  // 横滑才调 preventDefault 的最小位移：防止带轻微横向漂移的点按(>8px)被吞掉 click→要点多次。
  // 需切 tab 的横滑至少 50px，其过程位移必超此阈值，故仍能阻止误开消息。
  const PD_MIN = 24;
  // 横向优势比：|dx| > |dy|*1.2 才判为横滑；近 45° 斜向手势保持 idle，不抢不误判。
  const H_DOMINANCE = 1.2;

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
    // 方向锁定（横/纵）——要等位移足够大且方向占优才锁，
    // 而不是起手第一个采样点(>8px)就定死，避免回滑/斜向起手抖动被误锁成纵向而「卡住」。
    if (axis === 'idle') {
      const maxAbs = Math.max(Math.abs(dx), Math.abs(dy));
      if (maxAbs >= LOCK_BASE) {
        if (Math.abs(dx) > Math.abs(dy) * H_DOMINANCE) axis = 'h';
        else if (Math.abs(dy) > Math.abs(dx)) axis = 'v';
      }
    }
    // 已确认是真实横滑(位移够大)后才：阻止页面纵向滚动 + 吃掉松手时该处按钮的合成 click。
    // 低于 PD_MIN 的轻微漂移不 preventDefault，保住点按的 click。
    if (axis === 'h' && Math.abs(dx) >= PD_MIN) {
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
/**
 * 学员端消息中心「已读追踪」持久化。
 *
 * 语义：
 * - `ranks`：各营期上次访问时的排名（排名动态未读 = 排名相对该记录发生变化）。
 * - `lastSystemSeenAt`：学员最近一次离开消息中心的时刻(epoch ms)。系统通知(奖励领取/兑换/发货)
 *   的事件时间晚于该时刻即未读——这是跨页面「消息 Tab 角标」与消息页内「系统通知」红点共用的口径，
 *   由 store.getStudentMsgUnreadCount 与 MessagesView 共用，保证角标任何页面下一致。
 *
 * userId 内聚：结构为 { [userId]: { ranks, lastSystemSeenAt } }。
 */
export const MSG_SEEN_KEY = 'camp_msg_seen';

export interface MsgSeenState {
  /** 按营期记录上次查看时的排名 */
  ranks: Record<string, number>;
  /** 最近一次查看消息中心的时刻(epoch ms)；0 = 从未查看（首见时既有系统通知均未读） */
  lastSystemSeenAt: number;
}

export function loadMsgSeenState(userId: string): MsgSeenState {
  if (!userId) return { ranks: {}, lastSystemSeenAt: 0 };
  try {
    const raw = localStorage.getItem(MSG_SEEN_KEY);
    if (!raw) return { ranks: {}, lastSystemSeenAt: 0 };
    const all = JSON.parse(raw);
    const s = all[userId] || {};
    return { ranks: s.ranks || {}, lastSystemSeenAt: (s.lastSystemSeenAt as number) || 0 };
  } catch {
    return { ranks: {}, lastSystemSeenAt: 0 };
  }
}

export function saveMsgSeenState(userId: string, next: Partial<MsgSeenState>) {
  if (!userId) return;
  try {
    const raw = localStorage.getItem(MSG_SEEN_KEY);
    const all = raw ? JSON.parse(raw) : {};
    const prev = all[userId] || { ranks: {}, lastSystemSeenAt: 0 };
    all[userId] = {
      ranks: next.ranks ?? prev.ranks,
      lastSystemSeenAt: next.lastSystemSeenAt ?? prev.lastSystemSeenAt,
    };
    localStorage.setItem(MSG_SEEN_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/**
 * 系统通知（奖励领取/发货、积分兑换/发货）是否未读：事件时间晚于最近查看时刻即未读。
 * 不同于批注消息( commentRead 字段)，系统通知无记录级已读字段，只能按时刻判。
 */
export function systemMsgUnread(seen: MsgSeenState, dateStr: string | undefined | null): boolean {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  return !Number.isNaN(t) && t > seen.lastSystemSeenAt;
}
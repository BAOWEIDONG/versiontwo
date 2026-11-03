/**
 * 本地存储命名空间：同域名下 versionone / versiontwo 共用 localStorage，
 * 必须按项目加前缀，避免登录态、账户、问卷、已读等数据互相串用。
 */
const PREFIX = 'v2:';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const storage: StorageLike & { keys: () => string[] } = {
  getItem: (key: string) => localStorage.getItem(PREFIX + key),
  setItem: (key: string, value: string) => localStorage.setItem(PREFIX + key, value),
  removeItem: (key: string) => localStorage.removeItem(PREFIX + key),
  /** 当前项目命名空间下的所有 key（已去掉前缀） */
  keys: () => Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .map((k) => k.slice(PREFIX.length)),
};

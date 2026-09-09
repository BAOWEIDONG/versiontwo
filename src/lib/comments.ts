import type { CheckinComment } from '../types';

/**
 * 取一条打卡记录的全部批注。
 * 语义：记录上以 `comments` 数组为准（append 不覆盖，可多名同角色人员分别批注）；
 * 无 `comments` 时退化为旧的单品字段（dietitian* / coach*），归一成单条，保证存量数据也能展示。
 */
export function recordComments(rec: unknown): CheckinComment[] {
  const r = rec as Record<string, unknown> & { id?: string; date?: string };
  if (Array.isArray(r?.comments) && (r.comments as CheckinComment[]).length > 0) {
    return r.comments as CheckinComment[];
  }
  const isCoach = Boolean(r?.coachComment);
  const text = (isCoach ? r?.coachComment : r?.dietitianComment) as string | undefined;
  if (!text) return [];
  return [
    {
      id: `legacy_${r?.id || 'x'}`,
      role: isCoach ? 'coach' : 'dietitian',
      name: ((isCoach ? r?.coachName : r?.dietitianName) as string) || (isCoach ? '教练' : '营养师'),
      text,
      date: ((isCoach ? r?.coachCommentDate : r?.dietitianCommentDate) as string) || r?.date || '',
    },
  ];
}
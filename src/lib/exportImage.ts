/**
 * 长图导出工具
 *
 * html2canvas-pro 渲染 DOM 成 PNG 长图（支持 Tailwind v4 oklch 颜色；
 * 原版 html2canvas 不支持会抛错）。失败时仅提示，不调用打印。
 */
import { showToast } from 'vant';
import html2canvas from 'html2canvas-pro';

/** 导出结果：'image' 长图 | 'failed' 失败 */
export type ExportMode = 'image' | 'failed';

/**
 * 把指定元素导出为 PNG 长图并触发下载。
 * @returns 实际使用的导出模式
 */
export async function exportElementAsImage(
  el: HTMLElement,
  filename: string,
): Promise<ExportMode> {
  showToast({ message: '正在生成图片，请稍候…', duration: 1500 });
  try {
    const canvas = await html2canvas(el, {
      scale: 2, // 2x 清晰度，手机上查看不糊
      useCORS: true,
      backgroundColor: '#F7F8FA',
      logging: false,
    });
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast({ message: '长图已生成，可长按保存或分享', duration: 2500 });
    return 'image';
  } catch (e) {
    console.error('长图导出失败', e);
    showToast({ message: '长图生成失败，请重试', duration: 2500 });
    return 'failed';
  }
}

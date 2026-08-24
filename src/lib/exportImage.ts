/**
 * 报告导出工具
 *
 * 首选：html2canvas 把报告 DOM 截成 PNG 长图（微信内置浏览器可用，长按即可保存/分享）。
 * 降级：html2canvas 渲染失败时回退到 window.print()（PC 浏览器可另存为 PDF）。
 *
 * html2canvas 为静态依赖（package.json dependencies），随构建打包。
 */
import { showToast } from 'vant';
import html2canvas from 'html2canvas';

/** 导出结果：'image' 长图 | 'print' 打印降级 */
export type ExportMode = 'image' | 'print';

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
    console.error('长图导出失败，回退打印', e);
    showToast({ message: '长图生成失败，已切换为打印导出', duration: 2000 });
    setTimeout(() => window.print(), 400);
    return 'print';
  }
}

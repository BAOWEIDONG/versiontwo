/**
 * 报告导出工具
 *
 * 首选：html2canvas 把报告 DOM 截成 PNG 长图（微信内置浏览器可用，长按即可保存/分享）。
 * 降级：未安装 html2canvas 时回退到 window.print()（PC 浏览器可另存为 PDF）。
 *
 * 注意：html2canvas 不在 package.json 默认依赖中，
 *       需要在本机执行 `npm i html2canvas` 后长图导出才会启用。
 */
import { showToast } from 'vant';

/** 导出结果：'image' 长图 | 'print' 打印降级 */
export type ExportMode = 'image' | 'print';

/**
 * 动态加载 html2canvas。
 * 用变量拼路径绕过 Vite 静态分析，未安装时运行时报错被 catch 兜底。
 */
async function loadHtml2Canvas(): Promise<typeof import('html2canvas')['default'] | null> {
  try {
    // 变量拼路径，Vite 无法静态分析 → 不会在编译期报错
    const moduleName = 'html2canvas';
    const mod: any = await (Function('m', 'return import(m)')(moduleName));
    return mod.default;
  } catch {
    return null;
  }
}

/**
 * 把指定元素导出为 PNG 长图并触发下载。
 * @returns 实际使用的导出模式
 */
export async function exportElementAsImage(
  el: HTMLElement,
  filename: string,
): Promise<ExportMode> {
  const html2canvas = await loadHtml2Canvas();

  if (!html2canvas) {
    showToast({ message: '未检测到长图组件，已切换为打印导出', duration: 2000 });
    setTimeout(() => window.print(), 400);
    return 'print';
  }

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

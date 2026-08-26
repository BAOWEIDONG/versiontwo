/**
 * 报告导出工具（PDF 版）
 *
 * html2canvas-pro 渲染报告 DOM（支持 Tailwind v4 的 oklch 颜色，原版 html2canvas 不支持会抛错），
 * jsPDF 按 A4 宽度分页写入图片，直接生成多页 PDF 下载。
 * 不使用 window.print 降级。
 */
import { showToast } from 'vant';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

/**
 * 把指定元素导出为 A4 分页 PDF 并触发下载。
 */
export async function exportElementAsPDF(
  el: HTMLElement,
  filename: string,
): Promise<boolean> {
  showToast({ message: '正在生成 PDF，请稍候…', duration: 1500 });
  try {
    const canvas = await html2canvas(el, {
      scale: 2, // 2x 清晰度
      useCORS: true,
      backgroundColor: '#F7F8FA',
      logging: false,
    });

    // A4 竖版：210 x 297 mm
    const pageWidth = 210;
    const pageHeight = 297;
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height / canvas.width) * imgWidth;

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    if (imgHeight <= pageHeight) {
      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
    } else {
      // 长图按 A4 高度切片分页
      let remaining = imgHeight;
      let position = 0;
      while (remaining > 0) {
        if (position > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, -position, imgWidth, imgHeight);
        position += pageHeight;
        remaining -= pageHeight;
      }
    }

    pdf.save(`${filename}.pdf`);
    showToast({ message: 'PDF 已生成', duration: 2500 });
    return true;
  } catch (e) {
    console.error('PDF 导出失败', e);
    showToast({ message: 'PDF 生成失败，请重试', duration: 2500 });
    return false;
  }
}

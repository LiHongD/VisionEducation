import type { Metadata } from 'next';
export const metadata: Metadata = { title: '行知实验室 · 武术动作识别课堂', description: '学生动手实践，教师收件讲评。六课武术动作识别课程。' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="zh-CN"><body>{children}</body></html>; }

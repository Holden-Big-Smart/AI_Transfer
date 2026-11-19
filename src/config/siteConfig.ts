// src/config/siteConfig.ts

// 浏览器标签页统一前缀，可随时自定义
export const SITE_BRAND_PREFIX = 'DCM';

// 路由前缀与标签名称映射表（后续新增页面模块，只需在此数组追加配置即可）
export interface RouteTitleRule {
  pathPrefix: string;
  label: string;
}

export const ROUTE_TITLE_RULES: RouteTitleRule[] = [
  { pathPrefix: '/file-center', label: '文件' },
  { pathPrefix: '/notes', label: '笔记' },
  { pathPrefix: '/ai-copilot', label: '助手' },
  { pathPrefix: '/users', label: '成员' },
  { pathPrefix: '/login', label: '登录' }
];

// 根据当前路由路径与登录状态，动态拼接浏览器标签名（如 "DCM-文件"、"DCM-笔记"）
export function resolveDocumentTitle(pathname: string, isAuthenticated: boolean): string {
  if (!isAuthenticated) {
    return `${SITE_BRAND_PREFIX}-登录`;
  }
  const matched = ROUTE_TITLE_RULES.find((rule) => pathname.startsWith(rule.pathPrefix));
  if (matched) {
    return `${SITE_BRAND_PREFIX}-${matched.label}`;
  }
  return SITE_BRAND_PREFIX;
}

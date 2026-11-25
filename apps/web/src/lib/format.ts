export function formatTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function relativeTime(value?: string): string {
  if (!value) return "从未";
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return value;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export const PROVIDER_LABEL: Record<string, string> = {
  aliyun: "阿里云",
  tencent: "腾讯云",
};

export const ACTION_LABEL: Record<string, string> = {
  RECORD_CREATE: "新建记录",
  RECORD_UPDATE: "修改记录",
  RECORD_DELETE: "删除记录",
  RECORD_TOGGLE: "启停记录",
  HOST_CREATE: "新建主机",
  HOST_UPDATE: "修改主机",
  HOST_DELETE: "删除主机",
  HOST_IMPORT: "导入主机",
  HOST_ADDRESS_CHANGE: "主机换 IP",
  HOST_ROLLOUT: "同步记录 IP",
};

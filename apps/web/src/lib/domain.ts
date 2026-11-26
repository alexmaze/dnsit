/** 统一域名的比较键：去空格、转小写、去掉末尾的点。 */
export function domainKey(fqdn: string): string {
  return fqdn.trim().toLowerCase().replace(/\.$/, "");
}

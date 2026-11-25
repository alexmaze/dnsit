import {
  fqdnOf,
  isWithinZone,
  normalizeFqdn,
  normalizeRecordName,
  relativeName,
} from "./record-types.js";
import type { NormalizedRecord } from "./types.js";

export interface ExternalTarget {
  fqdn: string;
  inPlatform: boolean;
  zoneId?: string;
}

export interface TreeEdge {
  via: NormalizedRecord;
  node: TreeNode;
}

export interface TreeNode {
  name: string;
  fqdn: string;
  records: NormalizedRecord[];
  children: TreeEdge[];
  externals: ExternalTarget[];
  dangling: boolean;
  cycle: boolean;
  multiTarget: boolean;
  disabledTarget: boolean;
  parentCount: number;
}

export interface ZoneTree {
  roots: TreeNode[];
  nodes: Map<string, TreeNode>;
  stats: {
    nodes: number;
    records: number;
    dangling: number;
    external: number;
    cycles: number;
  };
}

export interface BuildTreeOptions {
  zoneName: string;
  records: NormalizedRecord[];
  platformZones?: Array<{ name: string; zoneId?: string }>;
}

function emptyNode(name: string, zone: string, dangling: boolean): TreeNode {
  return {
    name,
    fqdn: fqdnOf(zone, name),
    records: [],
    children: [],
    externals: [],
    dangling,
    cycle: false,
    multiTarget: false,
    disabledTarget: false,
    parentCount: 0,
  };
}

export function buildZoneTree({ zoneName, records, platformZones = [] }: BuildTreeOptions): ZoneTree {
  const zone = normalizeFqdn(zoneName);
  const nodes = new Map<string, TreeNode>();

  const ensure = (name: string): TreeNode => {
    const key = normalizeRecordName(name);
    let node = nodes.get(key);
    if (!node) {
      node = emptyNode(key, zone, false);
      nodes.set(key, node);
    }
    return node;
  };

  for (const record of records) {
    ensure(record.name).records.push(record);
  }

  const platformList = platformZones
    .map((item) => ({ name: normalizeFqdn(item.name), zoneId: item.zoneId }))
    .filter((item) => item.name.length > 0)
    .sort((a, b) => b.name.length - a.name.length);

  const findPlatformZone = (fqdn: string) =>
    platformList.find((item) => fqdn === item.name || fqdn.endsWith(`.${item.name}`));

  for (const record of records) {
    if (record.type.toUpperCase() !== "CNAME") continue;
    const target = normalizeFqdn(record.value);
    if (!target) continue;
    const source = ensure(record.name);

    if (isWithinZone(target, zone)) {
      const targetName = normalizeRecordName(relativeName(target, zone));
      const existed = nodes.has(targetName);
      const parent = existed ? nodes.get(targetName)! : emptyNode(targetName, zone, true);
      if (!existed) nodes.set(targetName, parent);
      parent.children.push({ via: record, node: source });
      source.parentCount += 1;
    } else {
      const owner = findPlatformZone(target);
      source.externals.push({
        fqdn: target,
        inPlatform: Boolean(owner),
        zoneId: owner?.zoneId,
      });
    }
  }

  for (const node of nodes.values()) {
    node.multiTarget = node.parentCount > 1;
    node.disabledTarget =
      node.records.length > 0 && node.records.every((r) => r.status === "DISABLE");
    node.children.sort((a, b) => a.via.name.localeCompare(b.via.name));
    node.records.sort((a, b) => a.type.localeCompare(b.type));
  }

  const marked = new Set<TreeNode>();
  const walkCycle = (node: TreeNode, path: Set<TreeNode>) => {
    for (const edge of node.children) {
      if (path.has(edge.node)) {
        edge.node.cycle = true;
        continue;
      }
      walkCycle(edge.node, new Set(path).add(edge.node));
    }
  };

  const sortRoots = (list: TreeNode[]) =>
    list.sort((a, b) => {
      if (a.name === "@") return -1;
      if (b.name === "@") return 1;
      return a.name.localeCompare(b.name);
    });

  const roots = sortRoots([...nodes.values()].filter((n) => n.parentCount === 0));
  for (const root of roots) walkCycle(root, new Set([root]));

  const reachable = new Set<TreeNode>();
  const walkReach = (node: TreeNode) => {
    if (reachable.has(node)) return;
    reachable.add(node);
    for (const edge of node.children) walkReach(edge.node);
  };
  for (const root of roots) walkReach(root);
  for (const node of nodes.values()) {
    if (reachable.has(node)) continue;
    node.cycle = true;
    roots.push(node);
    walkReach(node);
  }
  for (const node of nodes.values()) if (node.cycle) marked.add(node);
  sortRoots(roots);

  let dangling = 0;
  let external = 0;
  let cycles = 0;
  for (const node of nodes.values()) {
    if (node.dangling) dangling += 1;
    external += node.externals.length;
    if (node.cycle) cycles += 1;
  }

  return {
    roots,
    nodes,
    stats: { nodes: nodes.size, records: records.length, dangling, external, cycles },
  };
}

export function collectNodeRecords(node: TreeNode, acc: NormalizedRecord[] = [], seen = new Set<TreeNode>()): NormalizedRecord[] {
  if (seen.has(node)) return acc;
  seen.add(node);
  acc.push(...node.records);
  for (const edge of node.children) collectNodeRecords(edge.node, acc, seen);
  return acc;
}

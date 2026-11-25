import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Server, X } from "lucide-react";
import { toast } from "sonner";
import type { HostDTO } from "@dnsit/shared";
import { api, errorMessage } from "@/api/client";
import { useHosts } from "@/api/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface BoundAddress {
  addressId: string;
  hostId: string;
  hostName: string;
  ip: string;
}

export function HostPicker({
  value,
  onChange,
  placeholder = "搜索主机名或 IP",
}: {
  value: BoundAddress | null;
  onChange: (next: BoundAddress | null) => void;
  placeholder?: string;
}) {
  const hosts = useHosts();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIp, setNewIp] = useState("");

  const options = useMemo(() => {
    const list: Array<{ host: HostDTO; address: HostDTO["addresses"][number] }> = [];
    for (const host of hosts.data ?? []) {
      for (const address of host.addresses) list.push({ host, address });
    }
    return list.sort((a, b) => (a.address.isPrimary === b.address.isPrimary ? 0 : a.address.isPrimary ? -1 : 1));
  }, [hosts.data]);

  function pick(host: HostDTO, address: HostDTO["addresses"][number]) {
    onChange({ addressId: address.id, hostId: host.id, hostName: host.name, ip: address.ip });
    setOpen(false);
  }

  async function createHost() {
    if (!newName.trim() || !newIp.trim()) {
      toast.error("主机名和 IP 都要填");
      return;
    }
    setCreating(true);
    try {
      const host = await api.post<HostDTO>("/hosts", {
        name: newName.trim(),
        tags: [],
        status: "ACTIVE",
        addresses: [{ ip: newIp.trim(), scope: "PUBLIC" }],
      });
      await queryClient.invalidateQueries({ queryKey: ["hosts"] });
      const address = host.addresses[0];
      if (address) pick(host, address);
      setNewName("");
      setNewIp("");
      toast.success(`已创建主机 ${host.name}`);
    } catch (error) {
      toast.error(errorMessage(error), { duration: 8000 });
    } finally {
      setCreating(false);
    }
  }

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5">
        <Server className="size-3.5 text-muted-foreground" />
        <span className="text-sm font-medium">{value.hostName}</span>
        <span className="font-mono text-xs text-muted-foreground">{value.ip}</span>
        <Badge variant="secondary" className="h-4 px-1 text-[10px]">
          已绑定主机
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto size-6"
          title="解除绑定，改为手填 IP"
          onClick={() => onChange(null)}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-start font-normal">
          <Server className="size-3.5 text-muted-foreground" />
          {placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command>
          <CommandInput placeholder="搜索主机名 / IP / 标签" />
          <CommandList>
            <CommandEmpty>没有匹配的主机，可在下方新建</CommandEmpty>
            <CommandGroup heading="主机地址">
              {options.map((option) => (
                <CommandItem
                  key={option.address.id}
                  value={`${option.host.name} ${option.address.ip} ${option.host.tags.join(" ")}`}
                  onSelect={() => pick(option.host, option.address)}
                  className="gap-2"
                >
                  <span className="w-28 truncate font-medium">{option.host.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{option.address.ip}</span>
                  {option.address.scope === "PRIVATE" ? (
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">
                      内网
                    </Badge>
                  ) : null}
                  {option.address.isPrimary ? <Check className="ml-auto size-3.5 text-muted-foreground" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="space-y-2 border-t border-border/60 p-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Plus className="size-3" /> 新建主机
          </div>
          <div className="flex gap-1.5">
            <Input
              className="h-8"
              placeholder="主机名"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <Input
              className="h-8 font-mono"
              placeholder="IP"
              value={newIp}
              onChange={(event) => setNewIp(event.target.value)}
            />
            <Button type="button" size="sm" className="h-8" onClick={createHost} disabled={creating}>
              创建
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

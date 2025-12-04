#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";
import https from "https";

// Configuration from environment
const PROXMOX_URL = process.env.PROXMOX_URL || "https://192.168.1.1:8006";
const PROXMOX_USER = process.env.PROXMOX_USER || "root@pam";
const PROXMOX_TOKEN_ID = process.env.PROXMOX_TOKEN_ID || "";
const PROXMOX_TOKEN_SECRET = process.env.PROXMOX_TOKEN_SECRET || "";
// Alternative: password auth
const PROXMOX_PASSWORD = process.env.PROXMOX_PASSWORD || "";

// Create axios instance for Proxmox API (self-signed cert support)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

let authHeader: string;
let pveClient: AxiosInstance;

// Initialize authentication
async function initAuth(): Promise<void> {
  if (PROXMOX_TOKEN_ID && PROXMOX_TOKEN_SECRET) {
    // API Token authentication
    authHeader = `PVEAPIToken=${PROXMOX_USER}!${PROXMOX_TOKEN_ID}=${PROXMOX_TOKEN_SECRET}`;
    pveClient = axios.create({
      baseURL: `${PROXMOX_URL}/api2/json`,
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      httpsAgent,
      timeout: 30000,
    });
  } else if (PROXMOX_PASSWORD) {
    // Password authentication - get ticket
    const ticketResponse = await axios.post(
      `${PROXMOX_URL}/api2/json/access/ticket`,
      new URLSearchParams({
        username: PROXMOX_USER,
        password: PROXMOX_PASSWORD,
      }),
      { httpsAgent }
    );
    const { ticket, CSRFPreventionToken } = ticketResponse.data.data;
    pveClient = axios.create({
      baseURL: `${PROXMOX_URL}/api2/json`,
      headers: {
        Cookie: `PVEAuthCookie=${ticket}`,
        CSRFPreventionToken,
        "Content-Type": "application/json",
      },
      httpsAgent,
      timeout: 30000,
    });
  } else {
    throw new Error("No Proxmox authentication configured. Set PROXMOX_TOKEN_ID/SECRET or PROXMOX_PASSWORD");
  }
}

// Tool definitions
const tools = [
  // Cluster & Node Management
  {
    name: "pve_get_cluster_status",
    description: "Get Proxmox cluster status and health",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "pve_list_nodes",
    description: "List all nodes in the Proxmox cluster",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "pve_get_node_status",
    description: "Get detailed status of a specific node",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
      },
      required: ["node"],
    },
  },
  {
    name: "pve_get_node_resources",
    description: "Get CPU, memory, and storage usage for a node",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
      },
      required: ["node"],
    },
  },

  // VM Management
  {
    name: "pve_list_vms",
    description: "List all VMs across the cluster or on a specific node",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Optional: filter by node name" },
      },
    },
  },
  {
    name: "pve_get_vm_status",
    description: "Get detailed status of a specific VM",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
        vmid: { type: "number", description: "VM ID" },
      },
      required: ["node", "vmid"],
    },
  },
  {
    name: "pve_get_vm_config",
    description: "Get configuration of a specific VM",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
        vmid: { type: "number", description: "VM ID" },
      },
      required: ["node", "vmid"],
    },
  },
  {
    name: "pve_start_vm",
    description: "Start a VM",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
        vmid: { type: "number", description: "VM ID" },
      },
      required: ["node", "vmid"],
    },
  },
  {
    name: "pve_stop_vm",
    description: "Stop a VM (graceful shutdown)",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
        vmid: { type: "number", description: "VM ID" },
        force: { type: "boolean", description: "Force stop (hard shutdown)" },
      },
      required: ["node", "vmid"],
    },
  },
  {
    name: "pve_reboot_vm",
    description: "Reboot a VM",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
        vmid: { type: "number", description: "VM ID" },
      },
      required: ["node", "vmid"],
    },
  },
  {
    name: "pve_suspend_vm",
    description: "Suspend a VM",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
        vmid: { type: "number", description: "VM ID" },
      },
      required: ["node", "vmid"],
    },
  },
  {
    name: "pve_resume_vm",
    description: "Resume a suspended VM",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
        vmid: { type: "number", description: "VM ID" },
      },
      required: ["node", "vmid"],
    },
  },
  {
    name: "pve_clone_vm",
    description: "Clone a VM",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Source node name" },
        vmid: { type: "number", description: "Source VM ID" },
        newid: { type: "number", description: "New VM ID" },
        name: { type: "string", description: "New VM name" },
        full: { type: "boolean", description: "Full clone (not linked)" },
        target: { type: "string", description: "Target node (optional)" },
      },
      required: ["node", "vmid", "newid"],
    },
  },
  {
    name: "pve_delete_vm",
    description: "Delete a VM (use with caution!)",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
        vmid: { type: "number", description: "VM ID" },
        purge: { type: "boolean", description: "Remove from backup jobs too" },
      },
      required: ["node", "vmid"],
    },
  },
  {
    name: "pve_migrate_vm",
    description: "Migrate VM to another node",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Source node name" },
        vmid: { type: "number", description: "VM ID" },
        target: { type: "string", description: "Target node name" },
        online: { type: "boolean", description: "Live migration" },
      },
      required: ["node", "vmid", "target"],
    },
  },

  // Container (LXC) Management
  {
    name: "pve_list_containers",
    description: "List all LXC containers",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Optional: filter by node" },
      },
    },
  },
  {
    name: "pve_get_container_status",
    description: "Get status of a container",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
        vmid: { type: "number", description: "Container ID" },
      },
      required: ["node", "vmid"],
    },
  },
  {
    name: "pve_start_container",
    description: "Start a container",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
        vmid: { type: "number", description: "Container ID" },
      },
      required: ["node", "vmid"],
    },
  },
  {
    name: "pve_stop_container",
    description: "Stop a container",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
        vmid: { type: "number", description: "Container ID" },
      },
      required: ["node", "vmid"],
    },
  },

  // Storage Management
  {
    name: "pve_list_storage",
    description: "List all storage pools",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Optional: filter by node" },
      },
    },
  },
  {
    name: "pve_get_storage_content",
    description: "List content of a storage pool",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
        storage: { type: "string", description: "Storage pool name" },
        content: { type: "string", description: "Content type filter (images, iso, backup, etc.)" },
      },
      required: ["node", "storage"],
    },
  },

  // Backup Management
  {
    name: "pve_list_backups",
    description: "List backups for a VM or container",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
        storage: { type: "string", description: "Backup storage" },
        vmid: { type: "number", description: "Optional: filter by VM ID" },
      },
      required: ["node", "storage"],
    },
  },
  {
    name: "pve_create_backup",
    description: "Create a backup of a VM or container",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
        vmid: { type: "number", description: "VM/Container ID" },
        storage: { type: "string", description: "Backup storage" },
        mode: { type: "string", enum: ["snapshot", "suspend", "stop"], description: "Backup mode" },
        compress: { type: "string", enum: ["0", "gzip", "lzo", "zstd"], description: "Compression" },
      },
      required: ["node", "vmid", "storage"],
    },
  },

  // Snapshot Management
  {
    name: "pve_list_snapshots",
    description: "List snapshots of a VM",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
        vmid: { type: "number", description: "VM ID" },
      },
      required: ["node", "vmid"],
    },
  },
  {
    name: "pve_create_snapshot",
    description: "Create a snapshot of a VM",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
        vmid: { type: "number", description: "VM ID" },
        snapname: { type: "string", description: "Snapshot name" },
        description: { type: "string", description: "Description" },
        vmstate: { type: "boolean", description: "Include VM state (RAM)" },
      },
      required: ["node", "vmid", "snapname"],
    },
  },
  {
    name: "pve_rollback_snapshot",
    description: "Rollback VM to a snapshot",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
        vmid: { type: "number", description: "VM ID" },
        snapname: { type: "string", description: "Snapshot name" },
      },
      required: ["node", "vmid", "snapname"],
    },
  },
  {
    name: "pve_delete_snapshot",
    description: "Delete a snapshot",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
        vmid: { type: "number", description: "VM ID" },
        snapname: { type: "string", description: "Snapshot name" },
      },
      required: ["node", "vmid", "snapname"],
    },
  },

  // Task Management
  {
    name: "pve_list_tasks",
    description: "List recent tasks",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
        limit: { type: "number", description: "Max tasks to return" },
      },
      required: ["node"],
    },
  },
  {
    name: "pve_get_task_status",
    description: "Get status of a task",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
        upid: { type: "string", description: "Task UPID" },
      },
      required: ["node", "upid"],
    },
  },

  // Network
  {
    name: "pve_list_networks",
    description: "List network interfaces on a node",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
      },
      required: ["node"],
    },
  },

  // Terraform Integration
  {
    name: "pve_generate_terraform",
    description: "Generate Terraform configuration for a VM",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Node name" },
        vmid: { type: "number", description: "VM ID to export as Terraform" },
      },
      required: ["node", "vmid"],
    },
  },
  {
    name: "pve_generate_terraform_provider",
    description: "Generate Terraform provider configuration for this Proxmox cluster",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// Tool handler implementations
async function handleTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      // Cluster & Node Management
      case "pve_get_cluster_status": {
        const response = await pveClient.get("/cluster/status");
        return JSON.stringify(response.data.data, null, 2);
      }

      case "pve_list_nodes": {
        const response = await pveClient.get("/nodes");
        return JSON.stringify(response.data.data, null, 2);
      }

      case "pve_get_node_status": {
        const response = await pveClient.get(`/nodes/${args.node}/status`);
        return JSON.stringify(response.data.data, null, 2);
      }

      case "pve_get_node_resources": {
        const response = await pveClient.get(`/nodes/${args.node}/status`);
        const data = response.data.data;
        const result = {
          cpu: {
            usage: (data.cpu * 100).toFixed(2) + "%",
            cores: data.cpuinfo?.cores,
            model: data.cpuinfo?.model,
          },
          memory: {
            used: formatBytes(data.memory?.used),
            total: formatBytes(data.memory?.total),
            free: formatBytes(data.memory?.free),
            usagePercent: ((data.memory?.used / data.memory?.total) * 100).toFixed(2) + "%",
          },
          swap: {
            used: formatBytes(data.swap?.used),
            total: formatBytes(data.swap?.total),
          },
          uptime: formatUptime(data.uptime),
          loadavg: data.loadavg,
        };
        return JSON.stringify(result, null, 2);
      }

      // VM Management
      case "pve_list_vms": {
        if (args.node) {
          const response = await pveClient.get(`/nodes/${args.node}/qemu`);
          return JSON.stringify(response.data.data, null, 2);
        } else {
          const response = await pveClient.get("/cluster/resources", { params: { type: "vm" } });
          return JSON.stringify(response.data.data, null, 2);
        }
      }

      case "pve_get_vm_status": {
        const response = await pveClient.get(`/nodes/${args.node}/qemu/${args.vmid}/status/current`);
        return JSON.stringify(response.data.data, null, 2);
      }

      case "pve_get_vm_config": {
        const response = await pveClient.get(`/nodes/${args.node}/qemu/${args.vmid}/config`);
        return JSON.stringify(response.data.data, null, 2);
      }

      case "pve_start_vm": {
        const response = await pveClient.post(`/nodes/${args.node}/qemu/${args.vmid}/status/start`);
        return `VM ${args.vmid} start initiated. Task: ${response.data.data}`;
      }

      case "pve_stop_vm": {
        const endpoint = args.force ? "stop" : "shutdown";
        const response = await pveClient.post(`/nodes/${args.node}/qemu/${args.vmid}/status/${endpoint}`);
        return `VM ${args.vmid} ${endpoint} initiated. Task: ${response.data.data}`;
      }

      case "pve_reboot_vm": {
        const response = await pveClient.post(`/nodes/${args.node}/qemu/${args.vmid}/status/reboot`);
        return `VM ${args.vmid} reboot initiated. Task: ${response.data.data}`;
      }

      case "pve_suspend_vm": {
        const response = await pveClient.post(`/nodes/${args.node}/qemu/${args.vmid}/status/suspend`);
        return `VM ${args.vmid} suspend initiated. Task: ${response.data.data}`;
      }

      case "pve_resume_vm": {
        const response = await pveClient.post(`/nodes/${args.node}/qemu/${args.vmid}/status/resume`);
        return `VM ${args.vmid} resume initiated. Task: ${response.data.data}`;
      }

      case "pve_clone_vm": {
        const data: any = { newid: args.newid };
        if (args.name) data.name = args.name;
        if (args.full) data.full = 1;
        if (args.target) data.target = args.target;
        const response = await pveClient.post(`/nodes/${args.node}/qemu/${args.vmid}/clone`, data);
        return `VM ${args.vmid} clone to ${args.newid} initiated. Task: ${response.data.data}`;
      }

      case "pve_delete_vm": {
        const params: any = {};
        if (args.purge) params.purge = 1;
        const response = await pveClient.delete(`/nodes/${args.node}/qemu/${args.vmid}`, { params });
        return `VM ${args.vmid} deletion initiated. Task: ${response.data.data}`;
      }

      case "pve_migrate_vm": {
        const data: any = { target: args.target };
        if (args.online) data.online = 1;
        const response = await pveClient.post(`/nodes/${args.node}/qemu/${args.vmid}/migrate`, data);
        return `VM ${args.vmid} migration to ${args.target} initiated. Task: ${response.data.data}`;
      }

      // Container Management
      case "pve_list_containers": {
        if (args.node) {
          const response = await pveClient.get(`/nodes/${args.node}/lxc`);
          return JSON.stringify(response.data.data, null, 2);
        } else {
          const response = await pveClient.get("/cluster/resources", { params: { type: "lxc" } });
          return JSON.stringify(response.data.data, null, 2);
        }
      }

      case "pve_get_container_status": {
        const response = await pveClient.get(`/nodes/${args.node}/lxc/${args.vmid}/status/current`);
        return JSON.stringify(response.data.data, null, 2);
      }

      case "pve_start_container": {
        const response = await pveClient.post(`/nodes/${args.node}/lxc/${args.vmid}/status/start`);
        return `Container ${args.vmid} start initiated. Task: ${response.data.data}`;
      }

      case "pve_stop_container": {
        const response = await pveClient.post(`/nodes/${args.node}/lxc/${args.vmid}/status/stop`);
        return `Container ${args.vmid} stop initiated. Task: ${response.data.data}`;
      }

      // Storage Management
      case "pve_list_storage": {
        if (args.node) {
          const response = await pveClient.get(`/nodes/${args.node}/storage`);
          return JSON.stringify(response.data.data, null, 2);
        } else {
          const response = await pveClient.get("/storage");
          return JSON.stringify(response.data.data, null, 2);
        }
      }

      case "pve_get_storage_content": {
        const params: any = {};
        if (args.content) params.content = args.content;
        const response = await pveClient.get(`/nodes/${args.node}/storage/${args.storage}/content`, { params });
        return JSON.stringify(response.data.data, null, 2);
      }

      // Backup Management
      case "pve_list_backups": {
        const params: any = { content: "backup" };
        if (args.vmid) params.vmid = args.vmid;
        const response = await pveClient.get(`/nodes/${args.node}/storage/${args.storage}/content`, { params });
        return JSON.stringify(response.data.data, null, 2);
      }

      case "pve_create_backup": {
        const data: any = {
          vmid: args.vmid,
          storage: args.storage,
          mode: args.mode || "snapshot",
        };
        if (args.compress) data.compress = args.compress;
        const response = await pveClient.post(`/nodes/${args.node}/vzdump`, data);
        return `Backup of ${args.vmid} initiated. Task: ${response.data.data}`;
      }

      // Snapshot Management
      case "pve_list_snapshots": {
        const response = await pveClient.get(`/nodes/${args.node}/qemu/${args.vmid}/snapshot`);
        return JSON.stringify(response.data.data, null, 2);
      }

      case "pve_create_snapshot": {
        const data: any = { snapname: args.snapname };
        if (args.description) data.description = args.description;
        if (args.vmstate) data.vmstate = 1;
        const response = await pveClient.post(`/nodes/${args.node}/qemu/${args.vmid}/snapshot`, data);
        return `Snapshot '${args.snapname}' creation initiated. Task: ${response.data.data}`;
      }

      case "pve_rollback_snapshot": {
        const response = await pveClient.post(`/nodes/${args.node}/qemu/${args.vmid}/snapshot/${args.snapname}/rollback`);
        return `Rollback to '${args.snapname}' initiated. Task: ${response.data.data}`;
      }

      case "pve_delete_snapshot": {
        const response = await pveClient.delete(`/nodes/${args.node}/qemu/${args.vmid}/snapshot/${args.snapname}`);
        return `Snapshot '${args.snapname}' deletion initiated. Task: ${response.data.data}`;
      }

      // Task Management
      case "pve_list_tasks": {
        const params: any = {};
        if (args.limit) params.limit = args.limit;
        const response = await pveClient.get(`/nodes/${args.node}/tasks`, { params });
        return JSON.stringify(response.data.data, null, 2);
      }

      case "pve_get_task_status": {
        const response = await pveClient.get(`/nodes/${args.node}/tasks/${args.upid}/status`);
        return JSON.stringify(response.data.data, null, 2);
      }

      // Network
      case "pve_list_networks": {
        const response = await pveClient.get(`/nodes/${args.node}/network`);
        return JSON.stringify(response.data.data, null, 2);
      }

      // Terraform Integration
      case "pve_generate_terraform": {
        const configResp = await pveClient.get(`/nodes/${args.node}/qemu/${args.vmid}/config`);
        const config = configResp.data.data;

        const terraform = generateTerraformVM(args.node as string, args.vmid as number, config);
        return terraform;
      }

      case "pve_generate_terraform_provider": {
        const terraform = `# Proxmox Terraform Provider Configuration
# Generated from MCP Server

terraform {
  required_providers {
    proxmox = {
      source  = "Telmate/proxmox"
      version = ">=2.9.0"
    }
  }
}

provider "proxmox" {
  pm_api_url          = "${PROXMOX_URL}/api2/json"
  pm_api_token_id     = "${PROXMOX_USER}!${PROXMOX_TOKEN_ID}"
  pm_api_token_secret = var.proxmox_api_token_secret
  pm_tls_insecure     = true  # Set to false if using valid SSL cert
}

variable "proxmox_api_token_secret" {
  description = "Proxmox API token secret"
  type        = string
  sensitive   = true
}

# Usage:
# export TF_VAR_proxmox_api_token_secret="your-token-secret"
# terraform init
# terraform plan
`;
        return terraform;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    if (error.response) {
      throw new Error(`Proxmox API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

// Helper functions
function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

function generateTerraformVM(node: string, vmid: number, config: any): string {
  // Parse network config
  let networkBlock = "";
  for (let i = 0; i <= 10; i++) {
    const netKey = i === 0 ? "net0" : `net${i}`;
    if (config[netKey]) {
      const net = config[netKey];
      const bridge = net.match(/bridge=([^,]+)/)?.[1] || "vmbr0";
      networkBlock += `
  network {
    model  = "virtio"
    bridge = "${bridge}"
  }
`;
    }
  }

  // Parse disk config
  let diskBlock = "";
  const scsiMatch = config.scsi0?.match(/([^:]+):([^,]+)/);
  if (scsiMatch) {
    const storage = scsiMatch[1];
    const sizeMatch = config.scsi0.match(/size=(\d+)G/);
    const size = sizeMatch ? sizeMatch[1] : "32";
    diskBlock = `
  disk {
    type    = "scsi"
    storage = "${storage}"
    size    = "${size}G"
  }
`;
  }

  return `# Terraform configuration for VM ${vmid}
# Generated from Proxmox MCP Server

resource "proxmox_vm_qemu" "vm_${vmid}" {
  name        = "${config.name || `vm-${vmid}`}"
  target_node = "${node}"
  vmid        = ${vmid}

  # Hardware
  cores   = ${config.cores || 1}
  sockets = ${config.sockets || 1}
  memory  = ${config.memory || 2048}

  # OS
  os_type = "cloud-init"  # Adjust based on your setup

  # Boot
  boot    = "${config.boot || "order=scsi0"}"
  agent   = ${config.agent ? 1 : 0}
${diskBlock}${networkBlock}
  # Lifecycle
  lifecycle {
    ignore_changes = [
      network,
    ]
  }
}

# Output
output "vm_${vmid}_ip" {
  value = proxmox_vm_qemu.vm_${vmid}.default_ipv4_address
}
`;
}

// Create and configure the MCP server
const server = new Server(
  {
    name: "proxmox-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Register tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleTool(name, args as Record<string, unknown>);
    return {
      content: [{ type: "text", text: result }],
    };
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  try {
    await initAuth();
    console.error("Proxmox authentication successful");

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Proxmox MCP server running");
  } catch (error: any) {
    console.error("Failed to start Proxmox MCP server:", error.message);
    process.exit(1);
  }
}

main().catch(console.error);
